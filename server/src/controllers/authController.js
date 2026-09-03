const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const {
  cookieOptions,
  clearCookieOptions,
  signToken,
  BCRYPT_ROUNDS,
  isProduction,
} = require("../config/security");
const { isMailConfigured, sendPasswordReset } = require("../config/mailer");

const generateToken = (userId, tokenVersion) => signToken(userId, tokenVersion);

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const RESET_RESEND_MS = 60 * 1000;
const RESET_SENT_MESSAGE =
  "If an account exists for that email, a reset link is on its way.";

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = generateToken(user._id);

    res
      .cookie("token", token, cookieOptions)
      .status(201)
      .json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          avatar: user.avatar,
        },
      });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email }).select(
      "+password +failedLoginAttempts +lockUntil +tokenVersion",
    );
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update = { failedLoginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        update.failedLoginAttempts = 0;
      }
      await User.updateOne({ _id: user._id }, update);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      await User.updateOne(
        { _id: user._id },
        { failedLoginAttempts: 0, lockUntil: null },
      );
    }

    const token = generateToken(user._id, user.tokenVersion);

    res.cookie("token", token, cookieOptions).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getMe = async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      plan: req.user.plan,
      avatar: req.user.avatar,
    },
  });
};

const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (email && email !== req.user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
    }

    if (name) req.user.name = name.trim();
    if (email) req.user.email = email;

    await req.user.save();

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        plan: req.user.plan,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user._id).select(
      "+password +tokenVersion",
    );
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    const token = generateToken(user._id, user.tokenVersion);

    res.cookie("token", token, cookieOptions).json({
      message: "Password updated. Other sessions have been signed out.",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  if (isProduction && !isMailConfigured()) {
    return res
      .status(503)
      .json({ message: "Password reset is not available right now" });
  }

  try {
    const { email } = req.body;

    const user = await User.findOne({ email }).select("+resetTokenExpires");

    if (user) {
      const issuedAt = user.resetTokenExpires
        ? user.resetTokenExpires.getTime() - RESET_TTL_MS
        : 0;

      if (Date.now() - issuedAt >= RESET_RESEND_MS) {
        const token = crypto.randomBytes(32).toString("hex");

        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              resetTokenHash: hashResetToken(token),
              resetTokenExpires: new Date(Date.now() + RESET_TTL_MS),
            },
          },
        );

        await sendPasswordReset(user.email, user.name, token);
      }
    }

    res.json({ message: RESET_SENT_MESSAGE });
  } catch (error) {
    console.error(error);
    res.json({ message: RESET_SENT_MESSAGE });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.findOneAndUpdate(
      {
        resetTokenHash: hashResetToken(token),
        resetTokenExpires: { $gt: new Date() },
      },
      {
        $set: {
          password: hashedPassword,
          resetTokenHash: null,
          resetTokenExpires: null,
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        $inc: { tokenVersion: 1 },
      },
    );

    if (!user) {
      return res
        .status(400)
        .json({ message: "Reset link is invalid or has expired" });
    }

    res.json({ message: "Password updated. You can log in now." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    // Remove old avatar file if exists
    if (req.user.avatar) {
      const oldPath = path.join(__dirname, "../../", req.user.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    req.user.avatar = `/uploads/${req.file.filename}`;
    await req.user.save();

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        plan: req.user.plan,
        avatar: req.user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const logoutAll = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res
      .clearCookie("token", clearCookieOptions)
      .json({ message: "Signed out of all sessions" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const logout = (req, res) => {
  res.clearCookie("token", clearCookieOptions).json({ message: "Logged out" });
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  uploadAvatar,
  logout,
  logoutAll,
};
