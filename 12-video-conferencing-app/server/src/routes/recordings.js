const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Recording = require("../models/Recording");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "..", "uploads", "recordings");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${req.body.roomId || "room"}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) return cb(new Error("Only video files are allowed"));
    cb(null, true);
  },
});

router.post("/", requireAuth, upload.single("recording"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "roomId is required" });

  const recording = await Recording.create({
    roomId,
    uploadedBy: req.user.id,
    filename: req.file.filename,
    path: req.file.path,
    sizeBytes: req.file.size,
    mimeType: req.file.mimetype,
  });

  res.status(201).json({
    id: recording._id,
    roomId: recording.roomId,
    filename: recording.filename,
    sizeBytes: recording.sizeBytes,
    createdAt: recording.createdAt,
  });
});

router.get("/room/:roomId", requireAuth, async (req, res) => {
  const recordings = await Recording.find({ roomId: req.params.roomId }).sort({ createdAt: -1 });
  res.json(
    recordings.map((r) => ({
      id: r._id,
      filename: r.filename,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
    }))
  );
});

router.get("/:id/download", requireAuth, async (req, res) => {
  const recording = await Recording.findById(req.params.id);
  if (!recording) return res.status(404).json({ error: "Recording not found" });
  res.download(recording.path, recording.filename);
});

module.exports = router;
