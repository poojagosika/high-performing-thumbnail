const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const { ipKeyGenerator } = require("express-rate-limit");

const MINUTE = 60 * 1000;

const jsonLimitHandler = (message) => (req, res) => {
  res.status(429).json({ message });
};

const baseOptions = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
};

const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * MINUTE,
  limit: 300,
  handler: jsonLimitHandler("Too many requests. Try again shortly."),
});

const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * MINUTE,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").toLowerCase().trim();
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  handler: jsonLimitHandler("Too many login attempts. Try again in 15 minutes."),
});

const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * MINUTE,
  limit: 5,
  handler: jsonLimitHandler("Too many accounts created. Try again later."),
});

const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * MINUTE,
  limit: 30,
  handler: jsonLimitHandler("Upload limit reached. Try again later."),
});

const analyzeLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * MINUTE,
  limit: 40,
  handler: jsonLimitHandler("Analysis limit reached. Try again later."),
});

const authSlowDown = slowDown({
  windowMs: 15 * MINUTE,
  delayAfter: 3,
  delayMs: (hits) => Math.min(hits * 250, 2000),
  maxDelayMs: 2000,
});

module.exports = {
  apiLimiter,
  loginLimiter,
  registerLimiter,
  uploadLimiter,
  analyzeLimiter,
  authSlowDown,
};
