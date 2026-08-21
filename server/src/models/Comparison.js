const mongoose = require("mongoose");

const comparisonSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    thumbnailA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Thumbnail",
      required: true,
    },
    thumbnailB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Thumbnail",
      required: true,
    },
    winner: {
      type: String,
      enum: ["A", "B", "tie", null],
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

comparisonSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Comparison", comparisonSchema);
