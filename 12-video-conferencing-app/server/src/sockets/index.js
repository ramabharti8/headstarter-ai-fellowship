const jwt = require("jsonwebtoken");
const Room = require("../models/Room");

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { participants: new Map() });
  }
  return rooms.get(roomId);
}

function usernameFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.username;
  } catch {
    return null;
  }
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("join_room", async ({ roomId, username, token }) => {
      const resolvedUsername = usernameFromToken(token) || username || "Guest";
      roomId = String(roomId).toUpperCase();
      socket.data.roomId = roomId;
      socket.data.username = resolvedUsername;

      socket.join(roomId);
      const room = getRoom(roomId);

      const existing = Array.from(room.participants.entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, p]) => ({ socketId: id, username: p.username }));

      room.participants.set(socket.id, { username: resolvedUsername, muted: false, videoOff: false });

      socket.emit("existing_participants", { participants: existing });
      socket.to(roomId).emit("user_connected", { socketId: socket.id, username: resolvedUsername });

      try {
        await Room.findOneAndUpdate({ roomId }, { lastActiveAt: new Date() });
      } catch {
        /* room may not be DB-backed (e.g. ad-hoc room) */
      }
    });

    // WebRTC mesh signaling: every message is targeted at one peer (targetId)
    socket.on("offer", ({ targetId, offer }) => {
      socket.to(targetId).emit("offer", { fromId: socket.id, offer });
    });

    socket.on("answer", ({ targetId, answer }) => {
      socket.to(targetId).emit("answer", { fromId: socket.id, answer });
    });

    socket.on("ice_candidate", ({ targetId, candidate }) => {
      socket.to(targetId).emit("ice_candidate", { fromId: socket.id, candidate });
    });

    socket.on("screen_share_started", () => {
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit("screen_share_started", { socketId: socket.id });
    });

    socket.on("screen_share_stopped", () => {
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit("screen_share_stopped", { socketId: socket.id });
    });

    socket.on("toggle_audio", ({ muted }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      const p = room.participants.get(socket.id);
      if (p) p.muted = muted;
      socket.to(roomId).emit("participant_audio_toggled", { socketId: socket.id, muted });
    });

    socket.on("toggle_video", ({ videoOff }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      const p = room.participants.get(socket.id);
      if (p) p.videoOff = videoOff;
      socket.to(roomId).emit("participant_video_toggled", { socketId: socket.id, videoOff });
    });

    socket.on("chat_message", ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !text) return;
      const message = {
        socketId: socket.id,
        username: socket.data.username,
        text: String(text).slice(0, 2000),
        sentAt: new Date().toISOString(),
      };
      io.to(roomId).emit("chat_message", message);
    });

    socket.on("reaction", ({ emoji }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !emoji) return;
      io.to(roomId).emit("reaction", { socketId: socket.id, username: socket.data.username, emoji });
    });

    socket.on("leave_room", () => handleLeave(socket));
    socket.on("disconnect", () => handleLeave(socket, io));
  });

  function handleLeave(socket, ioRef) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
      room.participants.delete(socket.id);
      if (room.participants.size === 0) rooms.delete(roomId);
    }
    const emitter = ioRef || socket;
    emitter.to(roomId).emit("user_disconnected", { socketId: socket.id });
    socket.leave(roomId);
    socket.data.roomId = null;
  }
}

module.exports = registerSocketHandlers;
