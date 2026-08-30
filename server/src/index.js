const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

const { allowedOrigins } = require("./config/security");

const { serveUploadsGuard, UPLOAD_DIR } = require("./config/upload");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    maxAge: 600,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(require("./middleware/csrf").requireCsrf);
app.use("/api", require("./middleware/rateLimit").apiLimiter);

// Connect to MongoDB
connectDB();

// Static files
app.use("/uploads", serveUploadsGuard, express.static(UPLOAD_DIR, {
  index: false,
  dotfiles: "deny",
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
}));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/thumbnails", require("./routes/thumbnails"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/comparisons", require("./routes/comparisons"));
app.use("/api/collections", require("./routes/collections"));

// Sweep thumbnails that have outlived the trash retention window
const { purgeExpired } = require("./controllers/thumbnailController");
purgeExpired().catch(() => {});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  const body = { message: status === 500 ? "Server error" : err.message };
  if (process.env.NODE_ENV !== "production") {
    body.error = err.message;
    body.stack = err.stack;
  }
  res.status(status).json(body);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
