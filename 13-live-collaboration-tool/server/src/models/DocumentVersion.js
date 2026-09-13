const mongoose = require("mongoose");

const documentVersionSchema = new mongoose.Schema(
  {
    docId: { type: String, required: true, index: true },
    yState: { type: Buffer, required: true },
    plainTextPreview: { type: String, default: "" },
    label: { type: String, default: "" }, // e.g. "auto" or "manual save"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DocumentVersion", documentVersionSchema);
