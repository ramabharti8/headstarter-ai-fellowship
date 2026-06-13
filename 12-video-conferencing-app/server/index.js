const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = new Map();

app.post("/api/room", (_req, res) => {
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  rooms.set(roomId, { participants: [], createdAt: new Date().toISOString() });
  res.json({ roomId });
});

app.get("/api/room/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(room);
});

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId, userId, username }) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { participants: [], createdAt: new Date().toISOString() });
    }
    const room = rooms.get(roomId);
    room.participants.push({ userId, username, socketId: socket.id });

    socket.to(roomId).emit("user_connected", { userId, username });
    socket.emit("existing_participants", {
      participants: room.participants.filter((p) => p.socketId !== socket.id),
    });
  });

  socket.on("offer", ({ roomId, targetId, offer }) => {
    socket.to(targetId).emit("offer", { fromId: socket.id, offer });
  });

  socket.on("answer", ({ targetId, answer }) => {
    socket.to(targetId).emit("answer", { fromId: socket.id, answer });
  });

  socket.on("ice_candidate", ({ targetId, candidate }) => {
    socket.to(targetId).emit("ice_candidate", { fromId: socket.id, candidate });
  });

  socket.on("screen_share_started", ({ roomId }) => {
    socket.to(roomId).emit("screen_share_started", { userId: socket.id });
  });

  socket.on("screen_share_stopped", ({ roomId }) => {
    socket.to(roomId).emit("screen_share_stopped", { userId: socket.id });
  });

  socket.on("toggle_audio", ({ roomId, muted }) => {
    socket.to(roomId).emit("participant_audio_toggled", { userId: socket.id, muted });
  });

  socket.on("toggle_video", ({ roomId, videoOff }) => {
    socket.to(roomId).emit("participant_video_toggled", { userId: socket.id, videoOff });
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, roomId) => {
      const before = room.participants.length;
      room.participants = room.participants.filter((p) => p.socketId !== socket.id);
      if (room.participants.length < before) {
        io.to(roomId).emit("user_disconnected", { socketId: socket.id });
      }
    });
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`Video server running on port ${PORT}`));
