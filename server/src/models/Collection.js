const mongoose = require("mongoose");

const collectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    color: {
      type: String,
      default: "#6366f1",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

collectionSchema.index({ user: 1, order: 1 });

module.exports = mongoose.model("Collection", collectionSchema);
