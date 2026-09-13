const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    notificationId: { type: String, required: true, index: true }, // shared across fan-out copies of one send
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    targetType: { type: String, enum: ["user", "topic", "broadcast"], required: true },
    topic: { type: String, default: null },
    channels: { type: [String], default: ["inapp"] },
    read: { type: Boolean, default: false },
    delivered: { type: Boolean, default: false }, // true if pushed live over a socket at send time
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
