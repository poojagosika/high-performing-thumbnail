const sharp = require("sharp");

const MAX_TEXT = 120;
const MAX_LINES = 3;
const MIN_SCALE = 0.06;
const MAX_SCALE = 0.3;
const DEFAULT_SCALE = 0.16;
const SIDE_MARGIN = 0.06;
const STROKE_RATIO = 0.16;
const ADVANCE = 0.58;
const LINE_HEIGHT = 1.08;
const MIN_FONT_PX = 14;
const FIT_PASSES = 4;
const HEX = /^#[0-9a-fA-F]{6}$/;
const POSITIONS = ["top", "middle", "bottom"];
const FONT = "DejaVu Sans, FreeSans, Liberation Sans, Helvetica, Arial, sans-serif";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function wrap(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function layout(text, width, height, scale) {
  const usable = width * (1 - SIDE_MARGIN * 2);
  let fontSize = Math.round(height * scale);
  let lines = wrap(text, Math.max(1, Math.floor(usable / (fontSize * ADVANCE))));
  const fits = () =>
    lines.length <= MAX_LINES &&
    Math.max(...lines.map((l) => l.length)) * fontSize * ADVANCE <= usable;

  while (fontSize > MIN_FONT_PX && !fits()) {
    fontSize -= 1;
    lines = wrap(text, Math.max(1, Math.floor(usable / (fontSize * ADVANCE))));
  }

  return { fontSize, lines: lines.slice(0, MAX_LINES) };
}

function baselines(position, height, fontSize, lineCount) {
  const step = fontSize * LINE_HEIGHT;
  const block = step * lineCount;
  const pad = height * 0.05;

  const top =
    position === "top"
      ? pad + fontSize
      : position === "middle"
        ? (height - block) / 2 + fontSize
        : height - pad - block + fontSize;

  return Array.from({ length: lineCount }, (_, i) => Math.round(top + i * step));
}

function buildSvg(options, width, height, override) {
  const scale = clamp(Number(options.scale) || DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
  const position = POSITIONS.includes(options.position) ? options.position : "bottom";
  const color = HEX.test(options.color || "") ? options.color : "#FFFFFF";
  const strokeColor = HEX.test(options.strokeColor || "") ? options.strokeColor : "#000000";

  const text = String(options.text || "").slice(0, MAX_TEXT).trim();
  const { fontSize, lines } = override || layout(text, width, height, scale);
  const ys = baselines(position, height, fontSize, lines.length);
  const ratio = Number(options.strokeRatio) > 0 ? Number(options.strokeRatio) : STROKE_RATIO;
  const stroke = Math.max(2, Math.round(fontSize * ratio));
  const x = Math.round(width / 2);

  const runs = (fill, strokeAttrs) =>
    lines
      .map(
        (line, i) =>
          `<text x="${x}" y="${ys[i]}" fill="${fill}"${strokeAttrs}>${escapeXml(line)}</text>`,
      )
      .join("");

  const family = typeof options.fontFamily === "string" && /^[\w ,'"-]{1,120}$/.test(options.fontFamily)
    ? options.fontFamily
    : FONT;

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<g font-family="${escapeXml(family)}" font-size="${fontSize}" font-weight="bold" text-anchor="middle">` +
      runs("none", ` stroke="${strokeColor}" stroke-width="${stroke}" stroke-linejoin="round"`) +
      runs(color, "") +
      `</g></svg>`,
  );
}

async function inkBox(buffer) {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let left = info.width, right = -1, top = info.height, bottom = -1, count = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width + x] > 40) {
        count += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  return { count, left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
}

async function inkCount(buffer) {
  const { data } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += 1) if (data[i] > 200) n += 1;
  return n;
}

const probeRender = (svg, width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: svg, left: 0, top: 0 }])
    .png()
    .toBuffer();

async function fitSvg(options, width, height) {
  const scale = clamp(Number(options.scale) || DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
  let current = layout(options.text, width, height, scale);
  const maxW = width * (1 - SIDE_MARGIN * 2);
  const maxH = height * (1 - SIDE_MARGIN * 2);

  for (let i = 0; i < FIT_PASSES; i += 1) {
    const svg = buildSvg(options, width, height, current);
    const box = await probeRender(svg, width, height).then(inkBox);

    if (box.count === 0) return { svg, box };
    if (box.width <= maxW && box.height <= maxH) return { svg, box };

    const shrink = Math.min(maxW / box.width, maxH / box.height) * 0.98;
    const next = Math.max(MIN_FONT_PX, Math.floor(current.fontSize * shrink));
    if (next === current.fontSize) return { svg, box };

    current = {
      fontSize: next,
      lines: layout(options.text, width, height, next / height).lines,
    };
  }

  const svg = buildSvg(options, width, height, current);
  return { svg, box: await probeRender(svg, width, height).then(inkBox) };
}

async function renderCaption(input, options) {
  const text = String(options?.text || "").trim();
  if (!text) return null;

  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return null;

  const { svg, box } = await fitSvg({ ...options, text }, meta.width, meta.height);

  if (box.count === 0) {
    const error = new Error("Text could not be rendered on this server");
    error.code = "NO_GLYPHS";
    throw error;
  }

  return sharp(input)
    .composite([{ input: svg, left: 0, top: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

module.exports = {
  renderCaption,
  buildSvg,
  layout,
  baselines,
  escapeXml,
  inkCount,
  inkBox,
  fitSvg,
  POSITIONS,
  MAX_TEXT,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_SCALE,
  MAX_LINES,
};
