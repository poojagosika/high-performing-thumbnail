const express = require("express");
const auth = require("../middleware/auth");
const Activity = require("../models/Activity");

const router = express.Router();

router.use(auth);

router.get("/", async (req, res) => {
  try {
    const activities = await Activity.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/thumbnail/:id", async (req, res) => {
  try {
    const activities = await Activity.find({
      user: req.user._id,
      thumbnailId: req.params.id,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
