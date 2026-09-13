const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", optionalAuth, async (req, res) => {
  const { title } = req.body || {};
  const docId = uuidv4().slice(0, 8).toUpperCase();
  const doc = await Document.create({
    docId,
    title: title || "Untitled document",
    ownerId: req.user ? req.user.id : undefined,
  });
  res.status(201).json({ docId: doc.docId, title: doc.title });
});

router.get("/mine", requireAuth, async (req, res) => {
  const docs = await Document.find({ ownerId: req.user.id }).sort({ lastEditedAt: -1 });
  res.json(docs.map((d) => ({ docId: d.docId, title: d.title, plainTextPreview: d.plainTextPreview, lastEditedAt: d.lastEditedAt })));
});

router.get("/:id", async (req, res) => {
  const doc = await Document.findOne({ docId: req.params.id });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json({ docId: doc.docId, title: doc.title, lastEditedAt: doc.lastEditedAt });
});

router.patch("/:id", requireAuth, async (req, res) => {
  const { title } = req.body || {};
  const doc = await Document.findOneAndUpdate({ docId: req.params.id }, { title }, { new: true });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json({ docId: doc.docId, title: doc.title });
});

router.get("/:id/versions", requireAuth, async (req, res) => {
  const versions = await DocumentVersion.find({ docId: req.params.id }).sort({ createdAt: -1 }).limit(50);
  res.json(
    versions.map((v) => ({
      id: v._id,
      label: v.label,
      plainTextPreview: v.plainTextPreview,
      createdAt: v.createdAt,
    }))
  );
});

module.exports = router;
