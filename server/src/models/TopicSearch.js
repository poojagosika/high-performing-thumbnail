const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true },
    title: { type: String, default: "" },
    channelTitle: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    viewsPerDay: { type: Number, default: 0 },
    thumbnailUrl: { type: String, default: "" },
    duration: { type: String, default: "" },
  },
  { _id: false },
);

const CACHE_TTL_DAYS = 7;

const topicSearchSchema = new mongoose.Schema(
  {
    query: { type: String, required: true, unique: true },
    results: { type: [candidateSchema], default: [] },
    source: { type: String, enum: ["youtube", "fixture"], default: "youtube" },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

topicSearchSchema.index(
  { fetchedAt: 1 },
  { expireAfterSeconds: CACHE_TTL_DAYS * 24 * 60 * 60 },
);

module.exports = mongoose.model("TopicSearch", topicSearchSchema);
module.exports.candidateSchema = candidateSchema;
module.exports.CACHE_TTL_DAYS = CACHE_TTL_DAYS;
