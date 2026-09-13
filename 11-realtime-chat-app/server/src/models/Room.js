const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["public", "dm"], required: true },
    name: { type: String, default: "" }, // public rooms only
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // dm rooms: exactly 2
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A DM room is unique per unordered pair of members.
roomSchema.index({ type: 1, members: 1 });

module.exports = mongoose.model("Room", roomSchema);
