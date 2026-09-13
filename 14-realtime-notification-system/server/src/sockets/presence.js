// In-memory online-socket registry (one process). userId -> Set of socketIds,
// since the same user may have multiple tabs/devices connected at once.
const userSockets = new Map();

function addSocket(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function removeSocket(userId, socketId) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}

function isOnline(userId) {
  return userSockets.has(userId);
}

function onlineCount() {
  return userSockets.size;
}

module.exports = { addSocket, removeSocket, isOnline, onlineCount };
