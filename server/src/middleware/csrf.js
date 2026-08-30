const crypto = require("crypto");
const {
  allowedOrigins,
  csrfCookieOptions,
  CSRF_SECRET_COOKIE,
  CSRF_HEADER,
  JWT_SECRET,
} = require("../config/security");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const EXEMPT_PATHS = new Set(["/api/auth/csrf"]);

function deriveToken(secret) {
  return crypto.createHmac("sha256", JWT_SECRET).update(secret).digest("hex");
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function originAllowed(req) {
  const origin = req.get("origin");
  if (origin) return allowedOrigins.includes(origin);

  const referer = req.get("referer");
  if (referer) {
    try {
      return allowedOrigins.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return true;
}

function issueCsrfToken(req, res) {
  let secret = req.cookies?.[CSRF_SECRET_COOKIE];

  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
    secret = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_SECRET_COOKIE, secret, csrfCookieOptions);
  }

  res.json({ csrfToken: deriveToken(secret) });
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PATHS.has(req.path)) return next();

  if (!originAllowed(req)) {
    return res.status(403).json({ message: "Request origin not allowed" });
  }

  const secret = req.cookies?.[CSRF_SECRET_COOKIE];
  const provided = req.get(CSRF_HEADER);

  if (!secret || !provided) {
    return res.status(403).json({ code: "CSRF_INVALID", message: "Invalid CSRF token" });
  }

  if (!timingSafeEqual(deriveToken(secret), provided)) {
    return res.status(403).json({ code: "CSRF_INVALID", message: "Invalid CSRF token" });
  }

  next();
}

module.exports = { issueCsrfToken, requireCsrf, deriveToken };
