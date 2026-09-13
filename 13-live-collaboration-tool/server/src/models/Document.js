const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    docId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Untitled document" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    // Encoded Yjs update (Y.encodeStateAsUpdate) representing the full CRDT state.
    yState: { type: Buffer, default: null },
    plainTextPreview: { type: String, default: "" },
    lastEditedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
