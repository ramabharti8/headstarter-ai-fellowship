const Y = require("yjs");
const { verifySocketToken } = require("../middleware/auth");
const docRooms = require("./docRooms");
const boardRooms = require("./boardRooms");

function presenceList(clientsMap) {
  return Array.from(clientsMap.values());
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    // ---------- Documents ----------

    socket.on("join_document", async ({ docId, username, token }) => {
      const authUser = verifySocketToken(token);
      const resolvedUsername = authUser?.username || username || "Guest";
      const color = socket.handshake.auth?.color || "#6d8bff";

      socket.data.docId = docId;
      socket.data.username = resolvedUsername;
      socket.join(`doc:${docId}`);

      const room = await docRooms.getOrCreateRoom(docId);
      room.clients.set(socket.id, { socketId: socket.id, username: resolvedUsername, color });
      docRooms.startAutoSnapshot(docId);

      const state = Y.encodeStateAsUpdate(room.ydoc);
      socket.emit("doc_sync", { state: Array.from(state) });
      io.to(`doc:${docId}`).emit("presence_update", { users: presenceList(room.clients) });
    });

    socket.on("doc_update", ({ docId, update }) => {
      const room = docRooms.rooms.get(docId);
      if (!room) return;
      Y.applyUpdate(room.ydoc, new Uint8Array(update));
      socket.to(`doc:${docId}`).emit("doc_update", { update });
      docRooms.schedulePersist(docId);
    });

    socket.on("cursor_move", ({ docId, position }) => {
      if (!docId) return;
      socket.to(`doc:${docId}`).emit("cursor_update", {
        socketId: socket.id,
        username: socket.data.username,
        position,
      });
    });

    socket.on("save_version", async ({ docId, label }, ack) => {
      try {
        const version = await docRooms.takeSnapshot(docId, { label: label || "manual" });
        ack?.({ ok: true, versionId: version?._id });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("restore_version", async ({ docId, versionId }) => {
      try {
        const state = await docRooms.restoreVersion(docId, versionId);
        io.to(`doc:${docId}`).emit("doc_sync", { state: Array.from(state) });
      } catch (err) {
        socket.emit("collab_error", { message: err.message });
      }
    });

    socket.on("leave_document", () => leaveDocument(socket, io));

    // ---------- Whiteboards ----------

    socket.on("join_whiteboard", async ({ boardId, username, token }) => {
      const authUser = verifySocketToken(token);
      const resolvedUsername = authUser?.username || username || "Guest";
      const color = socket.handshake.auth?.color || "#6d8bff";

      socket.data.boardId = boardId;
      socket.data.username = resolvedUsername;
      socket.join(`wb:${boardId}`);

      const room = await boardRooms.getOrCreateRoom(boardId);
      room.clients.set(socket.id, { socketId: socket.id, username: resolvedUsername, color });

      socket.emit("whiteboard_state", { strokes: room.strokes });
      io.to(`wb:${boardId}`).emit("presence_update", { users: presenceList(room.clients) });
    });

    socket.on("draw_stroke", ({ boardId, stroke }) => {
      const room = boardRooms.rooms.get(boardId);
      if (!room) return;
      room.strokes.push(stroke);
      socket.to(`wb:${boardId}`).emit("draw_stroke", { stroke });
      boardRooms.schedulePersist(boardId);
    });

    socket.on("clear_whiteboard", ({ boardId }) => {
      const room = boardRooms.rooms.get(boardId);
      if (!room) return;
      room.strokes = [];
      io.to(`wb:${boardId}`).emit("whiteboard_cleared");
      boardRooms.schedulePersist(boardId);
    });

    socket.on("pointer_move", ({ boardId, position }) => {
      if (!boardId) return;
      socket.to(`wb:${boardId}`).emit("pointer_update", {
        socketId: socket.id,
        username: socket.data.username,
        position,
      });
    });

    socket.on("leave_whiteboard", () => leaveWhiteboard(socket, io));

    socket.on("disconnect", () => {
      leaveDocument(socket, io);
      leaveWhiteboard(socket, io);
    });
  });

  function leaveDocument(socket, ioRef) {
    const docId = socket.data.docId;
    if (!docId) return;
    docRooms.removeClient(docId, socket.id);
    const room = docRooms.rooms.get(docId);
    (ioRef || socket).to(`doc:${docId}`).emit("presence_update", { users: room ? presenceList(room.clients) : [] });
    socket.leave(`doc:${docId}`);
    socket.data.docId = null;
  }

  function leaveWhiteboard(socket, ioRef) {
    const boardId = socket.data.boardId;
    if (!boardId) return;
    boardRooms.removeClient(boardId, socket.id);
    const room = boardRooms.rooms.get(boardId);
    (ioRef || socket).to(`wb:${boardId}`).emit("presence_update", { users: room ? presenceList(room.clients) : [] });
    socket.leave(`wb:${boardId}`);
    socket.data.boardId = null;
  }
}

module.exports = registerSocketHandlers;
