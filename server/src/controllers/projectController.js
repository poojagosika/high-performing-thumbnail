const Project = require("../models/Project");
const TopicSearch = require("../models/TopicSearch");
const {
  YoutubeError,
  buildQuery,
  searchTopic,
} = require("../config/youtube");

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const shape = (project) => ({
  id: project._id,
  title: project.title,
  tags: project.tags,
  description: project.description,
  searchQuery: project.searchQuery,
  source: project.source,
  candidates: project.candidates,
  chosenVideoId: project.chosenVideoId,
  uploadUrl: project.uploadUrl,
  gradedUrl: project.gradedUrl,
  matchReport: project.matchReport,
  createdAt: project.createdAt,
});

async function resolveTopic(query) {
  const cached = await TopicSearch.findOne({ query });

  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return { source: cached.source, results: cached.results, cached: true };
  }

  const fresh = await searchTopic(query);

  await TopicSearch.findOneAndUpdate(
    { query },
    { $set: { results: fresh.results, source: fresh.source, fetchedAt: new Date() } },
    { upsert: true },
  );

  return { ...fresh, cached: false };
}

const createProject = async (req, res) => {
  try {
    const { title, tags, description } = req.body;
    const searchQuery = buildQuery({ title, tags });

    if (!searchQuery) {
      return res.status(400).json({ message: "Title is required" });
    }

    const topic = await resolveTopic(searchQuery);

    const project = await Project.create({
      user: req.user._id,
      title,
      tags,
      description: description || "",
      searchQuery,
      source: topic.source,
      candidates: topic.results,
    });

    res.status(201).json({ project: shape(project), cached: topic.cached });
  } catch (error) {
    if (error instanceof YoutubeError) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(projects.map(shape));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const chooseReference = async (req, res) => {
  try {
    const { videoId } = req.body;

    const project = await Project.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!project) return res.status(404).json({ message: "Project not found" });

    const owned = project.candidates.some((c) => c.videoId === videoId);

    if (!owned) {
      return res.status(400).json({ message: "That thumbnail is not one of your results" });
    }

    project.chosenVideoId = videoId;
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ message: "Project deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProject,
  chooseReference,
  deleteProject,
  resolveTopic,
};
