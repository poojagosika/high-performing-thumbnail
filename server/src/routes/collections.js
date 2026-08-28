const express = require("express");
const auth = require("../middleware/auth");
const Collection = require("../models/Collection");
const Thumbnail = require("../models/Thumbnail");

const router = express.Router();

router.use(auth);

// Get all collections for user, with thumbnail counts
router.get("/", async (req, res) => {
  try {
    const collections = await Collection.find({ user: req.user._id })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const counts = await Thumbnail.aggregate([
      {
        $match: {
          user: req.user._id,
          collectionId: { $ne: null },
          deletedAt: null,
        },
      },
      { $group: { _id: "$collectionId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[String(c._id)] = c.count;
    });

    res.json(
      collections.map((c) => ({ ...c, count: countMap[String(c._id)] || 0 })),
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch collections" });
  }
});

// Create a collection
router.post("/", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const maxOrder = await Collection.findOne({ user: req.user._id })
      .sort({ order: -1 })
      .select("order")
      .lean();

    const collection = await Collection.create({
      user: req.user._id,
      name,
      color: req.body.color || "#6366f1",
      order: (maxOrder?.order ?? -1) + 1,
    });

    res.status(201).json({ ...collection.toObject(), count: 0 });
  } catch (error) {
    res.status(500).json({ message: "Failed to create collection" });
  }
});

// Rename or recolor a collection
router.patch("/:id", async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ message: "Name is required" });
      updates.name = name;
    }
    if (req.body.color !== undefined) updates.color = req.body.color;

    const collection = await Collection.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { new: true },
    );

    if (!collection) {
      return res.status(404).json({ message: "Collection not found" });
    }

    res.json(collection);
  } catch (error) {
    res.status(500).json({ message: "Failed to update collection" });
  }
});

// Delete a collection, leaving its thumbnails uncategorized
router.delete("/:id", async (req, res) => {
  try {
    const collection = await Collection.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!collection) {
      return res.status(404).json({ message: "Collection not found" });
    }

    await Thumbnail.updateMany(
      { user: req.user._id, collectionId: collection._id, deletedAt: null },
      { collectionId: null },
    );

    res.json({ message: "Collection deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete collection" });
  }
});

module.exports = router;
