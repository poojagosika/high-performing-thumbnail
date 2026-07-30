const express = require("express");
const auth = require("../middleware/auth");
const upload = require("../config/upload");
const {
  createThumbnail,
  getThumbnails,
  getThumbnail,
  updateThumbnail,
  deleteThumbnail,
  bulkDelete,
  bulkTag,
  reorder,
  duplicateThumbnail,
} = require("../controllers/thumbnailController");

const router = express.Router();

router.use(auth);

router.post("/", upload.single("image"), createThumbnail);
router.post("/bulk-delete", bulkDelete);
router.post("/bulk-tag", bulkTag);
router.post("/reorder", reorder);
router.get("/", getThumbnails);
router.get("/:id", getThumbnail);
router.post("/:id/duplicate", duplicateThumbnail);
router.patch("/:id", updateThumbnail);
router.delete("/:id", deleteThumbnail);

module.exports = router;
