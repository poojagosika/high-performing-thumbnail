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
const { persistImage, uploadErrorHandler } = require("../config/upload");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", auth, getMe);
router.patch("/profile", auth, updateProfile);
router.patch("/password", auth, changePassword);
router.post("/avatar", auth, upload.single("avatar"), uploadErrorHandler, persistImage, uploadAvatar);

module.exports = router;
