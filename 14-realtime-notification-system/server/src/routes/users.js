const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const users = await User.find({ _id: { $ne: req.user.id } }, "username email").sort({ username: 1 }).limit(200);
    res.json(users);
  })
);

router.patch(
  "/me/topics",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { topics } = req.body || {};
    if (!Array.isArray(topics)) return res.status(400).json({ error: "topics must be an array of strings" });

    const user = await User.findByIdAndUpdate(req.user.id, { topics }, { new: true });
    res.json(user);
  })
);

router.patch(
  "/me/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { emailNotifications } = req.body || {};
    const user = await User.findByIdAndUpdate(req.user.id, { emailNotifications: !!emailNotifications }, { new: true });
    res.json(user);
  })
);

module.exports = router;
