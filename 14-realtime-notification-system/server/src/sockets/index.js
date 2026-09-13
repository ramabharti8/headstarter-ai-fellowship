const mongoose = require("mongoose");
const { verifySocketToken } = require("../middleware/auth");
const Notification = require("../models/Notification");
const presence = require("./presence");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("authenticate", ({ token }) => {
      const authUser = verifySocketToken(token);
      if (!authUser) {
        socket.emit("auth_error", { message: "Invalid or expired session" });
        return;
      }

      socket.data.userId = authUser.id;
      presence.addSocket(authUser.id, socket.id);
      socket.join(`user:${authUser.id}`);
      socket.emit("authenticated", { userId: authUser.id });
    });

    socket.on("acknowledge", async ({ id }) => {
      const userId = socket.data.userId;
      if (!userId || !id || !mongoose.isValidObjectId(id)) return;
      try {
        await Notification.findOneAndUpdate({ _id: id, recipientId: userId }, { read: true });
        socket.emit("ack_confirmed", { id });
      } catch (err) {
        console.error("acknowledge failed:", err.message);
      }
    });

    socket.on("disconnect", () => {
      if (socket.data.userId) presence.removeSocket(socket.data.userId, socket.id);
    });
  });
}

module.exports = registerSocketHandlers;
