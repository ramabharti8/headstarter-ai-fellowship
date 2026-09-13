const Whiteboard = require("../models/Whiteboard");

const PERSIST_INTERVAL_MS = Number(process.env.PERSIST_INTERVAL_MS || 5000);

// boardId -> { strokes: [], clients: Map<socketId,{username,color}>, persistTimer, dirty }
const rooms = new Map();

async function getOrCreateRoom(boardId) {
  let room = rooms.get(boardId);
  if (room) return room;

  const stored = await Whiteboard.findOne({ boardId });
  if (!stored) {
    await Whiteboard.findOneAndUpdate({ boardId }, { $setOnInsert: { boardId, title: "Untitled board" } }, { upsert: true });
  }

  room = { strokes: stored?.strokes || [], clients: new Map(), persistTimer: null, dirty: false };
  rooms.set(boardId, room);
  return room;
}

function schedulePersist(boardId) {
  const room = rooms.get(boardId);
  if (!room) return;
  room.dirty = true;
  if (room.persistTimer) return;

  room.persistTimer = setTimeout(async () => {
    room.persistTimer = null;
    if (!room.dirty) return;
    room.dirty = false;
    try {
      await Whiteboard.findOneAndUpdate(
        { boardId },
        { strokes: room.strokes, lastEditedAt: new Date() },
        { upsert: true }
      );
    } catch (err) {
      console.error(`Failed to persist whiteboard ${boardId}:`, err.message);
    }
  }, PERSIST_INTERVAL_MS);
}

function removeClient(boardId, socketId) {
  const room = rooms.get(boardId);
  if (!room) return;
  room.clients.delete(socketId);
}

module.exports = { rooms, getOrCreateRoom, schedulePersist, removeClient };
