const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const Room = require("../models/Room");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const presence = require("../sockets/presence");

const router = express.Router();

function sortedPair(a, b) {
  return [a, b].sort();
}

router.get(
  "/public",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rooms = await Room.find({ type: "public" }).sort({ name: 1 });
    res.json(rooms);
  })
);

router.post(
  "/public",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

    const existing = await Room.findOne({ type: "public", name: name.trim() });
    if (existing) return res.status(200).json(existing); // idempotent: joining an existing room by name

    const room = await Room.create({ roomId: uuidv4().slice(0, 8), type: "public", name: name.trim(), createdBy: req.user.id });
    res.status(201).json(room);
  })
);

router.get(
  "/dms",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rooms = await Room.find({ type: "dm", members: req.user.id })
      .populate("members", "username color")
      .sort({ lastMessageAt: -1 });

    const shaped = rooms.map((r) => {
      const other = r.members.find((m) => m._id.toString() !== req.user.id);
      return {
        roomId: r.roomId,
        type: "dm",
        otherUser: other ? { _id: other._id, username: other.username, color: other.color, online: presence.isOnline(other._id.toString()) } : null,
        lastMessageAt: r.lastMessageAt,
      };
    });
    res.json(shaped);
  })
);

router.post(
  "/dms/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: "Invalid user id" });
    if (req.params.userId === req.user.id) return res.status(400).json({ error: "Cannot DM yourself" });

    const otherUser = await User.findById(req.params.userId);
    if (!otherUser) return res.status(404).json({ error: "User not found" });

    const [a, b] = sortedPair(req.user.id, req.params.userId);
    let room = await Room.findOne({ type: "dm", members: { $all: [a, b], $size: 2 } });
    if (!room) {
      room = await Room.create({ roomId: uuidv4().slice(0, 8), type: "dm", members: [a, b] });
    }
    res.json({ roomId: room.roomId });
  })
);

module.exports = router;
