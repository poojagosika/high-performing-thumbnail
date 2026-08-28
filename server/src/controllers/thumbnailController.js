const crypto = require("crypto");
const Thumbnail = require("../models/Thumbnail");
const Activity = require("../models/Activity");
const Collection = require("../models/Collection");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const logActivity = (user, type, thumbnailTitle, thumbnailId) => {
  Activity.create({ user, type, thumbnailTitle, thumbnailId }).catch(() => {});
};

const TRASH_RETENTION_DAYS = 30;

const removeFile = (imageUrl) => {
  const filePath = path.join(__dirname, "../../", imageUrl);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

// Hard-delete trashed thumbnails past the retention window, along with every
// image file they own. Runs on boot and whenever the trash is opened, so the
// project stays free of a scheduler dependency.
const purgeExpired = async (user) => {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const filter = { deletedAt: { $ne: null, $lt: cutoff } };
  if (user) filter.user = user;

  const expired = await Thumbnail.find(filter).setOptions({ withDeleted: true });

  for (const thumb of expired) {
    removeFile(thumb.imageUrl);
    (thumb.versions || []).forEach((v) => removeFile(v.imageUrl));
  }

  if (expired.length > 0) {
    await Thumbnail.deleteMany({ _id: { $in: expired.map((t) => t._id) } });
  }

  return expired.length;
};

const createThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const maxOrder = await Thumbnail.findOne({ user: req.user._id })
      .sort({ order: -1 })
      .select("order")
      .lean();

    const thumbnail = await Thumbnail.create({
      user: req.user._id,
      title: req.body.title || "Untitled",
      imageUrl: `/uploads/${req.file.filename}`,
      tags: req.body.tags ? req.body.tags.split(",").map((t) => t.trim()) : [],
      order: (maxOrder?.order ?? -1) + 1,
    });

    logActivity(req.user._id, "uploaded", thumbnail.title, thumbnail._id);
    res.status(201).json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getThumbnails = async (req, res) => {
  try {
    const thumbnails = await Thumbnail.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    res.json(thumbnails);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateThumbnail = async (req, res) => {
  try {
    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.tags !== undefined) {
      updates.tags = req.body.tags.split(",").map((t) => t.trim());
    }
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.collectionId !== undefined) {
      updates.collectionId = req.body.collectionId || null;
    }

    const thumbnail = await Thumbnail.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { new: true },
    );

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    if (req.body.title !== undefined || req.body.tags !== undefined) {
      logActivity(req.user._id, "edited", thumbnail.title, thumbnail._id);
    }
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { deletedAt: new Date() },
      { new: true },
    );

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    logActivity(req.user._id, "trashed", thumbnail.title, thumbnail._id);
    res.json({ message: "Thumbnail moved to trash", thumbnail });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails selected" });
    }

    const result = await Thumbnail.updateMany(
      { _id: { $in: ids }, user: req.user._id, deletedAt: null },
      { deletedAt: new Date() },
    );

    logActivity(req.user._id, "trashed", `${result.modifiedCount} thumbnails`, null);
    res.json({ message: `${result.modifiedCount} thumbnails moved to trash` });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const bulkTag = async (req, res) => {
  try {
    const { ids, tags } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails selected" });
    }

    if (tags === undefined) {
      return res.status(400).json({ message: "Tags are required" });
    }

    const newTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    await Thumbnail.updateMany(
      { _id: { $in: ids }, user: req.user._id },
      { $addToSet: { tags: { $each: newTags } } },
    );

    const updated = await Thumbnail.find({
      _id: { $in: ids },
      user: req.user._id,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const duplicateThumbnail = async (req, res) => {
  try {
    const original = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!original) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    // Copy the image file
    const origPath = path.join(__dirname, "../../", original.imageUrl);
    const ext = path.extname(original.imageUrl);
    const newFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const newPath = path.join(__dirname, "../../uploads", newFilename);

    fs.copyFileSync(origPath, newPath);

    const maxOrder = await Thumbnail.findOne({ user: req.user._id })
      .sort({ order: -1 })
      .select("order")
      .lean();

    const duplicate = await Thumbnail.create({
      user: req.user._id,
      title: `${original.title} (copy)`,
      imageUrl: `/uploads/${newFilename}`,
      score: original.score,
      ctr: original.ctr,
      analysis: original.analysis,
      tags: [...(original.tags || [])],
      starred: original.starred,
      order: (maxOrder?.order ?? -1) + 1,
    });

    logActivity(req.user._id, "duplicated", original.title, duplicate._id);
    res.status(201).json(duplicate);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const toggleStar = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    thumbnail.starred = !thumbnail.starred;
    await thumbnail.save();

    logActivity(
      req.user._id,
      thumbnail.starred ? "starred" : "unstarred",
      thumbnail.title,
      thumbnail._id,
    );
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const reorder = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails provided" });
    }

    const ops = ids.map((id, i) => ({
      updateOne: {
        filter: { _id: id, user: req.user._id },
        update: { order: i },
      },
    }));

    await Thumbnail.bulkWrite(ops);

    res.json({ message: "Order updated" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const trackEvent = async (req, res) => {
  try {
    const { type } = req.body;

    if (!["view", "click"].includes(type)) {
      return res.status(400).json({ message: "Invalid event type" });
    }

    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    const today = new Date().toISOString().split("T")[0];
    const dayIdx = thumbnail.dailyStats.findIndex((d) => d.date === today);

    if (type === "view") {
      thumbnail.views += 1;
      if (dayIdx >= 0) {
        thumbnail.dailyStats[dayIdx].views += 1;
      } else {
        thumbnail.dailyStats.push({ date: today, views: 1, clicks: 0 });
      }
    } else {
      thumbnail.clicks += 1;
      if (dayIdx >= 0) {
        thumbnail.dailyStats[dayIdx].clicks += 1;
      } else {
        thumbnail.dailyStats.push({ date: today, views: 0, clicks: 1 });
      }
    }

    await thumbnail.save();
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const toggleShare = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    if (thumbnail.shareToken) {
      thumbnail.shareToken = null;
    } else {
      thumbnail.shareToken = crypto.randomBytes(16).toString("hex");
    }

    await thumbnail.save();
    logActivity(
      req.user._id,
      thumbnail.shareToken ? "shared" : "unshared",
      thumbnail.title,
      thumbnail._id,
    );
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getPublicThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOne({
      shareToken: req.params.token,
    }).select("title imageUrl score ctr analysis tags createdAt shareToken versions");

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const reuploadVersion = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    // Push current image to versions history
    thumbnail.versions.push({
      imageUrl: thumbnail.imageUrl,
      uploadedAt: thumbnail.updatedAt || thumbnail.createdAt,
    });

    // Set new image as current
    thumbnail.imageUrl = `/uploads/${req.file.filename}`;
    await thumbnail.save();

    logActivity(req.user._id, "reuploaded", thumbnail.title, thumbnail._id);
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Promote an archived version back to current. The image being replaced is
// pushed onto the history rather than discarded, so restoring is itself
// reversible and no upload is ever lost.
const restoreVersion = async (req, res) => {
  try {
    const index = Number(req.params.index);

    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    if (!Number.isInteger(index) || index < 0 || index >= thumbnail.versions.length) {
      return res.status(400).json({ message: "Version not found" });
    }

    const target = thumbnail.versions[index];
    const current = thumbnail.imageUrl;

    thumbnail.imageUrl = target.imageUrl;
    thumbnail.versions.splice(index, 1);
    thumbnail.versions.push({ imageUrl: current, uploadedAt: new Date() });

    await thumbnail.save();

    logActivity(req.user._id, "restored", thumbnail.title, thumbnail._id);
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const bulkExport = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails selected" });
    }

    const thumbnails = await Thumbnail.find({
      _id: { $in: ids },
      user: req.user._id,
    });

    if (thumbnails.length === 0) {
      return res.status(404).json({ message: "No thumbnails found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=thumbnails.zip",
    );

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.pipe(res);

    for (const thumb of thumbnails) {
      const filePath = path.join(__dirname, "../../", thumb.imageUrl);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(thumb.imageUrl);
        const safeName = thumb.title.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim();
        archive.file(filePath, { name: `${safeName}${ext}` });
      }
    }

    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
  }
};

const analyzeThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const composition = rand(45, 95);
    const colorBalance = rand(40, 95);
    const textReadability = rand(35, 90);
    const emotionalImpact = rand(40, 95);
    const score = Math.round(
      composition * 0.25 + colorBalance * 0.25 + textReadability * 0.25 + emotionalImpact * 0.25,
    );

    const suggestions = [];
    if (composition < 60) {
      suggestions.push({ category: "Composition", tip: "Try the rule of thirds — position key elements along grid intersections for a more balanced layout", priority: "high" });
    } else if (composition < 80) {
      suggestions.push({ category: "Composition", tip: "Consider adding a clear focal point to draw the viewer's eye immediately", priority: "medium" });
    } else {
      suggestions.push({ category: "Composition", tip: "Strong composition — the visual hierarchy guides the eye naturally", priority: "low" });
    }
    if (colorBalance < 60) {
      suggestions.push({ category: "Color", tip: "Use higher contrast between text and background — aim for at least 4.5:1 contrast ratio", priority: "high" });
    } else if (colorBalance < 80) {
      suggestions.push({ category: "Color", tip: "Try limiting your palette to 2-3 dominant colors for a cleaner look", priority: "medium" });
    } else {
      suggestions.push({ category: "Color", tip: "Great color harmony — the palette creates visual cohesion", priority: "low" });
    }
    if (textReadability < 60) {
      suggestions.push({ category: "Text", tip: "Increase font size or add a drop shadow/outline — text should be readable at small sizes", priority: "high" });
    } else if (textReadability < 80) {
      suggestions.push({ category: "Text", tip: "Keep text concise — 3-5 words max for thumbnail titles to improve scannability", priority: "medium" });
    } else {
      suggestions.push({ category: "Text", tip: "Text is clear and legible — good sizing and contrast choices", priority: "low" });
    }
    if (emotionalImpact < 60) {
      suggestions.push({ category: "Emotion", tip: "Add a human face or expressive element — faces with emotions boost click-through rates significantly", priority: "high" });
    } else if (emotionalImpact < 80) {
      suggestions.push({ category: "Emotion", tip: "Amplify the emotional hook — try bolder expressions or more dramatic visuals", priority: "medium" });
    } else {
      suggestions.push({ category: "Emotion", tip: "High emotional resonance — the visual creates strong curiosity and engagement", priority: "low" });
    }

    thumbnail.score = score;
    thumbnail.analysis = { composition, colorBalance, textReadability, emotionalImpact };
    thumbnail.suggestions = suggestions;
    await thumbnail.save();

    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const bulkCollection = async (req, res) => {
  try {
    const { ids, collectionId } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails selected" });
    }

    if (collectionId) {
      const collection = await Collection.findOne({
        _id: collectionId,
        user: req.user._id,
      });
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
    }

    await Thumbnail.updateMany(
      { _id: { $in: ids }, user: req.user._id },
      { collectionId: collectionId || null },
    );

    const updated = await Thumbnail.find({
      _id: { $in: ids },
      user: req.user._id,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getTrash = async (req, res) => {
  try {
    await purgeExpired(req.user._id);

    const thumbnails = await Thumbnail.find({
      user: req.user._id,
      deletedAt: { $ne: null },
    })
      .setOptions({ withDeleted: true })
      .sort({ deletedAt: -1 });

    res.json(thumbnails);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const restoreThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, deletedAt: { $ne: null } },
      { deletedAt: null },
      { new: true },
    ).setOptions({ withDeleted: true });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found in trash" });
    }

    logActivity(req.user._id, "restored", thumbnail.title, thumbnail._id);
    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const purgeThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
      deletedAt: { $ne: null },
    }).setOptions({ withDeleted: true });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found in trash" });
    }

    removeFile(thumbnail.imageUrl);
    (thumbnail.versions || []).forEach((v) => removeFile(v.imageUrl));

    logActivity(req.user._id, "purged", thumbnail.title, null);
    res.json({ message: "Thumbnail permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const bulkRestore = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails selected" });
    }

    const result = await Thumbnail.updateMany(
      { _id: { $in: ids }, user: req.user._id, deletedAt: { $ne: null } },
      { deletedAt: null },
    );

    logActivity(req.user._id, "restored", `${result.modifiedCount} thumbnails`, null);
    res.json({ message: `${result.modifiedCount} thumbnails restored` });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const bulkPurge = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No thumbnails selected" });
    }

    const thumbnails = await Thumbnail.find({
      _id: { $in: ids },
      user: req.user._id,
      deletedAt: { $ne: null },
    }).setOptions({ withDeleted: true });

    for (const thumb of thumbnails) {
      removeFile(thumb.imageUrl);
      (thumb.versions || []).forEach((v) => removeFile(v.imageUrl));
    }

    await Thumbnail.deleteMany({ _id: { $in: thumbnails.map((t) => t._id) } });

    logActivity(req.user._id, "purged", `${thumbnails.length} thumbnails`, null);
    res.json({ message: `${thumbnails.length} thumbnails permanently deleted` });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createThumbnail,
  getThumbnails,
  getThumbnail,
  updateThumbnail,
  deleteThumbnail,
  bulkDelete,
  getTrash,
  restoreThumbnail,
  purgeThumbnail,
  bulkRestore,
  bulkPurge,
  purgeExpired,
  bulkTag,
  bulkCollection,
  bulkExport,
  trackEvent,
  reuploadVersion,
  restoreVersion,
  toggleShare,
  getPublicThumbnail,
  toggleStar,
  reorder,
  duplicateThumbnail,
  analyzeThumbnail,
};
