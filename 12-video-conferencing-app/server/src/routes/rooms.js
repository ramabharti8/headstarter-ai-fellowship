const express = require("express");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const Room = require("../models/Room");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", optionalAuth, async (req, res) => {
  try {
    const { name, password } = req.body || {};
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const room = await Room.create({
      roomId,
      name: name || "",
      passwordHash,
      createdBy: req.user ? req.user.id : undefined,
    });
    res.status(201).json({ roomId: room.roomId, name: room.name, hasPassword: !!passwordHash });
  } catch (err) {
    res.status(500).json({ error: "Failed to create room" });
  }
});

router.get("/:id", async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id.toUpperCase() });
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ roomId: room.roomId, name: room.name, hasPassword: !!room.passwordHash, isActive: room.isActive });
});

router.post("/:id/verify", async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id.toUpperCase() });
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!room.passwordHash) return res.json({ ok: true });

  const { password } = req.body || {};
  const ok = password ? await bcrypt.compare(password, room.passwordHash) : false;
  if (!ok) return res.status(403).json({ ok: false, error: "Incorrect room password" });
  res.json({ ok: true });
});

module.exports = router;
