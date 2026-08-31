const jwt = require("jsonwebtoken");

const isProduction = process.env.NODE_ENV === "production";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Generate one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
}

if (JWT_SECRET.length < 32) {
  throw new Error(
    `JWT_SECRET is too short (${JWT_SECRET.length} chars). Use at least 32.`,
  );
}

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = process.env.JWT_ISSUER || "high-performing-thumbnail";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "high-performing-thumbnail-web";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const sameSite = (process.env.COOKIE_SAMESITE || (isProduction ? "none" : "lax"))
  .toLowerCase();

const secure =
  sameSite === "none" ? true : process.env.COOKIE_SECURE === "true" || isProduction;

const cookieOptions = {
  httpOnly: true,
  secure,
  sameSite,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
};

const clearCookieOptions = {
  httpOnly: cookieOptions.httpOnly,
  secure: cookieOptions.secure,
  sameSite: cookieOptions.sameSite,
  path: cookieOptions.path,
  ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
};

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CLIENT_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const CSRF_SECRET_COOKIE = "csrfSecret";
const CSRF_HEADER = "x-csrf-token";

const csrfCookieOptions = {
  httpOnly: true,
  secure: cookieOptions.secure,
  sameSite: cookieOptions.sameSite,
  maxAge: cookieOptions.maxAge,
  path: "/",
  ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
};

const signToken = (userId, tokenVersion = 0) =>
  jwt.sign({ id: userId, v: tokenVersion }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

const verifyToken = (token) =>
  jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

module.exports = {
  isProduction,
  cookieOptions,
  clearCookieOptions,
  signToken,
  verifyToken,
  BCRYPT_ROUNDS,
  allowedOrigins,
  csrfCookieOptions,
  CSRF_SECRET_COOKIE,
  CSRF_HEADER,
  JWT_SECRET,
};
