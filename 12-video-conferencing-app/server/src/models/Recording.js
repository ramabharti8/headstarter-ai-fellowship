const mongoose = require("mongoose");

const recordingSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Recording", recordingSchema);
