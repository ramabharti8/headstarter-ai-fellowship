const mongoose = require("mongoose");
const { verifySocketToken } = require("../middleware/auth");
const { getAccessibleRoom } = require("../lib/roomAccess");
const User = require("../models/User");
const Room = require("../models/Room");
const Message = require("../models/Message");
const presence = require("./presence");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("authenticate", async ({ token }) => {
      const authUser = verifySocketToken(token);
      if (!authUser) {
        socket.emit("auth_error", { message: "Invalid or expired session" });
        return;
      }

      socket.data.userId = authUser.id;
      socket.data.username = authUser.username;
      const wasOffline = !presence.isOnline(authUser.id);
      presence.addSocket(authUser.id, socket.id);
      socket.join(`user:${authUser.id}`);

      if (wasOffline) {
        io.emit("presence_update", { userId: authUser.id, online: true });
      }
      socket.emit("authenticated", { userId: authUser.id });
    });

    socket.on("join_room", async ({ roomId }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const room = await getAccessibleRoom(roomId, userId);
      if (!room) {
        socket.emit("room_error", { roomId, message: "Room not found or access denied" });
        return;
      }
      socket.join(`room:${roomId}`);
    });

    socket.on("leave_room", ({ roomId }) => {
      socket.leave(`room:${roomId}`);
    });

    socket.on("send_message", async ({ roomId, text, attachment }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      if (!text?.trim() && !attachment) return;

      const room = await getAccessibleRoom(roomId, userId);
      if (!room) {
        socket.emit("room_error", { roomId, message: "Room not found or access denied" });
        return;
      }

      const message = await Message.create({
        roomId,
        senderId: userId,
        text: (text || "").trim(),
        attachment: attachment || null,
        readBy: [userId],
      });
      await message.populate("senderId", "username color");

      await Room.findOneAndUpdate({ roomId }, { lastMessageAt: new Date() });

      io.to(`room:${roomId}`).emit("receive_message", message);
    });

    socket.on("typing", ({ roomId }) => {
      if (socket.data.username) socket.to(`room:${roomId}`).emit("user_typing", { roomId, username: socket.data.username });
    });

    socket.on("stop_typing", ({ roomId }) => {
      if (socket.data.username) socket.to(`room:${roomId}`).emit("user_stopped_typing", { roomId, username: socket.data.username });
    });

    socket.on("mark_read", async ({ roomId, messageId }) => {
      const userId = socket.data.userId;
      if (!userId || !mongoose.isValidObjectId(messageId)) return;
      try {
        await Message.updateOne({ _id: messageId, roomId }, { $addToSet: { readBy: userId } });
        socket.to(`room:${roomId}`).emit("read_receipt", { roomId, messageId, userId });
      } catch (err) {
        console.error("mark_read failed:", err.message);
      }
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (!userId) return;
      const wentOffline = presence.removeSocket(userId, socket.id);
      if (wentOffline) {
        const lastSeen = new Date();
        try {
          await User.findByIdAndUpdate(userId, { lastSeen });
        } catch (err) {
          console.error("Failed to persist lastSeen:", err.message);
        }
        io.emit("presence_update", { userId, online: false, lastSeen });
      }
    });
  });
}

module.exports = registerSocketHandlers;
