const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Whiteboard = require("../models/Whiteboard");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", optionalAuth, async (req, res) => {
  const { title } = req.body || {};
  const boardId = uuidv4().slice(0, 8).toUpperCase();
  const board = await Whiteboard.create({
    boardId,
    title: title || "Untitled board",
    ownerId: req.user ? req.user.id : undefined,
  });
  res.status(201).json({ boardId: board.boardId, title: board.title });
});

router.get("/mine", requireAuth, async (req, res) => {
  const boards = await Whiteboard.find({ ownerId: req.user.id }).sort({ lastEditedAt: -1 });
  res.json(boards.map((b) => ({ boardId: b.boardId, title: b.title, lastEditedAt: b.lastEditedAt, strokeCount: b.strokes.length })));
});

router.get("/:id", async (req, res) => {
  const board = await Whiteboard.findOne({ boardId: req.params.id });
  if (!board) return res.status(404).json({ error: "Whiteboard not found" });
  res.json({ boardId: board.boardId, title: board.title, lastEditedAt: board.lastEditedAt });
});

module.exports = router;
