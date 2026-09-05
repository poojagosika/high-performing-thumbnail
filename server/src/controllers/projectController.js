const Project = require("../models/Project");
const TopicSearch = require("../models/TopicSearch");
const crypto = require("crypto");
const sharp = require("sharp");
const {
  YoutubeError,
  buildQuery,
  searchTopic,
} = require("../config/youtube");
const { extract, scoreMatch, gradeToward, MAX_BYTES } = require("../config/imageStyle");
const { removeUpload, writeUpload, uploadPath } = require("../config/upload");

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 8000;

const synthesizeFixture = (seedText) => {
  const h = crypto.createHash("sha256").update(seedText).digest();
  return sharp({
    create: {
      width: 320,
      height: 180,
      channels: 3,
      background: { r: h[0], g: h[1], b: h[2] },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 320,
            height: 60 + (h[3] % 60),
            channels: 3,
            background: { r: h[4], g: h[5], b: h[6] },
          },
        },
        top: h[7] % 100,
        left: 0,
      },
    ])
    .jpeg()
    .toBuffer();
};

async function fetchReferenceImage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`reference responded ${response.status}`);

  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("reference is not an image");

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Error("reference is too large");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error("reference is too large");

  return buffer;
}

async function analyzeReference(project) {
  const chosen = project.candidates.find((c) => c.videoId === project.chosenVideoId);
  if (!chosen || !chosen.thumbnailUrl) return null;

  try {
    const buffer = chosen.thumbnailUrl.startsWith("fixture://")
      ? await synthesizeFixture(chosen.videoId)
      : await fetchReferenceImage(chosen.thumbnailUrl);
    return await extract(buffer);
  } catch {
    return null;
  }
}

const shape = (project) => ({
  id: project._id,
  title: project.title,
  tags: project.tags,
  description: project.description,
  searchQuery: project.searchQuery,
  source: project.source,
  candidates: project.candidates,
  chosenVideoId: project.chosenVideoId,
  referenceStyle: project.referenceStyle,
  uploadUrl: project.uploadUrl,
  uploadStyle: project.uploadStyle,
  matchReport: project.matchReport,
  gradedUrl: project.gradedUrl,
  gradedReport: project.gradedReport,
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

    if (project.chosenVideoId !== videoId) {
      removeUpload(project.uploadUrl);
      removeUpload(project.gradedUrl);
      project.uploadUrl = null;
      project.uploadStyle = null;
      project.matchReport = null;
      project.gradedUrl = null;
      project.gradedReport = null;
    }

    project.chosenVideoId = videoId;
    project.referenceStyle = await analyzeReference(project);
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

const uploadThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const project = await Project.findOne({ _id: req.params.id, user: req.user._id });

    if (!project) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res.status(404).json({ message: "Project not found" });
    }

    if (!project.chosenVideoId) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: "Choose a reference thumbnail first" });
    }

    const referenceStyle = project.referenceStyle || (await analyzeReference(project));

    if (!referenceStyle) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res
        .status(503)
        .json({ message: "Could not read the reference thumbnail. Try again shortly." });
    }

    removeUpload(project.uploadUrl);
    removeUpload(project.gradedUrl);

    const uploadUrl = `/uploads/${req.file.filename}`;
    const uploadStyle = await extract(uploadPath(uploadUrl));

    project.referenceStyle = referenceStyle;
    project.uploadUrl = uploadUrl;
    project.uploadStyle = uploadStyle;
    project.matchReport = scoreMatch(uploadStyle, referenceStyle);
    project.gradedUrl = null;
    project.gradedReport = null;
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const gradeThumbnail = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, user: req.user._id });

    if (!project) return res.status(404).json({ message: "Project not found" });

    if (!project.uploadUrl || !project.uploadStyle || !project.referenceStyle) {
      return res.status(400).json({ message: "Upload your thumbnail first" });
    }

    const buffer = await gradeToward(
      uploadPath(project.uploadUrl),
      project.uploadStyle,
      project.referenceStyle,
    );

    removeUpload(project.gradedUrl);

    const gradedUrl = writeUpload(buffer, "jpg");
    const gradedStyle = await extract(buffer);

    project.gradedUrl = gradedUrl;
    project.gradedReport = scoreMatch(gradedStyle, project.referenceStyle);
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const clearUpload = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, user: req.user._id });

    if (!project) return res.status(404).json({ message: "Project not found" });

    removeUpload(project.uploadUrl);
    removeUpload(project.gradedUrl);

    project.uploadUrl = null;
    project.uploadStyle = null;
    project.matchReport = null;
    project.gradedUrl = null;
    project.gradedReport = null;
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProject,
  chooseReference,
  uploadThumbnail,
  gradeThumbnail,
  clearUpload,
  deleteProject,
  resolveTopic,
  analyzeReference,
};
