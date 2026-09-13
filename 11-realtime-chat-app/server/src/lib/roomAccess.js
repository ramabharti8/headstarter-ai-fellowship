const Room = require("../models/Room");

/**
 * Public rooms are open to any authenticated user; DM rooms only to their two
 * members. Returns the Room document if access is allowed, otherwise null.
 */
async function getAccessibleRoom(roomId, userId) {
  const room = await Room.findOne({ roomId });
  if (!room) return null;
  if (room.type === "public") return room;
  if (room.type === "dm" && room.members.some((m) => m.toString() === userId)) return room;
  return null;
}

module.exports = { getAccessibleRoom };
