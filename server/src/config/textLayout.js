const sharp = require("sharp");
const { MIN_SCALE, MAX_SCALE } = require("./caption");

const WORK_W = 256;
const BANDS = 24;
const RUN_FRACTION = 0.25;
const CONFIDENCE_MIN = 6;
const MIN_MEDIAN = 0.5;

const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function bandProfile(input) {
  const { data, info } = await sharp(input)
    .resize(WORK_W, Math.round((WORK_W * 9) / 16), { fit: "fill" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const bands = new Array(BANDS).fill(0);
  const rowsPerBand = Math.ceil(height / BANDS);

  for (let y = 0; y < height; y += 1) {
    let energy = 0;
    for (let x = 0; x < width - 1; x += 1) {
      energy += Math.abs(data[y * width + x] - data[y * width + x + 1]);
    }
    bands[Math.min(BANDS - 1, Math.floor((y / height) * BANDS))] += energy / (width - 1);
  }

  return bands.map((v) => v / rowsPerBand);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function positionFor(bandIndex) {
  const third = BANDS / 3;
  if (bandIndex < third) return "top";
  if (bandIndex < third * 2) return "middle";
  return "bottom";
}

function readProfile(bands) {
  const peak = Math.max(...bands);
  const confidence = round2(peak / Math.max(median(bands), MIN_MEDIAN));

  if (peak <= 0 || confidence < CONFIDENCE_MIN) {
    return { hasText: false, position: null, scale: null, confidence, band: null };
  }

  const threshold = peak * RUN_FRACTION;
  const peakIndex = bands.indexOf(peak);

  let first = peakIndex;
  let last = peakIndex;
  while (first > 0 && bands[first - 1] >= threshold) first -= 1;
  while (last < BANDS - 1 && bands[last + 1] >= threshold) last += 1;

  const centre = (first + last) / 2;

  return {
    hasText: true,
    position: positionFor(centre),
    scale: round2(clamp((last - first + 1) / BANDS, MIN_SCALE, MAX_SCALE)),
    confidence,
    band: peakIndex,
  };
}

async function detectText(input) {
  try {
    return readProfile(await bandProfile(input));
  } catch {
    return { hasText: false, position: null, scale: null, confidence: 0, band: null };
  }
}

module.exports = {
  detectText,
  bandProfile,
  readProfile,
  positionFor,
  median,
  BANDS,
  CONFIDENCE_MIN,
};
