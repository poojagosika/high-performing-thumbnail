const sharp = require("sharp");

const SAMPLE = 64;
const MAX_BYTES = 8 * 1024 * 1024;

const FIXABLE = [
  { key: "brightness", label: "Brightness", weight: 1.0, tolerance: 28 },
  { key: "contrast", label: "Contrast", weight: 1.0, tolerance: 28 },
  { key: "saturation", label: "Saturation", weight: 1.0, tolerance: 32 },
  { key: "warmth", label: "Warmth", weight: 0.8, tolerance: 35 },
];

const MANUAL = [
  { key: "busyness", label: "Detail density", weight: 1.2, tolerance: 14 },
  { key: "composition", label: "Where the weight sits", weight: 1.0, tolerance: 26 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (v) => Math.round(v * 100) / 100;

async function extract(input) {
  const { data, info } = await sharp(input)
    .resize(SAMPLE, SAMPLE, { fit: "fill" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const n = width * height;
  const lum = new Float64Array(n);
  let rSum = 0;
  let bSum = 0;
  let satSum = 0;
  let lSum = 0;

  for (let i = 0; i < n; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    rSum += r;
    bSum += b;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = l;
    lSum += l;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }

  const lMean = lSum / n;
  let varSum = 0;
  for (let i = 0; i < n; i += 1) varSum += (lum[i] - lMean) ** 2;

  let edge = 0;
  let edges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      edge += Math.abs(lum[y * width + x] - lum[y * width + x + 1]);
      edges += 1;
    }
  }
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      edge += Math.abs(lum[y * width + x] - lum[(y + 1) * width + x]);
      edges += 1;
    }
  }

  const grid = new Array(9).fill(0);
  const cell = Math.floor(width / 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx = Math.min(2, Math.floor(x / cell));
      const gy = Math.min(2, Math.floor(y / cell));
      grid[gy * 3 + gx] += lum[y * width + x];
    }
  }
  const gridTotal = grid.reduce((a, b) => a + b, 0) || 1;

  return {
    brightness: round2((lMean / 255) * 100),
    contrast: round2((Math.sqrt(varSum / n) / 128) * 100),
    saturation: round2((satSum / n) * 100),
    warmth: round2(((rSum - bSum) / n / 255) * 100),
    busyness: round2((edge / edges / 255) * 100),
    energyGrid: grid.map((v) => round2((v / gridTotal) * 100)),
  };
}

function compositionDistance(a, b) {
  let total = 0;
  for (let i = 0; i < 9; i += 1) {
    total += Math.abs((a.energyGrid?.[i] ?? 0) - (b.energyGrid?.[i] ?? 0));
  }
  return round2(total / 2);
}

function gapFor(dim, mine, ref) {
  const value =
    dim.key === "composition"
      ? compositionDistance(mine, ref)
      : Math.abs(mine[dim.key] - ref[dim.key]);
  return {
    key: dim.key,
    label: dim.label,
    mine: dim.key === "composition" ? null : mine[dim.key],
    reference: dim.key === "composition" ? null : ref[dim.key],
    delta: round2(value),
    severity: Math.min(1, value / dim.tolerance) >= 0.66 ? "high" : Math.min(1, value / dim.tolerance) >= 0.33 ? "medium" : "low",
  };
}

function scoreMatch(mine, ref) {
  let sum = 0;
  let weights = 0;
  const fixable = [];
  const manual = [];

  for (const dim of [...FIXABLE, ...MANUAL]) {
    const gap = gapFor(dim, mine, ref);
    const norm = Math.min(1, gap.delta / dim.tolerance);
    sum += dim.weight * norm * norm;
    weights += dim.weight;
    (FIXABLE.includes(dim) ? fixable : manual).push(gap);
  }

  return {
    score: Math.round((1 - Math.sqrt(sum / weights)) * 100),
    fixable,
    manual,
  };
}

function gradeParams(mine, ref) {
  const contrastGain = clamp(ref.contrast / Math.max(mine.contrast, 1), 0.5, 2.5);
  const warmthShift = ((ref.warmth - mine.warmth) / 100) * 255 * 0.5;
  const base = 128 * (1 - contrastGain);
  return {
    contrastGain,
    warmthShift,
    offsets: [base + warmthShift, base, base - warmthShift],
  };
}

function applyTone(input, params) {
  return sharp(input)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .linear([params.contrastGain, params.contrastGain, params.contrastGain], params.offsets);
}

async function gradeToward(input, mine, ref) {
  const params = gradeParams(mine, ref);
  const toned = await applyTone(input, params).png().toBuffer();
  const afterTone = await extract(toned);

  const brightness = clamp(ref.brightness / Math.max(afterTone.brightness, 1), 0.4, 2.5);
  const saturation = clamp(ref.saturation / Math.max(afterTone.saturation, 1), 0.2, 3);

  return applyTone(input, params).modulate({ brightness, saturation }).jpeg({ quality: 90 }).toBuffer();
}

module.exports = {
  extract,
  scoreMatch,
  gradeToward,
  compositionDistance,
  FIXABLE,
  MANUAL,
  MAX_BYTES,
  SAMPLE,
};
