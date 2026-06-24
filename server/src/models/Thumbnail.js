const mongoose = require("mongoose");

const thumbnailSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Untitled",
    },
    imageUrl: {
      type: String,
      required: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    ctr: {
      type: Number,
      min: 0,
      default: null,
    },
    analysis: {
      composition: { type: Number, min: 0, max: 100, default: null },
      colorBalance: { type: Number, min: 0, max: 100, default: null },
      textReadability: { type: Number, min: 0, max: 100, default: null },
      emotionalImpact: { type: Number, min: 0, max: 100, default: null },
    },
    tags: [String],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Thumbnail", thumbnailSchema);
