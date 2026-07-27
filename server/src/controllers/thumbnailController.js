const Thumbnail = require("../models/Thumbnail");
const fs = require("fs");
const path = require("path");

const createThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const thumbnail = await Thumbnail.create({
      user: req.user._id,
      title: req.body.title || "Untitled",
      imageUrl: `/uploads/${req.file.filename}`,
      tags: req.body.tags ? req.body.tags.split(",").map((t) => t.trim()) : [],
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

module.exports = {
  createThumbnail,
  getThumbnails,
  getThumbnail,
  updateThumbnail,
  deleteThumbnail,
  bulkDelete,
  bulkTag,
};
