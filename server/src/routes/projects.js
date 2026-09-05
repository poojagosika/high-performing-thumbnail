const express = require("express");
const auth = require("../middleware/auth");
const { validate, validateObjectId } = require("../middleware/validate");
const { researchLimiter, uploadLimiter } = require("../middleware/rateLimit");
const upload = require("../config/upload");
const { persistImage, uploadErrorHandler } = require("../config/upload");
const { projectSchema, chooseReferenceSchema } = require("../schemas");
const {
  createProject,
  getProjects,
  getProject,
  chooseReference,
  uploadThumbnail,
  gradeThumbnail,
  clearUpload,
  deleteProject,
} = require("../controllers/projectController");

const router = express.Router();

router.use(auth);

router.post("/", researchLimiter, validate(projectSchema), createProject);
router.get("/", getProjects);
router.get("/:id", validateObjectId(), getProject);
router.patch("/:id/reference", validateObjectId(), validate(chooseReferenceSchema), chooseReference);
router.post("/:id/upload", validateObjectId(), uploadLimiter, upload.single("image"), uploadErrorHandler, persistImage, uploadThumbnail);
router.post("/:id/grade", validateObjectId(), uploadLimiter, gradeThumbnail);
router.delete("/:id/upload", validateObjectId(), clearUpload);
router.delete("/:id", validateObjectId(), deleteProject);

module.exports = router;
