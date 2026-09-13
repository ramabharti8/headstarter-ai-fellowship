// In-memory online-socket registry. userId -> Set of socketIds (multiple
// tabs/devices per user are supported).
const userSockets = new Map();

function addSocket(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function removeSocket(userId, socketId) {
  const set = userSockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  const wentOffline = set.size === 0;
  if (wentOffline) userSockets.delete(userId);
  return wentOffline;
}

function isOnline(userId) {
  return userSockets.has(userId);
}

function onlineUserIds() {
  return Array.from(userSockets.keys());
}

module.exports = { addSocket, removeSocket, isOnline, onlineUserIds };
