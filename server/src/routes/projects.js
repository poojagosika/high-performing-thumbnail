const express = require("express");
const auth = require("../middleware/auth");
const { validate, validateObjectId } = require("../middleware/validate");
const { researchLimiter, uploadLimiter } = require("../middleware/rateLimit");
const upload = require("../config/upload");
const { persistImage, uploadErrorHandler } = require("../config/upload");
const {
  projectSchema,
  chooseReferenceSchema,
  captionSchema,
  templateChoiceSchema,
  slotEditSchema,
} = require("../schemas");
const {
  listTemplates,
  chooseTemplate,
  uploadSlot,
  editSlot,
  clearSlot,
} = require("../controllers/composeController");
const {
  createProject,
  getProjects,
  getProject,
  chooseReference,
  uploadThumbnail,
  recomposeThumbnail,
  gradeThumbnail,
  setCaption,
  removeCaption,
  clearUpload,
  deleteProject,
} = require("../controllers/projectController");

const router = express.Router();

router.use(auth);

router.post("/", researchLimiter, validate(projectSchema), createProject);
router.get("/", getProjects);
router.get("/templates", listTemplates);
router.get("/:id", validateObjectId(), getProject);
router.patch("/:id/template", validateObjectId(), validate(templateChoiceSchema), chooseTemplate);
router.post("/:id/slots/:key", validateObjectId(), uploadLimiter, upload.single("image"), uploadErrorHandler, persistImage, uploadSlot);
router.patch("/:id/slots/:key", validateObjectId(), validate(slotEditSchema), editSlot);
router.delete("/:id/slots/:key", validateObjectId(), clearSlot);
router.patch("/:id/reference", validateObjectId(), validate(chooseReferenceSchema), chooseReference);
router.post("/:id/upload", validateObjectId(), uploadLimiter, upload.single("image"), uploadErrorHandler, persistImage, uploadThumbnail);
router.post("/:id/recompose", validateObjectId(), uploadLimiter, recomposeThumbnail);
router.post("/:id/grade", validateObjectId(), uploadLimiter, gradeThumbnail);
router.post("/:id/caption", validateObjectId(), uploadLimiter, validate(captionSchema), setCaption);
router.delete("/:id/caption", validateObjectId(), removeCaption);
router.delete("/:id/upload", validateObjectId(), clearUpload);
router.delete("/:id", validateObjectId(), deleteProject);

module.exports = router;
