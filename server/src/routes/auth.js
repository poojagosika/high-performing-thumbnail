const express = require("express");
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  uploadAvatar,
  deleteAccount,
  logout,
  logoutAll,
} = require("../controllers/authController");
const auth = require("../middleware/auth");
const upload = require("../config/upload");
const { issueCsrfToken } = require("../middleware/csrf");
const {
  loginLimiter,
  registerLimiter,
  deleteAccountLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
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
  deleteAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../schemas");
const { persistImage, uploadErrorHandler } = require("../config/upload");

const router = express.Router();

router.post("/register", authSlowDown, registerLimiter, verifyTurnstile, validate(registerSchema), register);
router.post("/login", authSlowDown, loginLimiter, verifyTurnstile, validate(loginSchema), login);
router.post("/forgot-password", authSlowDown, forgotPasswordLimiter, verifyTurnstile, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authSlowDown, resetPasswordLimiter, validate(resetPasswordSchema), resetPassword);
router.post("/logout", logout);
router.post("/logout-all", auth, logoutAll);
router.get("/csrf", issueCsrfToken);
router.get("/me", auth, getMe);
router.patch("/profile", auth, validate(updateProfileSchema), updateProfile);
router.patch("/password", auth, validate(changePasswordSchema), changePassword);
router.delete("/account", auth, deleteAccountLimiter, validate(deleteAccountSchema), deleteAccount);
router.post("/avatar", auth, uploadLimiter, upload.single("avatar"), uploadErrorHandler, persistImage, uploadAvatar);

module.exports = router;
