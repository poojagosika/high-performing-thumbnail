const sharp = require("sharp");

const SAMPLE = 64;
const OPAQUE = 128;
const MIN_VISIBLE = 0.02;

const GAIN_RANGE = [0.55, 2.2];
const LIFT_RANGE = [-110, 110];
const SATURATION_RANGE = [0.25, 2.4];
const SATURATION_PASSES = 3;
const SATURATION_TOLERANCE = 2;
const WARMTH_RANGE = [-40, 40];

const AXES = ["brightness", "contrast", "saturation", "warmth"];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (v) => Math.round(v * 100) / 100;
const toward = (value, neutral, strength) => neutral + (value - neutral) * strength;

async function measure(input) {
  const { data, info } = await sharp(input)
    .resize(SAMPLE, SAMPLE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = info.width * info.height;
  const lum = new Float64Array(total);
  let seen = 0;
  let rSum = 0;
  let bSum = 0;
  let satSum = 0;
  let lSum = 0;

  for (let i = 0; i < total; i += 1) {
    if (data[i * 4 + 3] < OPAQUE) continue;

    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    lum[seen] = l;
    seen += 1;
    rSum += r;
    bSum += b;
    lSum += l;
    satSum += max === 0 ? 0 : (max - min) / max;
  }

  if (seen / total < MIN_VISIBLE) return null;

  const lMean = lSum / seen;
  let varSum = 0;
  for (let i = 0; i < seen; i += 1) varSum += (lum[i] - lMean) ** 2;

  return {
    brightness: round2((lMean / 255) * 100),
    contrast: round2((Math.sqrt(varSum / seen) / 128) * 100),
    saturation: round2((satSum / seen) * 100),
    warmth: round2(((rSum - bSum) / seen / 255) * 100),
    coverage: round2((seen / total) * 100),
  };
}

function planGrade(mine, target, strength = 1) {
  const s = clamp(Number.isFinite(strength) ? strength : 1, 0, 1);

  const wanted = clamp(target.contrast / Math.max(mine.contrast, 1), ...GAIN_RANGE);
  const gain = toward(wanted, 1, s);
  const lift = clamp(((target.brightness - gain * mine.brightness) / 100) * 255, ...LIFT_RANGE);

  return { gain: round2(gain), lift: Math.round(lift), strength: s };
}

async function grade(input, target, options = {}) {
  if (!target || !AXES.every((k) => Number.isFinite(target[k]))) return null;

  const mine = options.measured || (await measure(input));
  if (!mine) return null;

  const strength = clamp(Number.isFinite(options.strength) ? options.strength : 1, 0, 1);
  const { gain, lift } = planGrade(mine, target, strength);

  let current = await sharp(input)
    .linear([gain, gain, gain], [lift, lift, lift])
    .png()
    .toBuffer();

  let stats = await measure(current);
  if (!stats) return current;

  const shift = Math.round(
    clamp(((target.warmth - stats.warmth) / 100) * 255 * 0.5 * strength, ...WARMTH_RANGE),
  );

  if (shift !== 0) {
    current = await sharp(current).linear([1, 1, 1], [shift, 0, -shift]).png().toBuffer();
    stats = await measure(current);
    if (!stats) return current;
  }

  for (let pass = 0; pass < SATURATION_PASSES; pass += 1) {
    if (Math.abs(stats.saturation - target.saturation) <= SATURATION_TOLERANCE) break;

    const wanted = clamp(target.saturation / Math.max(stats.saturation, 1), ...SATURATION_RANGE);
    const saturation = toward(wanted, 1, strength);
    if (Math.abs(saturation - 1) < 0.01) break;

    const next = await sharp(current).modulate({ saturation }).png().toBuffer();
    const measured = await measure(next);
    if (!measured) break;

    current = next;
    stats = measured;
  }

  return current;
}

const axisGap = (a, b) => {
  const gaps = {};
  for (const key of AXES) gaps[key] = round2(Math.abs(a[key] - b[key]));
  return gaps;
};

const distance = (a, b) => round2(AXES.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0));

module.exports = { measure, planGrade, grade, axisGap, distance, AXES, SAMPLE };
