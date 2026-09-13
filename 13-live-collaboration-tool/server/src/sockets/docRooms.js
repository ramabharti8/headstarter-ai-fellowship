const Y = require("yjs");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");

const PERSIST_INTERVAL_MS = Number(process.env.PERSIST_INTERVAL_MS || 5000);
const SNAPSHOT_INTERVAL_MS = Number(process.env.SNAPSHOT_INTERVAL_MS || 120000);

// docId -> { ydoc, clients: Map<socketId, {userId, username, color}>, persistTimer, snapshotTimer, dirty }
const rooms = new Map();

function plainTextOf(ydoc) {
  return ydoc.getText("content").toString();
}

async function getOrCreateRoom(docId) {
  let room = rooms.get(docId);
  if (room) return room;

  const ydoc = new Y.Doc();
  const stored = await Document.findOne({ docId });
  if (stored?.yState) {
    Y.applyUpdate(ydoc, stored.yState);
  } else {
    await Document.findOneAndUpdate(
      { docId },
      { $setOnInsert: { docId, title: "Untitled document" } },
      { upsert: true }
    );
  }

  room = { ydoc, clients: new Map(), persistTimer: null, snapshotTimer: null, dirty: false };
  rooms.set(docId, room);
  return room;
}

function schedulePersist(docId) {
  const room = rooms.get(docId);
  if (!room) return;
  room.dirty = true;
  if (room.persistTimer) return;

  room.persistTimer = setTimeout(async () => {
    room.persistTimer = null;
    if (!room.dirty) return;
    room.dirty = false;
    try {
      const yState = Buffer.from(Y.encodeStateAsUpdate(room.ydoc));
      const plainTextPreview = plainTextOf(room.ydoc).slice(0, 500);
      await Document.findOneAndUpdate(
        { docId },
        { yState, plainTextPreview, lastEditedAt: new Date() },
        { upsert: true }
      );
    } catch (err) {
      console.error(`Failed to persist document ${docId}:`, err.message);
    }
  }, PERSIST_INTERVAL_MS);
}

async function takeSnapshot(docId, { label = "manual", userId } = {}) {
  const room = rooms.get(docId);
  if (!room) return null;
  const yState = Buffer.from(Y.encodeStateAsUpdate(room.ydoc));
  const plainTextPreview = plainTextOf(room.ydoc).slice(0, 500);
  const version = await DocumentVersion.create({ docId, yState, plainTextPreview, label, createdBy: userId || undefined });
  return version;
}

function startAutoSnapshot(docId) {
  const room = rooms.get(docId);
  if (!room || room.snapshotTimer) return;
  room.snapshotTimer = setInterval(() => {
    if (room.clients.size > 0 && room.dirty) {
      takeSnapshot(docId, { label: "auto" }).catch((err) => console.error("Auto-snapshot failed:", err.message));
    }
  }, SNAPSHOT_INTERVAL_MS);
}

async function restoreVersion(docId, versionId) {
  const room = await getOrCreateRoom(docId);
  const version = await DocumentVersion.findById(versionId);
  if (!version || version.docId !== docId) throw new Error("Version not found");

  // Replace room content with the snapshot: build a fresh doc from the version
  // and diff it in as a single update so all connected clients converge via CRDT merge.
  const restoredDoc = new Y.Doc();
  Y.applyUpdate(restoredDoc, version.yState);

  const restoredText = restoredDoc.getText("content").toString();
  const ytext = room.ydoc.getText("content");
  room.ydoc.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, restoredText);
  });

  schedulePersist(docId);
  return Y.encodeStateAsUpdate(room.ydoc);
}

function removeClient(docId, socketId) {
  const room = rooms.get(docId);
  if (!room) return;
  room.clients.delete(socketId);
  if (room.clients.size === 0) {
    clearInterval(room.snapshotTimer);
    room.snapshotTimer = null;
    // Keep the Y.Doc warm in memory briefly isn't necessary; next join reloads from Mongo.
  }
}

module.exports = {
  rooms,
  getOrCreateRoom,
  schedulePersist,
  takeSnapshot,
  startAutoSnapshot,
  restoreVersion,
  removeClient,
};
