const express = require("express");
const auth = require("../middleware/auth");
const upload = require("../config/upload");
const { persistImage, uploadErrorHandler } = require("../config/upload");
const { uploadLimiter, analyzeLimiter } = require("../middleware/rateLimit");
const { validate, validateObjectId } = require("../middleware/validate");
const {
  bulkIdsSchema,
  bulkTagSchema,
  bulkCollectionSchema,
  updateThumbnailSchema,
  performanceSchema,
  trackEventSchema,
  shareExpirySchema,
} = require("../schemas");
const {
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
  bulkTag,
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
} = require("../controllers/thumbnailController");

const router = express.Router();

// Public route (no auth)
router.get("/public/:token", getPublicThumbnail);

router.use(auth);

router.post("/", uploadLimiter, upload.single("image"), uploadErrorHandler, persistImage, createThumbnail);
router.post("/bulk-delete", validate(bulkIdsSchema), bulkDelete);
router.post("/bulk-restore", validate(bulkIdsSchema), bulkRestore);
router.post("/bulk-purge", validate(bulkIdsSchema), bulkPurge);
router.post("/bulk-tag", validate(bulkTagSchema), bulkTag);
router.post("/bulk-collection", validate(bulkCollectionSchema), bulkCollection);
router.post("/bulk-export", validate(bulkIdsSchema), bulkExport);
router.post("/reorder", reorder);
router.get("/trash", getTrash);
router.get("/", getThumbnails);
router.get("/:id", validateObjectId(), getThumbnail);
router.post("/:id/duplicate", validateObjectId(), duplicateThumbnail);
router.post("/:id/reupload", uploadLimiter, upload.single("image"), uploadErrorHandler, persistImage, reuploadVersion);
router.post("/:id/versions/:index/restore", restoreVersion);
router.post("/:id/performance", validateObjectId(), validate(performanceSchema), logPerformance);
router.delete("/:id/performance/:entryId", deletePerformance);
router.post("/:id/track", validateObjectId(), validate(trackEventSchema), trackEvent);
router.post("/:id/analyze", validateObjectId(), analyzeLimiter, analyzeThumbnail);
router.post("/:id/restore", validateObjectId(), restoreThumbnail);
router.patch("/:id/share", validateObjectId(), validate(shareExpirySchema), toggleShare);
router.patch("/:id/share/expiry", validateObjectId(), validate(shareExpirySchema), updateShareExpiry);
router.patch("/:id/star", validateObjectId(), toggleStar);
router.patch("/:id", validateObjectId(), validate(updateThumbnailSchema), updateThumbnail);
router.delete("/:id/purge", validateObjectId(), purgeThumbnail);
router.delete("/:id", validateObjectId(), deleteThumbnail);

module.exports = router;
