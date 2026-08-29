const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");

const SIGNATURES = [
  {
    ext: "jpg",
    mimetypes: ["image/jpeg", "image/jpg"],
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    mimetypes: ["image/png"],
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: "webp",
    mimetypes: ["image/webp"],
    test: (b) =>
      b.length >= 12 &&
      b.toString("latin1", 0, 4) === "RIFF" &&
      b.toString("latin1", 8, 12) === "WEBP",
  },
];

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  return SIGNATURES.find((sig) => sig.test(buffer)) || null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"), false);
    }
  },
});

function persistImage(req, res, next) {
  if (!req.file) return next();

  const signature = detectImage(req.file.buffer);

  if (!signature) {
    return res
      .status(400)
      .json({ message: "File is not a valid JPEG, PNG, or WebP image" });
  }

  if (!signature.mimetypes.includes(req.file.mimetype)) {
    return res
      .status(400)
      .json({ message: "File contents do not match the declared image type" });
  }

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${signature.ext}`;

  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
  } catch {
    return res.status(500).json({ message: "Failed to store upload" });
  }

  req.file.filename = filename;
  req.file.buffer = undefined;
  next();
}

function serveUploadsGuard(req, res, next) {
  const ext = path.extname(req.path).slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(404).json({ message: "Not found" });
  }
  next();
}

function uploadErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Image must be 5MB or smaller" });
    }
    return res.status(400).json({ message: "Invalid upload" });
  }
  if (err) {
    return res.status(400).json({ message: err.message || "Invalid upload" });
  }
  next();
}

module.exports = upload;
module.exports.upload = upload;
module.exports.persistImage = persistImage;
module.exports.uploadErrorHandler = uploadErrorHandler;
module.exports.serveUploadsGuard = serveUploadsGuard;
module.exports.detectImage = detectImage;
module.exports.ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
