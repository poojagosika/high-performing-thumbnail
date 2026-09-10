const sharp = require("sharp");
const { compositionDistance } = require("./imageStyle");

const WORK_W = 256;
const ASPECT = 16 / 9;
const MIN_OUT_W = 640;
const MIN_OUT_H = 360;
const MIN_SCALE = 0.55;
const SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.6];
const STEPS = 7;
const MIN_GAIN = 1.5;

const round2 = (v) => Math.round(v * 100) / 100;

async function luminanceField(input) {
  const { data, info } = await sharp(input)
    .resize(WORK_W, Math.round(WORK_W / ASPECT), { fit: "inside" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const sat = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      rowSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sat[(y + 1) * (width + 1) + (x + 1)] = sat[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  return { sat, width, height };
}

function regionSum(field, x0, y0, x1, y1) {
  const w = field.width + 1;
  return (
    field.sat[y1 * w + x1] -
    field.sat[y0 * w + x1] -
    field.sat[y1 * w + x0] +
    field.sat[y0 * w + x0]
  );
}

function gridFor(field, left, top, width, height) {
  const grid = new Array(9);
  let total = 0;

  for (let gy = 0; gy < 3; gy += 1) {
    const y0 = top + Math.round((height * gy) / 3);
    const y1 = top + Math.round((height * (gy + 1)) / 3);
    for (let gx = 0; gx < 3; gx += 1) {
      const x0 = left + Math.round((width * gx) / 3);
      const x1 = left + Math.round((width * (gx + 1)) / 3);
      const sum = regionSum(field, x0, y0, x1, y1);
      grid[gy * 3 + gx] = sum;
      total += sum;
    }
  }

  const denom = total || 1;
  return grid.map((v) => round2((v / denom) * 100));
}

function candidateRects(field) {
  const rects = [];

  for (const scale of SCALES) {
    let w = Math.floor(field.width * scale);
    let h = Math.round(w / ASPECT);

    if (h > field.height) {
      h = Math.floor(field.height * scale);
      w = Math.round(h * ASPECT);
    }

    if (w < 8 || h < 8 || w > field.width || h > field.height) continue;

    const spanX = field.width - w;
    const spanY = field.height - h;
    const stepsX = spanX > 0 ? STEPS : 1;
    const stepsY = spanY > 0 ? STEPS : 1;

    for (let iy = 0; iy < stepsY; iy += 1) {
      for (let ix = 0; ix < stepsX; ix += 1) {
        rects.push({
          left: stepsX === 1 ? 0 : Math.round((spanX * ix) / (stepsX - 1)),
          top: stepsY === 1 ? 0 : Math.round((spanY * iy) / (stepsY - 1)),
          width: w,
          height: h,
          scale,
        });
      }
    }
  }

  return rects;
}

function baselineRect(field) {
  let w = field.width;
  let h = Math.round(w / ASPECT);

  if (h > field.height) {
    h = field.height;
    w = Math.round(h * ASPECT);
  }

  return {
    left: Math.round((field.width - w) / 2),
    top: Math.round((field.height - h) / 2),
    width: w,
    height: h,
    scale: 1,
  };
}

async function planRecompose(input, referenceStyle) {
  if (!referenceStyle || !Array.isArray(referenceStyle.energyGrid)) return null;

  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return null;

  const field = await luminanceField(input);
  if (field.width < 8 || field.height < 8) return null;

  const scoreOf = (rect) =>
    compositionDistance(
      { energyGrid: gridFor(field, rect.left, rect.top, rect.width, rect.height) },
      referenceStyle,
    );

  const baseline = baselineRect(field);
  const baselineScore = scoreOf(baseline);

  let best = null;
  let bestScore = Infinity;

  for (const rect of candidateRects(field)) {
    if (rect.scale < MIN_SCALE) continue;

    const outW = Math.round((rect.width / field.width) * meta.width);
    const outH = Math.round((rect.height / field.height) * meta.height);
    if (outW < MIN_OUT_W || outH < MIN_OUT_H) continue;

    const score = scoreOf(rect);
    if (score < bestScore) {
      bestScore = score;
      best = rect;
    }
  }

  if (!best || baselineScore - bestScore < MIN_GAIN) {
    return { crop: null, before: round2(baselineScore), after: round2(baselineScore) };
  }

  const scaleX = meta.width / field.width;
  const scaleY = meta.height / field.height;

  const left = Math.max(0, Math.round(best.left * scaleX));
  const top = Math.max(0, Math.round(best.top * scaleY));
  const width = Math.min(meta.width - left, Math.round(best.width * scaleX));
  const height = Math.min(meta.height - top, Math.round(best.height * scaleY));

  if (width < MIN_OUT_W || height < MIN_OUT_H) {
    return { crop: null, before: round2(baselineScore), after: round2(baselineScore) };
  }

  return {
    crop: { left, top, width, height },
    before: round2(baselineScore),
    after: round2(bestScore),
  };
}

async function recompose(input, referenceStyle) {
  const plan = await planRecompose(input, referenceStyle);
  if (!plan || !plan.crop) return plan ? { ...plan, buffer: null } : null;

  const buffer = await sharp(input).extract(plan.crop).jpeg({ quality: 92 }).toBuffer();

  return { ...plan, buffer };
}

module.exports = {
  planRecompose,
  recompose,
  gridFor,
  luminanceField,
  ASPECT,
  MIN_OUT_W,
  MIN_OUT_H,
  MIN_GAIN,
};
