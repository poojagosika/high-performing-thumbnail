const crypto = require("crypto");
const Project = require("../models/Project");
const { compose } = require("../config/compose");
const { TEMPLATES, byId, summarize: describeTemplate } = require("../config/templates");
const { cutout, CutoutError } = require("../config/cutout");
const { removeUpload, writeUpload, uploadPath } = require("../config/upload");
const { shape } = require("./projectController");

const IMAGE_FIELDS = ["zoom", "dx", "dy", "anchor"];
const TEXT_FIELDS = [
  "text",
  "font",
  "color",
  "accentColor",
  "strokeColor",
  "depthColor",
  "scale",
  "rotate",
  "depth",
  "band",
  "align",
  "lines",
];

const slotOf = (templateId, key) => {
  const template = byId(templateId);
  if (!template) return null;
  return template.slots.find((s) => s.key === key) || null;
};

const pngUrl = () => `/uploads/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.png`;

const assetsOf = (project) => {
  const assets = {};
  for (const [key, slot] of Object.entries(project.slots || {})) {
    if (slot && slot.url) assets[key] = uploadPath(slot.url);
  }
  return assets;
};

async function rebuild(project) {
  removeUpload(project.composedUrl);
  project.composedUrl = null;

  if (!byId(project.templateId)) return;

  const buffer = await compose(project.templateId, assetsOf(project), project.slotOverrides || {}, {
    referenceStyle: project.referenceStyle || null,
  });

  project.composedUrl = writeUpload(buffer, "jpg");
}

function pruneSlots(project) {
  const template = byId(project.templateId);
  const keys = new Set(template ? template.slots.map((s) => s.key) : []);
  const slots = {};
  const overrides = {};

  for (const [key, value] of Object.entries(project.slots || {})) {
    if (keys.has(key)) slots[key] = value;
    else removeUpload(value && value.url);
  }

  for (const [key, value] of Object.entries(project.slotOverrides || {})) {
    if (keys.has(key)) overrides[key] = value;
  }

  project.slots = slots;
  project.slotOverrides = overrides;
}

const owned = (req) => Project.findOne({ _id: req.params.id, user: req.user._id });

const listTemplates = (req, res) => {
  res.json(TEMPLATES.map(describeTemplate));
};

const chooseTemplate = async (req, res) => {
  try {
    const project = await owned(req);
    if (!project) return res.status(404).json({ message: "Project not found" });

    if (project.templateId !== req.body.templateId) {
      project.templateId = req.body.templateId;
      pruneSlots(project);
    }

    await rebuild(project);
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const uploadSlot = async (req, res) => {
  const rawUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    if (!rawUrl) return res.status(400).json({ message: "Image file is required" });

    const project = await owned(req);

    if (!project) {
      removeUpload(rawUrl);
      return res.status(404).json({ message: "Project not found" });
    }

    if (!byId(project.templateId)) {
      removeUpload(rawUrl);
      return res.status(400).json({ message: "Choose a template first" });
    }

    const slot = slotOf(project.templateId, req.params.key);

    if (!slot || slot.type !== "image") {
      removeUpload(rawUrl);
      return res.status(404).json({ message: "This template has no image slot by that name" });
    }

    let stored = { url: rawUrl, cutout: false, coverage: null };

    if (slot.cutout) {
      const cutUrl = pngUrl();

      try {
        const result = await cutout(uploadPath(rawUrl), uploadPath(cutUrl));
        stored = { url: cutUrl, cutout: true, coverage: result.coverage };
      } catch (error) {
        removeUpload(rawUrl);
        removeUpload(cutUrl);
        if (error instanceof CutoutError) {
          return res.status(422).json({ message: error.message, code: error.code });
        }
        throw error;
      }

      removeUpload(rawUrl);
    }

    const previous = (project.slots || {})[req.params.key];
    removeUpload(previous && previous.url);

    project.slots = { ...(project.slots || {}), [req.params.key]: stored };

    await rebuild(project);
    await project.save();

    res.json(shape(project));
  } catch (error) {
    removeUpload(rawUrl);
    res.status(500).json({ message: "Server error" });
  }
};

const editSlot = async (req, res) => {
  try {
    const project = await owned(req);
    if (!project) return res.status(404).json({ message: "Project not found" });

    if (!byId(project.templateId)) {
      return res.status(400).json({ message: "Choose a template first" });
    }

    const slot = slotOf(project.templateId, req.params.key);
    if (!slot) return res.status(404).json({ message: "This template has no slot by that name" });

    const allowed = slot.type === "text" ? TEXT_FIELDS : IMAGE_FIELDS;
    const changes = {};

    for (const field of allowed) {
      if (req.body[field] !== undefined) changes[field] = req.body[field];
    }

    if (!Object.keys(changes).length) {
      return res.status(400).json({ message: `Those settings do not apply to the ${slot.label} slot` });
    }

    const merged = { ...((project.slotOverrides || {})[req.params.key] || {}), ...changes };
    project.slotOverrides = { ...(project.slotOverrides || {}), [req.params.key]: merged };

    await rebuild(project);
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const clearSlot = async (req, res) => {
  try {
    const project = await owned(req);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const slot = slotOf(project.templateId, req.params.key);
    if (!slot) return res.status(404).json({ message: "This template has no slot by that name" });

    const slots = { ...(project.slots || {}) };
    const overrides = { ...(project.slotOverrides || {}) };

    removeUpload(slots[req.params.key] && slots[req.params.key].url);
    delete slots[req.params.key];
    delete overrides[req.params.key];

    project.slots = slots;
    project.slotOverrides = overrides;

    await rebuild(project);
    await project.save();

    res.json(shape(project));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  listTemplates,
  chooseTemplate,
  uploadSlot,
  editSlot,
  clearSlot,
  rebuild,
  pruneSlots,
  slotOf,
  IMAGE_FIELDS,
  TEXT_FIELDS,
};
