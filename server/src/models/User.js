const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    plan: {
      type: String,
      enum: ["free", "pro", "team"],
      default: "free",
    },
    avatar: {
      type: String,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
