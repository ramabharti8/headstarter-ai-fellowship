const express = require("express");
const Message = require("../models/Message");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const { getAccessibleRoom } = require("../lib/roomAccess");

const router = express.Router();

router.get(
  "/:roomId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const room = await getAccessibleRoom(req.params.roomId, req.user.id);
    if (!room) return res.status(403).json({ error: "You don't have access to this room" });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const query = { roomId: req.params.roomId };
    if (req.query.before) query.createdAt = { $lt: new Date(req.query.before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "username color");

    res.json(messages.reverse());
  })
);

module.exports = router;
