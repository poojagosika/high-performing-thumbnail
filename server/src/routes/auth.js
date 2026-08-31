const express = require("express");
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  uploadAvatar,
  logout,
  logoutAll,
} = require("../controllers/authController");
const auth = require("../middleware/auth");
const upload = require("../config/upload");
const { issueCsrfToken } = require("../middleware/csrf");
const {
  loginLimiter,
  registerLimiter,
  uploadLimiter,
  authSlowDown,
} = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const { verifyTurnstile } = require("../middleware/turnstile");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require("../schemas");
const { persistImage, uploadErrorHandler } = require("../config/upload");

const router = express.Router();

router.post("/register", authSlowDown, registerLimiter, verifyTurnstile, validate(registerSchema), register);
router.post("/login", authSlowDown, loginLimiter, verifyTurnstile, validate(loginSchema), login);
router.post("/logout", logout);
router.post("/logout-all", auth, logoutAll);
router.get("/csrf", issueCsrfToken);
router.get("/me", auth, getMe);
router.patch("/profile", auth, validate(updateProfileSchema), updateProfile);
router.patch("/password", auth, validate(changePasswordSchema), changePassword);
router.post("/avatar", auth, uploadLimiter, upload.single("avatar"), uploadErrorHandler, persistImage, uploadAvatar);

module.exports = router;
