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
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Collection",
      default: null,
    },
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
    suggestions: [
      {
        category: { type: String, required: true },
        tip: { type: String, required: true },
        priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
      },
    ],
    order: {
      type: Number,
      default: 0,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

thumbnailSchema.index({ user: 1, deletedAt: 1 });

// Trashed thumbnails stay out of every query unless a caller opts in with
// .setOptions({ withDeleted: true }). Covers find, findOne, findOneAndUpdate,
// findOneAndDelete and populate — but not aggregate or updateMany, which
// filter on deletedAt explicitly at their call sites.
thumbnailSchema.pre(/^find/, function (next) {
  if (!this.getOptions().withDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

module.exports = mongoose.model("Thumbnail", thumbnailSchema);
