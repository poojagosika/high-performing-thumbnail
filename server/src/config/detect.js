const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "detect.py");
const FACE_MODEL = path.join(ROOT, "assets", "models", "yunet_face.onnx");
const TEXT_MODEL = path.join(ROOT, "assets", "models", "ppocr_text.onnx");
const PYTHON = process.env.PYTHON_BIN || "python3";
const TIMEOUT_MS = 30000;

const EMPTY = {
  faces: [],
  faceCount: 0,
  panels: 0,
  text: { hasText: false, band: null, y: null, side: null, x: null, font: null, coverage: 0, regions: 0 },
  suggested: { template: null, headlineBand: null, subjectSides: { left: 0, right: 0 } },
  available: false,
};

const missingPieces = () =>
  [
    fs.existsSync(SCRIPT) ? null : "detect.py",
    fs.existsSync(FACE_MODEL) ? null : "yunet_face.onnx",
    fs.existsSync(TEXT_MODEL) ? null : "ppocr_text.onnx",
  ].filter(Boolean);

function analyze(imagePath) {
  if (missingPieces().length) return Promise.resolve({ ...EMPTY });

  return new Promise((resolve) => {
    execFile(
      PYTHON,
      [SCRIPT, imagePath],
      { cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve({ ...EMPTY });

        let parsed = null;
        try {
          parsed = JSON.parse(String(stdout).trim().split("\n").pop());
        } catch {
          parsed = null;
        }

        if (!parsed || parsed.error) return resolve({ ...EMPTY });
        resolve({ ...parsed, available: true });
      },
    );
  });
}

function templateFor(big, left, right, textSide, panels) {
  const group = big.length >= 3 || (left.length && right.length && textSide === "center");
  if (group) {
    if (panels > 0) return "three-panel";
    return textSide === "left" || textSide === "right" ? "photo-headline" : "photo-bottom";
  }
  if (left.length && right.length) return "two-subject";
  if (!big.length) return textSide ? "photo-headline" : "side-panel";

  const faceSide = left.length ? "left" : "right";
  const textBeside = textSide && textSide !== "center" && textSide !== faceSide;

  if (big.length === 1) return textBeside ? "host-headline" : "host-right";
  return "photo-headline";
}

function layoutFrom(detection) {
  if (!detection || !detection.available) return null;

  const big = detection.faces.filter((f) => f.area >= 0.01);
  const left = big.filter((f) => f.cx < 0.5);
  const right = big.filter((f) => f.cx >= 0.5);
  const textSide = detection.text.hasText ? detection.text.side || null : null;

  return {
    template: templateFor(big, left, right, textSide, detection.panels || 0),
    panels: detection.panels || 0,
    headlineBand: detection.text.hasText ? detection.text.band : null,
    headlineSide: textSide,
    font: detection.text.hasText ? detection.text.font || null : null,
    headlineCoverage: detection.text.coverage,
    subjects: { left: left.length, right: right.length },
    confidence: detection.text.hasText || big.length > 0 ? "measured" : "nothing found",
  };
}

module.exports = { analyze, layoutFrom, missingPieces, SCRIPT, FACE_MODEL, TEXT_MODEL, EMPTY };
