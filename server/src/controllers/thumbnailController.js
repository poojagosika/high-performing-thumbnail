const Thumbnail = require("../models/Thumbnail");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

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

    const thumbnail = await Thumbnail.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { new: true },
    );

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    res.json(thumbnail);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteThumbnail = async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    // Remove file from disk
    const filePath = path.join(__dirname, "../../", thumbnail.imageUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: "Thumbnail deleted" });
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

    const thumbnails = await Thumbnail.find({
      _id: { $in: ids },
      user: req.user._id,
    });

    for (const thumb of thumbnails) {
      const filePath = path.join(__dirname, "../../", thumb.imageUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Thumbnail.deleteMany({
      _id: { $in: ids },
      user: req.user._id,
    });

    res.json({ message: `${thumbnails.length} thumbnails deleted` });
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

module.exports = {
  createThumbnail,
  getThumbnails,
  getThumbnail,
  updateThumbnail,
  deleteThumbnail,
  bulkDelete,
  bulkTag,
  bulkExport,
  toggleStar,
  reorder,
  duplicateThumbnail,
};
