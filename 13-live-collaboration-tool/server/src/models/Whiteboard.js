const mongoose = require("mongoose");

const strokeSchema = new mongoose.Schema(
  {
    id: String,
    color: String,
    size: Number,
    points: [[Number]], // [[x,y], [x,y], ...]
  },
  { _id: false }
);

const whiteboardSchema = new mongoose.Schema(
  {
    boardId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Untitled board" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    strokes: { type: [strokeSchema], default: [] },
    lastEditedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Whiteboard", whiteboardSchema);
