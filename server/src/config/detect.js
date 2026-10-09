const { spawn } = require("child_process");
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
  text: { hasText: false, band: null, y: null, side: null, x: null, font: null, emphasis: null, ink: null, coverage: 0, regions: 0 },
  suggested: { template: null, headlineBand: null, subjectSides: { left: 0, right: 0 } },
  available: false,
};

const missingPieces = () =>
  [
    fs.existsSync(SCRIPT) ? null : "detect.py",
    fs.existsSync(FACE_MODEL) ? null : "yunet_face.onnx",
    fs.existsSync(TEXT_MODEL) ? null : "ppocr_text.onnx",
  ].filter(Boolean);

let worker = null;
let nextId = 1;
const pending = new Map();

function settleAll() {
  for (const finish of pending.values()) finish(null);
  pending.clear();
}

function startWorker() {
  const child = spawn(PYTHON, [SCRIPT, "--serve"], { cwd: ROOT, stdio: ["pipe", "pipe", "ignore"] });
  let buffered = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffered += chunk;
    let end;
    while ((end = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      let reply = null;
      try {
        reply = JSON.parse(line);
      } catch {
        continue;
      }
      const finish = pending.get(reply && reply.id);
      if (finish) finish(reply.result);
    }
  });

  const stop = () => {
    if (worker !== child) return;
    worker = null;
    settleAll();
  };
  child.on("exit", stop);
  child.on("error", stop);
  child.stdin.on("error", () => {});

  child.unref();
  child.stdout.unref();
  child.stdin.unref();
  return child;
}

function warmUp() {
  if (!worker && !missingPieces().length) worker = startWorker();
}

function analyze(imagePath) {
  if (missingPieces().length) return Promise.resolve({ ...EMPTY });

  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ...EMPTY });
      if (worker) worker.kill();
    }, TIMEOUT_MS);

    pending.set(id, (result) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(result && !result.error ? { ...result, available: true } : { ...EMPTY });
    });

    if (!worker) worker = startWorker();
    worker.stdin.write(`${JSON.stringify({ id, path: path.resolve(imagePath) })}\n`);
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
    headlineSize: detection.text.hasText ? detection.text.size || null : null,
    headlineBlock: detection.text.hasText ? detection.text.block || null : null,
    font: detection.text.hasText ? detection.text.font || null : null,
    emphasis: detection.text.hasText ? detection.text.emphasis || null : null,
    ink: detection.text.hasText ? detection.text.ink || null : null,
    headlineCoverage: detection.text.coverage,
    subjects: { left: left.length, right: right.length },
    confidence: detection.text.hasText || big.length > 0 ? "measured" : "nothing found",
  };
}

module.exports = { analyze, warmUp, layoutFrom, missingPieces, SCRIPT, FACE_MODEL, TEXT_MODEL, EMPTY };
