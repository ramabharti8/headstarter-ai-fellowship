const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const { dispatchNotification } = require("../lib/dispatch");
const { getRedis } = require("../config/redis");

const router = express.Router();

const DEFAULT_TOPICS = (process.env.DEFAULT_TOPICS || "orders,alerts,marketing,system").split(",").map((t) => t.trim());

router.get("/topics", requireAuth, (_req, res) => {
  res.json({ topics: DEFAULT_TOPICS });
});

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const notifications = await Notification.find({ recipientId: req.user.id }).sort({ createdAt: -1 }).limit(limit);
    res.json(notifications);
  })
);

router.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ recipientId: req.user.id, read: false });
    res.json({ count });
  })
);

router.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid notification id" });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    res.json(notification);
  })
);

router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ recipientId: req.user.id, read: false }, { read: true });
    res.json({ ok: true });
  })
);

router.post(
  "/send",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { targetType, targetUserId, topic, title, message, type = "info", priority = "normal", channels } = req.body || {};

    if (!["user", "topic", "broadcast"].includes(targetType)) {
      return res.status(400).json({ error: "targetType must be 'user', 'topic' or 'broadcast'" });
    }
    if (targetType === "user" && !mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ error: "targetUserId must be a valid user id" });
    }
    if (targetType === "topic" && !topic) return res.status(400).json({ error: "topic is required" });
    if (!title || !message) return res.status(400).json({ error: "title and message are required" });

    const io = req.app.get("io");
    const result = await dispatchNotification(io, {
      senderId: req.user.id,
      targetType,
      targetUserId,
      topic,
      title,
      message,
      type,
      priority,
      channels: Array.isArray(channels) && channels.length ? channels : ["inapp"],
    });

    res.status(201).json(result);
  })
);

router.get(
  "/delivery/:notificationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const redis = getRedis();
      const data = await redis.hgetall(`delivery:${req.params.notificationId}`);
      if (!Object.keys(data).length) return res.status(404).json({ error: "Not found" });
      res.json(data);
    } catch (err) {
      res.status(503).json({ error: "Delivery tracking store unavailable" });
    }
  })
);

module.exports = router;
