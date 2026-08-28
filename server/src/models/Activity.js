const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: [
      "uploaded",
      "edited",
      "deleted",
      "starred",
      "unstarred",
      "duplicated",
      "shared",
      "unshared",
      "reuploaded",
      "trashed",
      "restored",
      "purged",
      "logged",
    ],
    required: true,
  },
  thumbnailTitle: {
    type: String,
    required: true,
  },
  thumbnailId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

activitySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Activity", activitySchema);
