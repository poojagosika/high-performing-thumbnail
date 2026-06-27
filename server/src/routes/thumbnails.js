const express = require("express");
const auth = require("../middleware/auth");
const upload = require("../config/upload");
const {
  createThumbnail,
  getThumbnails,
  getThumbnail,
  updateThumbnail,
  deleteThumbnail,
} = require("../controllers/thumbnailController");

const router = express.Router();

router.use(auth);

router.post("/", upload.single("image"), createThumbnail);
router.get("/", getThumbnails);
router.get("/:id", getThumbnail);
router.patch("/:id", updateThumbnail);
router.delete("/:id", deleteThumbnail);

module.exports = router;
