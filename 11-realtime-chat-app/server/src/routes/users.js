const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const presence = require("../sockets/presence");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const users = await User.find({ _id: { $ne: req.user.id } }, "username email color lastSeen").sort({ username: 1 }).limit(200);
    res.json(
      users.map((u) => ({
        _id: u._id,
        username: u.username,
        color: u.color,
        online: presence.isOnline(u._id.toString()),
        lastSeen: u.lastSeen,
      }))
    );
  })
);

module.exports = router;
