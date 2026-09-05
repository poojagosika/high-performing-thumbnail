const mongoose = require("mongoose");
const { candidateSchema } = require("./TopicSearch");

const projectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    description: { type: String, default: "", trim: true },
    searchQuery: { type: String, required: true },
    source: { type: String, enum: ["youtube", "fixture"], default: "youtube" },
    candidates: { type: [candidateSchema], default: [] },
    chosenVideoId: { type: String, default: null },
    referenceStyle: { type: mongoose.Schema.Types.Mixed, default: null },
    uploadUrl: { type: String, default: null },
    gradedUrl: { type: String, default: null },
    matchReport: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Project", projectSchema);
