const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    passwordHash: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    isActive: { type: Boolean, default: true },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
