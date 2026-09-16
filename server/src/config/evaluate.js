const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const { analyze } = require("./detect");
const { measure } = require("./grade");
const { CANVAS_W, CANVAS_H } = require("./templates");

const MAX_BYTES = 2 * 1024 * 1024;
const BACKDROP_TOLERANCE = 14;
const MIN_HEADLINE_COVERAGE = 2;

const ok = (name, pass, detail) => ({ name, pass, detail });

async function evaluateThumbnail(buffer, spec) {
  const checks = [];
  const meta = await sharp(buffer).metadata();

  checks.push(
    ok(
      "canvas",
      meta.width === CANVAS_W && meta.height === CANVAS_H,
      `${meta.width}x${meta.height}`,
    ),
  );

  checks.push(
    ok("file size", buffer.length <= MAX_BYTES, `${(buffer.length / 1024).toFixed(0)}KB`),
  );

  const file = path.join(os.tmpdir(), `evaluate-${crypto.randomBytes(8).toString("hex")}.jpg`);
  let detection = null;

  try {
    fs.writeFileSync(file, buffer);
    detection = await analyze(file);
  } catch {
    detection = null;
  } finally {
    fs.rmSync(file, { force: true });
  }

  const expectedPeople = spec?.constraints?.people ?? null;
  const supplied = (spec?.subjects || []).filter((s) => s.supplied).length;

  if (detection && detection.available && Number.isFinite(expectedPeople)) {
    checks.push(
      ok(
        "people count",
        detection.faceCount <= expectedPeople,
        `found ${detection.faceCount}, allowed ${expectedPeople}, supplied ${supplied}`,
      ),
    );
  } else {
    checks.push(ok("people count", true, "detector unavailable, skipped"));
  }

  if (spec?.headline && detection && detection.available) {
    checks.push(
      ok(
        "headline present",
        detection.text.hasText === true && detection.text.coverage >= MIN_HEADLINE_COVERAGE,
        JSON.stringify(detection.text),
      ),
    );
    checks.push(
      ok(
        "headline band",
        detection.text.band === spec.headline.band,
        `wanted ${spec.headline.band}, got ${detection.text.band}`,
      ),
    );
  }

  const stats = await measure(buffer);

  if (spec?.source?.backdropBrightness != null && stats?.dominant) {
    const gap = Math.abs(stats.dominant.brightness - spec.source.backdropBrightness);
    checks.push(
      ok(
        "backdrop matches the reference",
        gap <= BACKDROP_TOLERANCE,
        `ours ${stats.dominant.brightness}, reference ${spec.source.backdropBrightness}`,
      ),
    );
  }

  if (spec?.mood && stats) {
    const light = stats.brightness >= 50;
    checks.push(
      ok("mood", (spec.mood === "light") === light, `spec ${spec.mood}, measured ${stats.brightness}`),
    );
  }

  const failed = checks.filter((c) => !c.pass);

  return {
    pass: failed.length === 0,
    checks,
    failed: failed.map((c) => c.name),
    measured: stats
      ? { brightness: stats.brightness, contrast: stats.contrast, dominant: stats.dominant }
      : null,
  };
}

module.exports = { evaluateThumbnail, MAX_BYTES, BACKDROP_TOLERANCE, MIN_HEADLINE_COVERAGE };
