const crypto = require("crypto");
const Thumbnail = require("../models/Thumbnail");
const Activity = require("../models/Activity");
const Collection = require("../models/Collection");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { analyzeStandalone } = require("../config/imageStyle");
const { removeUpload, uploadPath } = require("../config/upload");

const logActivity = (user, type, thumbnailTitle, thumbnailId) => {
  Activity.create({ user, type, thumbnailTitle, thumbnailId }).catch(() => {});
};

const TRASH_RETENTION_DAYS = 30;

// Hard-delete trashed thumbnails past the retention window, along with every
// image file they own. Runs on boot and whenever the trash is opened, so the
// project stays free of a scheduler dependency.
const purgeExpired = async (user) => {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const filter = { deletedAt: { $ne: null, $lt: cutoff } };
  if (user) filter.user = user;

  const expired = await Thumbnail.find(filter).setOptions({ withDeleted: true });

  for (const thumb of expired) {
    removeUpload(thumb.imageUrl);
    (thumb.versions || []).forEach((v) => removeUpload(v.imageUrl));
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
      if (req.body.collectionId) {
        const collection = await Collection.findOne({
          _id: req.body.collectionId,
          user: req.user._id,
        });
        if (!collection) {
          return res.status(404).json({ message: "Collection not found" });
        }
      }
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
      thumbnail.shareExpiresAt = null;
    } else {
      thumbnail.shareToken = crypto.randomBytes(16).toString("hex");
      thumbnail.shareViews = 0;
      const days = req.body?.expiresInDays;
      thumbnail.shareExpiresAt = days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        : null;
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
    }).select(
      "title imageUrl score ctr analysis tags createdAt shareToken shareExpiresAt",
    );

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    if (thumbnail.shareExpiresAt && thumbnail.shareExpiresAt <= Date.now()) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    Thumbnail.updateOne({ _id: thumbnail._id }, { $inc: { shareViews: 1 } })
      .exec()
      .catch(() => {});

    res.json({
      _id: thumbnail._id,
      title: thumbnail.title,
      imageUrl: thumbnail.imageUrl,
      score: thumbnail.score,
      ctr: thumbnail.ctr,
      analysis: thumbnail.analysis,
      tags: thumbnail.tags,
      createdAt: thumbnail.createdAt,
      shareToken: thumbnail.shareToken,
    });
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

// Keep the top-level ctr mirroring the newest logged entry, so the existing
// CTR tile and any sort-by-ctr reader stays correct without knowing about
// the performance array.
const syncLatestCtr = (thumbnail) => {
  const entries = [...thumbnail.performance].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  thumbnail.ctr = entries.length > 0 ? entries[entries.length - 1].ctr : null;
};

const logPerformance = async (req, res) => {
  try {
    const impressions = Number(req.body.impressions);
    const clicks = Number(req.body.clicks);

    if (!Number.isFinite(impressions) || impressions < 1) {
      return res.status(400).json({ message: "Impressions must be at least 1" });
    }

    if (!Number.isFinite(clicks) || clicks < 0) {
      return res.status(400).json({ message: "Clicks must be 0 or more" });
    }

    if (clicks > impressions) {
      return res
        .status(400)
        .json({ message: "Clicks cannot exceed impressions" });
    }

    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    const date = req.body.date || new Date().toISOString().split("T")[0];

    thumbnail.performance.push({
      date,
      impressions,
      clicks,
      ctr: Math.round((clicks / impressions) * 10000) / 100,
      source: req.body.source || "",
      note: req.body.note || "",
    });

    syncLatestCtr(thumbnail);
    await thumbnail.save();

    logActivity(req.user._id, "logged", thumbnail.title, thumbnail._id);
    res.status(201).json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deletePerformance = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    const entry = thumbnail.performance.id(req.params.entryId);

    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }

    entry.deleteOne();
    syncLatestCtr(thumbnail);
    await thumbnail.save();

    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateShareExpiry = async (req, res) => {
  try {
    const days = req.body?.expiresInDays;

    const thumbnail = await Thumbnail.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail || !thumbnail.shareToken) {
      return res.status(404).json({ message: "Share link not found" });
    }

    thumbnail.shareExpiresAt = days
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      : null;
    await thumbnail.save();

    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const renameTags = async (req, res) => {
  try {
    const { from, to } = req.body;

    const result = await Thumbnail.updateMany(
      { user: req.user._id, tags: { $in: from } },
      [
        {
          $set: {
            tags: {
              $setUnion: [
                {
                  $map: {
                    input: "$tags",
                    in: {
                      $cond: [{ $in: ["$$this", from] }, to, "$$this"],
                    },
                  },
                },
                [],
              ],
            },
          },
        },
      ],
    );

    const updated = await Thumbnail.find({ user: req.user._id, tags: to });

    res.json({
      message: `${result.modifiedCount} thumbnails updated`,
      modifiedCount: result.modifiedCount,
      thumbnails: updated,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteTag = async (req, res) => {
  try {
    const { tag } = req.body;

    const result = await Thumbnail.updateMany(
      { user: req.user._id, tags: tag },
      { $pull: { tags: tag } },
    );

    res.json({
      message: `${result.modifiedCount} thumbnails updated`,
      modifiedCount: result.modifiedCount,
    });
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

    const file = uploadPath(thumbnail.imageUrl);

    if (!fs.existsSync(file)) {
      return res.status(410).json({ message: "The image file for this thumbnail is missing" });
    }

    let analysis;
    try {
      analysis = await analyzeStandalone(file);
    } catch {
      return res.status(422).json({ message: "That image could not be analysed" });
    }

    thumbnail.score = analysis.score;
    thumbnail.analysis = analysis.attributes;
    thumbnail.suggestions = analysis.observations;
    await thumbnail.save();

    logActivity(req.user._id, "analyzed", thumbnail.title, thumbnail._id);
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

    removeUpload(thumbnail.imageUrl);
    (thumbnail.versions || []).forEach((v) => removeUpload(v.imageUrl));

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
      removeUpload(thumb.imageUrl);
      (thumb.versions || []).forEach((v) => removeUpload(v.imageUrl));
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
  renameTags,
  deleteTag,
  bulkCollection,
  bulkExport,
  trackEvent,
  reuploadVersion,
  restoreVersion,
  logPerformance,
  deletePerformance,
  toggleShare,
  updateShareExpiry,
  getPublicThumbnail,
  toggleStar,
  reorder,
  duplicateThumbnail,
  analyzeThumbnail,
};
