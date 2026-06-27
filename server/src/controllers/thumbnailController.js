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

module.exports = {
  createThumbnail,
  getThumbnails,
  getThumbnail,
  updateThumbnail,
  deleteThumbnail,
};
