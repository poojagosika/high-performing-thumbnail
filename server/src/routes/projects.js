const express = require("express");
const auth = require("../middleware/auth");
const { validate, validateObjectId } = require("../middleware/validate");
const { researchLimiter } = require("../middleware/rateLimit");
const { projectSchema, chooseReferenceSchema } = require("../schemas");
const {
  createProject,
  getProjects,
  getProject,
  chooseReference,
  deleteProject,
} = require("../controllers/projectController");

const router = express.Router();

router.use(auth);

router.post("/", researchLimiter, validate(projectSchema), createProject);
router.get("/", getProjects);
router.get("/:id", validateObjectId(), getProject);
router.patch("/:id/reference", validateObjectId(), validate(chooseReferenceSchema), chooseReference);
router.delete("/:id", validateObjectId(), deleteProject);

module.exports = router;
