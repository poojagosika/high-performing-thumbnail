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
    starred: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    dailyStats: [
      {
        date: { type: String, required: true },
        views: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
      },
    ],
    notes: {
      type: String,
      default: "",
    },
    versions: [
      {
        imageUrl: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Thumbnail", thumbnailSchema);
