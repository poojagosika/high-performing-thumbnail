const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "cutout.py");
const PYTHON = process.env.PYTHON_BIN || "python3";
const TIMEOUT_MS = 30000;
const MIN_COVERAGE = 3;
const MAX_COVERAGE = 92;

class CutoutError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const missingPieces = () => (fs.existsSync(SCRIPT) ? [] : [`script ${SCRIPT}`]);

async function hasAlpha(input) {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return false;

  const { data } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

function runScript(src, dst) {
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON,
      [SCRIPT, src, dst],
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        let parsed = null;
        try {
          parsed = JSON.parse(String(stdout).trim().split("\n").pop());
        } catch {
          parsed = null;
        }

        if (parsed && parsed.error) {
          return reject(new CutoutError(`Could not separate the subject: ${parsed.error}`, "SCRIPT_FAILED"));
        }
        if (error) {
          return reject(
            new CutoutError(
              "Subject separation is unavailable on this server. Upload a PNG with a transparent background instead.",
              "PYTHON_UNAVAILABLE",
            ),
          );
        }
        if (!parsed) {
          return reject(new CutoutError("Subject separation returned nothing readable.", "NO_OUTPUT"));
        }
        resolve(parsed);
      },
    );
  });
}

async function cutout(srcPath, dstPath) {
  const missing = missingPieces();
  if (missing.length) {
    throw new CutoutError(`Subject separation is not installed: ${missing.join(", ")}`, "NOT_INSTALLED");
  }

  if (await hasAlpha(srcPath)) {
    await sharp(srcPath).png().toFile(dstPath);
    return { coverage: null, passthrough: true };
  }

  const result = await runScript(srcPath, dstPath);

  if (result.coverage >= MIN_COVERAGE && result.coverage <= MAX_COVERAGE) {
    const trimmed = await sharp(dstPath)
      .trim({ threshold: 1 })
      .png()
      .toBuffer()
      .catch(() => null);
    if (trimmed) {
      fs.writeFileSync(dstPath, trimmed);
      const meta = await sharp(dstPath).metadata();
      result.width = meta.width;
      result.height = meta.height;
      result.trimmed = true;
    }
  }

  if (result.coverage < MIN_COVERAGE) {
    fs.rmSync(dstPath, { force: true });
    throw new CutoutError(
      "No clear subject found in that image. Use a photo where a person or object stands out from the background.",
      "NO_SUBJECT",
    );
  }

  if (result.coverage > MAX_COVERAGE) {
    fs.rmSync(dstPath, { force: true });
    throw new CutoutError(
      "That image fills the whole frame, so there is no background to remove. Use it as the background instead.",
      "NO_BACKGROUND",
    );
  }

  return { ...result, passthrough: false };
}

module.exports = {
  cutout,
  hasAlpha,
  missingPieces,
  CutoutError,
  MIN_COVERAGE,
  MAX_COVERAGE,
  SCRIPT,
};
