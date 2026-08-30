const express = require("express");
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  uploadAvatar,
  logout,
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
const { persistImage, uploadErrorHandler } = require("../config/upload");

const router = express.Router();

router.post("/register", authSlowDown, registerLimiter, register);
router.post("/login", authSlowDown, loginLimiter, login);
router.post("/logout", logout);
router.get("/csrf", issueCsrfToken);
router.get("/me", auth, getMe);
router.patch("/profile", auth, updateProfile);
router.patch("/password", auth, changePassword);
router.post("/avatar", auth, uploadLimiter, upload.single("avatar"), uploadErrorHandler, persistImage, uploadAvatar);

module.exports = router;
