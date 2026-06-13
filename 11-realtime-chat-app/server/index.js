const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("client/build"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = new Map();
const users = new Map();

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join_room", ({ username, room }) => {
    socket.join(room);
    users.set(socket.id, { username, room });

    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(username);

    io.to(room).emit("room_users", { room, users: [...rooms.get(room)] });
    socket.to(room).emit("user_joined", { username, timestamp: new Date().toISOString() });
  });

  socket.on("send_message", ({ room, message }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const payload = {
      id: uuidv4(),
      username: user.username,
      message,
      timestamp: new Date().toISOString(),
    };
    io.to(room).emit("receive_message", payload);
  });

  socket.on("typing", ({ room, username }) => {
    socket.to(room).emit("user_typing", { username });
  });

  socket.on("stop_typing", ({ room, username }) => {
    socket.to(room).emit("user_stopped_typing", { username });
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      const { username, room } = user;
      rooms.get(room)?.delete(username);
      io.to(room).emit("user_left", { username, timestamp: new Date().toISOString() });
      io.to(room).emit("room_users", { room, users: [...(rooms.get(room) || [])] });
      users.delete(socket.id);
    }
  });
});

app.get("/api/rooms", (_req, res) => {
  res.json({ rooms: [...rooms.keys()] });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Chat server running on port ${PORT}`));
