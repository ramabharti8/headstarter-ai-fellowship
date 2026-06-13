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

const documents = new Map();
const whiteboards = new Map();
const roomUsers = new Map();

io.on("connection", (socket) => {
  socket.on("join_document", ({ docId, username }) => {
    socket.join(docId);
    socket.data = { docId, username };

    if (!roomUsers.has(docId)) roomUsers.set(docId, new Map());
    roomUsers.get(docId).set(socket.id, { username, cursor: null });

    const content = documents.get(docId) || "";
    socket.emit("document_content", { content });

    io.to(docId).emit("room_users", { users: [...roomUsers.get(docId).values()] });
  });

  socket.on("document_change", ({ docId, delta, content }) => {
    documents.set(docId, content);
    socket.to(docId).emit("document_change", { delta, content, from: socket.id });
  });

  socket.on("cursor_move", ({ docId, position }) => {
    const usersMap = roomUsers.get(docId);
    if (usersMap?.has(socket.id)) {
      usersMap.get(socket.id).cursor = position;
    }
    socket.to(docId).emit("cursor_update", {
      userId: socket.id,
      username: socket.data.username,
      position,
    });
  });

  socket.on("join_whiteboard", ({ boardId, username }) => {
    socket.join(`wb:${boardId}`);
    if (!whiteboards.has(boardId)) whiteboards.set(boardId, []);
    socket.emit("whiteboard_state", { strokes: whiteboards.get(boardId) });
  });

  socket.on("draw_stroke", ({ boardId, stroke }) => {
    whiteboards.get(boardId)?.push(stroke);
    socket.to(`wb:${boardId}`).emit("draw_stroke", { stroke });
  });

  socket.on("clear_whiteboard", ({ boardId }) => {
    whiteboards.set(boardId, []);
    io.to(`wb:${boardId}`).emit("whiteboard_cleared");
  });

  socket.on("disconnect", () => {
    const { docId, username } = socket.data || {};
    if (docId && roomUsers.has(docId)) {
      roomUsers.get(docId).delete(socket.id);
      io.to(docId).emit("room_users", { users: [...roomUsers.get(docId).values()] });
    }
  });
});

app.post("/api/document", (_req, res) => {
  const docId = uuidv4();
  documents.set(docId, "");
  res.json({ docId });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => console.log(`Collaboration server running on port ${PORT}`));
