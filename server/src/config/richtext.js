const sharp = require("sharp");
const { escapeXml } = require("./caption");
const { familyFor, strokeFor, weightFor, DEFAULT_FONT } = require("./fonts");

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LINES = 4;
const MAX_CHARS = 60;
const PROBE = 2048;
const PROBE_H = 420;
const GAP = 0.14;
const BOX_PAD_X = 0.26;
const BOX_PAD_Y = 0.12;
const BOX_RADIUS = 0.14;

const cache = new Map();

const colour = (value, fallback) => (HEX.test(String(value || "")) ? value : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

async function measureText(text, family, weight, fontSize) {
  const key = `${text}|${family}|${weight}|${fontSize}`;
  if (cache.has(key)) return cache.get(key);

  const svg = Buffer.from(
    `<svg width="${PROBE}" height="${PROBE_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="10" y="${Math.round(PROBE_H * 0.72)}" font-family="${escapeXml(family)}" ` +
      `font-size="${fontSize}" font-weight="${weight}" fill="#fff">${escapeXml(text)}</text></svg>`,
  );

  const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const baseline = Math.round(PROBE_H * 0.72);
  const result =
    maxX < 0
      ? { width: 0, height: 0, above: 0, below: 0 }
      : {
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          above: baseline - minY,
          below: maxY - baseline,
          offset: minX - 10,
        };

  cache.set(key, result);
  return result;
}

function normalise(options) {
  const source = Array.isArray(options.lines) && options.lines.length
    ? options.lines
    : String(options.text || "")
        .split("\n")
        .map((text) => ({ text }));

  return source
    .map((line) => ({
      text: String(line.text || "").trim().slice(0, MAX_CHARS),
      font: line.font || options.font || DEFAULT_FONT,
      scale: clamp(Number(line.scale ?? options.scale ?? 0.14), 0.04, 0.42),
      color: colour(line.color, colour(options.color, "#FFFFFF")),
      strokeColor: colour(line.strokeColor, colour(options.strokeColor, "#000000")),
      box: line.box ? colour(line.box, "#FF2A1A") : null,
    }))
    .filter((line) => line.text)
    .slice(0, MAX_LINES);
}

async function buildRichHeadline(options, width, height, basis) {
  const unit = Number.isFinite(basis) ? basis : height;
  const lines = normalise(options);
  if (!lines.length) return null;

  const align = options.align === "center" ? "center" : "left";
  const rotate = clamp(Number(options.rotate ?? 0), -12, 12);

  const measured = [];

  for (const line of lines) {
    const family = familyFor(line.font);
    const weight = weightFor(line.font);
    let fontSize = Math.round(unit * line.scale);
    let box = await measureText(line.text, family, weight, fontSize);

    const room = width * (line.box ? 1 - BOX_PAD_X * 0.5 : 1);

    for (let guard = 0; guard < 60 && box.width > room && fontSize > 12; guard += 1) {
      fontSize = Math.max(12, Math.round(fontSize * Math.min(0.96, room / box.width)));
      box = await measureText(line.text, family, weight, fontSize);
    }

    measured.push({ ...line, family, weight, fontSize, metrics: box });
  }

  const blocks = measured.map((m) => m.metrics.height + m.fontSize * GAP);
  const total = blocks.reduce((a, b) => a + b, 0);
  let cursor = Math.max(0, (height - total) / 2);

  const parts = [];

  for (const line of measured) {
    const { metrics } = line;
    const boxW = metrics.width + (line.box ? line.fontSize * BOX_PAD_X * 2 : 0);
    const left = align === "center" ? Math.round((width - boxW) / 2) : 0;
    const baseline = Math.round(cursor + metrics.above + (line.box ? line.fontSize * BOX_PAD_Y : 0));
    const textX = left + (line.box ? line.fontSize * BOX_PAD_X : 0) - (metrics.offset || 0);

    if (line.box) {
      const padY = line.fontSize * BOX_PAD_Y;
      parts.push(
        `<rect x="${left}" y="${Math.round(cursor)}" width="${Math.round(boxW)}" ` +
          `height="${Math.round(metrics.height + padY * 2)}" rx="${Math.round(line.fontSize * BOX_RADIUS)}" ` +
          `fill="${line.box}"/>`,
      );
    }

    const common =
      `x="${Math.round(textX)}" y="${baseline}" font-family="${escapeXml(line.family)}" ` +
      `font-size="${line.fontSize}" font-weight="${line.weight}"`;

    if (!line.box) {
      const stroke = Math.max(2, Math.round(line.fontSize * strokeFor(line.font)));
      parts.push(
        `<text ${common} fill="none" stroke="${line.strokeColor}" stroke-width="${stroke}" ` +
          `stroke-linejoin="round">${escapeXml(line.text)}</text>`,
      );
    }

    parts.push(`<text ${common} fill="${line.color}">${escapeXml(line.text)}</text>`);

    cursor += metrics.height + line.fontSize * GAP + (line.box ? line.fontSize * BOX_PAD_Y * 2 : 0);
  }

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<g transform="rotate(${rotate} ${width / 2} ${height / 2})">${parts.join("")}</g>` +
      `</svg>`,
  );
}

module.exports = { buildRichHeadline, measureText, normalise, MAX_LINES };
