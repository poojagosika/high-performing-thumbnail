const express = require("express");
const auth = require("../middleware/auth");
const Comparison = require("../models/Comparison");
const Thumbnail = require("../models/Thumbnail");
const { validate, validateObjectId } = require("../middleware/validate");
const { comparisonSchema } = require("../schemas");

const router = express.Router();

router.use(auth);

router.post("/", validate(comparisonSchema), async (req, res) => {
  try {
    const { thumbnailA, thumbnailB, winner, notes } = req.body;

    const owned = await Thumbnail.countDocuments({
      _id: { $in: [thumbnailA, thumbnailB] },
      user: req.user._id,
    });

    const required = thumbnailA === thumbnailB ? 1 : 2;

    if (owned !== required) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    const comparison = await Comparison.create({
      user: req.user._id,
      thumbnailA,
      thumbnailB,
      winner: winner || null,
      notes: notes || "",
    });

    const populated = await Comparison.findById(comparison._id)
      .populate("thumbnailA", "title imageUrl score")
      .populate("thumbnailB", "title imageUrl score");

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: "Failed to save comparison" });
  }
});

router.get("/", async (req, res) => {
  try {
    const comparisons = await Comparison.find({ user: req.user._id })
      .populate("thumbnailA", "title imageUrl score")
      .populate("thumbnailB", "title imageUrl score")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(comparisons);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch comparisons" });
  }
});

router.delete("/:id", validateObjectId(), async (req, res) => {
  try {
    const comparison = await Comparison.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!comparison) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete comparison" });
  }
});

module.exports = router;
