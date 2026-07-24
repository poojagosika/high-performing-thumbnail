const express = require("express");
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout,
} = require("../controllers/authController");
const auth = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", auth, getMe);
router.patch("/profile", auth, updateProfile);
router.patch("/password", auth, changePassword);

module.exports = router;
