const { isProduction } = require("../config/security");

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (isProduction) {
      return res
        .status(503)
        .json({ message: "Bot protection is not configured" });
    }
    return next();
  }

  const token = req.body?.turnstileToken;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ message: "Bot verification required" });
  }

  const params = new URLSearchParams({
    secret,
    response: token,
    remoteip: req.ip || "",
  });

  let outcome;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return res
        .status(503)
        .json({ message: "Bot verification unavailable. Try again." });
    }

    outcome = await response.json();
  } catch {
    return res
      .status(503)
      .json({ message: "Bot verification unavailable. Try again." });
  }

  if (!outcome?.success) {
    return res
      .status(403)
      .json({ message: "Bot verification failed. Please try again." });
  }

  next();
}

module.exports = { verifyTurnstile };
