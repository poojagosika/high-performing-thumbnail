const sharp = require("sharp");

const SAMPLE = 64;
const OPAQUE = 128;
const MIN_VISIBLE = 0.02;

const GAIN_RANGE = [0.55, 2.2];
const LIFT_RANGE = [-110, 110];
const SATURATION_RANGE = [0.25, 2.4];
const SATURATION_PASSES = 3;
const SATURATION_TOLERANCE = 1.2;
const TEMPERATURE_PASSES = 4;
const WARMTH_TOLERANCE = 1;
const WARMTH_RANGE = [-40, 40];
const TEMPERATURE_RANGE = [0.72, 1.38];
const EXPONENT_RANGE = [0.6, 1.7];

const AXES = ["brightness", "contrast", "saturation", "warmth"];
const TONE_AXES = ["shadows", "highlights"];

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
  let gSum = 0;
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
    gSum += g;
    bSum += b;
    lSum += l;
    satSum += max === 0 ? 0 : (max - min) / max;
  }

  if (seen / total < MIN_VISIBLE) return null;

  const lMean = lSum / seen;
  let varSum = 0;
  for (let i = 0; i < seen; i += 1) varSum += (lum[i] - lMean) ** 2;

  const sorted = Array.from(lum.slice(0, seen)).sort((a, b) => a - b);
  const quartile = Math.max(1, Math.round(seen / 4));
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

  return {
    shadows: round2((mean(sorted.slice(0, quartile)) / 255) * 100),
    highlights: round2((mean(sorted.slice(-quartile)) / 255) * 100),
    brightness: round2((lMean / 255) * 100),
    contrast: round2((Math.sqrt(varSum / seen) / 128) * 100),
    saturation: round2((satSum / seen) * 100),
    warmth: round2(((rSum - bSum) / seen / 255) * 100),
    channels: {
      r: round2(rSum / seen),
      g: round2(gSum / seen),
      b: round2(bSum / seen),
    },
    coverage: round2((seen / total) * 100),
  };
}

async function linearRGB(input, gains, offsets) {
  const meta = await sharp(input).metadata();
  const a = meta.hasAlpha ? [...gains, 1] : gains;
  const b = meta.hasAlpha ? [...offsets, 0] : offsets;

  return sharp(input).linear(a, b).png().toBuffer();
}

function temperatureCoefficients(mine, target) {
  if (!mine.channels || !target.channels) return null;

  const grey = (c) => (c.r + c.g + c.b) / 3 || 1;
  const mineGrey = grey(mine.channels);
  const targetGrey = grey(target.channels);

  const ratio = (key) => {
    const want = target.channels[key] / targetGrey;
    const have = mine.channels[key] / mineGrey;
    return have > 0.01 ? want / have : 1;
  };

  return [ratio("r"), ratio("g"), ratio("b")].map((v) => clamp(v, ...TEMPERATURE_RANGE));
}

function exponentFor(mine, target) {
  const from = clamp(mine / 100, 0.004, 0.996);
  const to = clamp(target / 100, 0.004, 0.996);
  return clamp(Math.log(to) / Math.log(from), ...EXPONENT_RANGE);
}

function curveFor(kind, exponent) {
  const lut = new Uint8Array(256);

  for (let v = 0; v < 256; v += 1) {
    const x = v / 255;
    const y = kind === "highlight" ? 1 - (1 - x) ** exponent : x ** exponent;
    lut[v] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }

  return lut;
}

async function applyCurve(input, lut) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function toneRange(current, stats, target, kind, strength) {
  const key = kind === "highlight" ? "highlights" : "shadows";
  if (!Number.isFinite(stats[key]) || !Number.isFinite(target[key])) return current;

  const exponent = toward(exponentFor(stats[key], target[key]), 1, strength);
  if (Math.abs(exponent - 1) < 0.02) return current;

  return applyCurve(current, curveFor(kind, exponent));
}

function planGrade(mine, target, strength = 1) {
  const s = clamp(Number.isFinite(strength) ? strength : 1, 0, 1);

  const wanted = clamp(target.contrast / Math.max(mine.contrast, 1), ...GAIN_RANGE);
  const gain = toward(wanted, 1, s);
  const brightness = toward(target.brightness, mine.brightness, s);
  const lift = clamp(((brightness - gain * mine.brightness) / 100) * 255, ...LIFT_RANGE);

  return { gain: round2(gain), lift: Math.round(lift), strength: s };
}

async function balance(input, mine, target, strength) {
  let current = input;
  let stats = mine;

  for (let pass = 0; pass < TEMPERATURE_PASSES; pass += 1) {
    const coefficients = temperatureCoefficients(stats, target);
    if (!coefficients) return { buffer: current, stats, applied: pass > 0 };

    const scaled = coefficients.map((c) => toward(c, 1, strength));
    if (scaled.every((c) => Math.abs(c - 1) < 0.01)) break;

    const next = await linearRGB(current, scaled, [0, 0, 0]);
    const measured = await measure(next);
    if (!measured) break;

    current = next;
    stats = measured;

    if (Math.abs(stats.warmth - target.warmth) <= WARMTH_TOLERANCE) break;
  }

  return { buffer: current, stats, applied: true };
}

async function saturate(input, mine, target, strength) {
  let current = input;
  let stats = mine;

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

  return { buffer: current, stats };
}

async function grade(input, target, options = {}) {
  if (!target || !AXES.every((k) => Number.isFinite(target[k]))) return null;

  const mine = options.measured || (await measure(input));
  if (!mine) return null;

  const strength = clamp(Number.isFinite(options.strength) ? options.strength : 1, 0, 1);

  const whiteBalance = options.whiteBalance !== false;
  const balanced = whiteBalance
    ? await balance(input, mine, target, strength)
    : { buffer: input, stats: mine, applied: false };

  let current = balanced.buffer;
  let stats = balanced.stats;

  const plan = planGrade(stats, target, strength);
  current = await linearRGB(
    current,
    [plan.gain, plan.gain, plan.gain],
    [plan.lift, plan.lift, plan.lift],
  );

  stats = await measure(current);
  if (!stats) return current;

  if (!balanced.applied) {
    const shift = Math.round(
      clamp(((target.warmth - stats.warmth) / 100) * 255 * 0.5 * strength, ...WARMTH_RANGE),
    );

    if (shift !== 0) {
      current = await linearRGB(current, [1, 1, 1], [shift, 0, -shift]);
      stats = (await measure(current)) || stats;
    }
  }

  const saturated = await saturate(current, stats, target, strength);
  current = saturated.buffer;
  stats = saturated.stats;

  for (const kind of ["highlight", "shadow"]) {
    const next = await toneRange(current, stats, target, kind, strength);
    if (next === current) continue;

    const measured = await measure(next);
    if (!measured) break;

    current = next;
    stats = measured;
  }

  const settled = await saturate(current, stats, target, strength);
  return settled.buffer;
}

const axisGap = (a, b) => {
  const gaps = {};
  for (const key of AXES) gaps[key] = round2(Math.abs(a[key] - b[key]));
  return gaps;
};

const distance = (a, b) => round2(AXES.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0));

module.exports = { measure, planGrade, grade, temperatureCoefficients, curveFor, applyCurve, linearRGB, axisGap, distance, AXES, TONE_AXES, SAMPLE };
