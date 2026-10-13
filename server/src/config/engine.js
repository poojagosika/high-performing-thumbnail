const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const detect = require("./detect");
const cutout = require("./cutout");
const { UPLOAD_DIR } = require("./upload");

const PYTHON = process.env.PYTHON_BIN || "python3";
const PACKAGES = ["cv2", "numpy", "PIL", "rembg"];
const MODELS = ["yunet_face.onnx", "ppocr_text.onnx", "font_reader.npz", "emphasis_reader.npz", "ink_reader.npz"];
const MODEL_DIR = path.resolve(__dirname, "..", "..", "assets", "models");

function pythonPackages() {
  const script = `import importlib.util, json\nprint(json.dumps({n: importlib.util.find_spec(n) is not None for n in ${JSON.stringify(PACKAGES)}}))`;
  const run = spawnSync(PYTHON, ["-c", script], { timeout: 10000, encoding: "utf8" });
  if (run.error || run.status !== 0) return { python: false, packages: {} };
  try {
    return { python: true, packages: JSON.parse(run.stdout.trim().split("\n").pop()) };
  } catch {
    return { python: true, packages: {} };
  }
}

function uploadsWritable() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function engineStatus() {
  const { python, packages } = pythonPackages();
  const models = Object.fromEntries(MODELS.map((m) => [m, fs.existsSync(path.join(MODEL_DIR, m))]));
  const readerReady = python && ["cv2", "numpy"].every((p) => packages[p]) && !detect.missingPieces().length;
  const cutoutReady = python && ["rembg", "PIL", "numpy"].every((p) => packages[p]) && !cutout.missingPieces().length;
  const uploads = uploadsWritable();

  return {
    ok: readerReady && cutoutReady && uploads && Object.values(models).every(Boolean),
    python: { bin: PYTHON, found: python, packages },
    reader: readerReady,
    cutout: cutoutReady,
    models,
    uploads,
  };
}

module.exports = { engineStatus };
