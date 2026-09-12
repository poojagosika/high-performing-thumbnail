const sharp = require("sharp");
const { CANVAS_W, CANVAS_H, byId, pixelRect } = require("./templates");
const { buildSvg, layout: textLayout, escapeXml } = require("./caption");
const { familyFor, strokeFor, DEFAULT_FONT } = require("./fonts");

const PLACEHOLDER = { r: 24, g: 24, b: 32 };
const clamp01 = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 1));

async function imageLayer(slot, source, override) {
  const rect = pixelRect(slot.rect);
  const zoom = clamp01(override?.zoom, 0.5, 3);
  const anchor = override?.anchor || slot.anchor || "center";

  const fitted = slot.cutout
    ? await sharp(source)
        .resize({ height: Math.max(1, Math.round(rect.height * zoom)), withoutEnlargement: false })
        .png()
        .toBuffer()
    : await sharp(source)
        .resize(
          Math.max(1, Math.round(rect.width * zoom)),
          Math.max(1, Math.round(rect.height * zoom)),
          { fit: "cover", withoutEnlargement: false },
        )
        .png()
        .toBuffer();

  const meta = await sharp(fitted).metadata();
  const dx = Math.round((override?.dx || 0) * rect.width);
  const dy = Math.round((override?.dy || 0) * rect.height);

  const anchored =
    anchor === "left"
      ? rect.left
      : anchor === "right"
        ? rect.left + rect.width - meta.width
        : rect.left + Math.round((rect.width - meta.width) / 2);

  const bottomAligned = slot.cutout
    ? rect.top + rect.height - meta.height
    : rect.top + Math.round((rect.height - meta.height) / 2);

  return { input: fitted, left: anchored + dx, top: bottomAligned + dy, z: slot.z };
}

const LINE_HEIGHT = 1.1;
const VERTICAL_ROOM = 0.94;
const MIN_FONT = 16;

function fitToSlot(text, width, height, startFont) {
  let fontSize = Math.max(MIN_FONT, startFont);

  for (let guard = 0; guard < 400; guard += 1) {
    const { lines } = textLayout(text, width, height, fontSize / height);
    const blockHeight = lines.length * fontSize * LINE_HEIGHT;

    if (blockHeight <= height * VERTICAL_ROOM || fontSize <= MIN_FONT) {
      return { fontSize, lines };
    }
    fontSize -= 2;
  }

  return textLayout(text, width, height, MIN_FONT / height);
}

function placeholderLayer(slot) {
  const rect = pixelRect(slot.rect);
  const inset = 6;
  const w = Math.max(1, rect.width - inset * 2);
  const h = Math.max(1, rect.height - inset * 2);
  const label = escapeXml(slot.label || slot.key);
  const fontSize = Math.max(16, Math.min(34, Math.round(rect.width / 14)));
  const hint = slot.cutout ? "background will be removed" : "";

  const svg = Buffer.from(
    `<svg width="${rect.width}" height="${rect.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${inset}" y="${inset}" width="${w}" height="${h}" rx="14" ` +
      `fill="rgba(28,28,38,0.82)" stroke="rgba(255,255,255,0.35)" stroke-width="3" stroke-dasharray="14 10"/>` +
      `<g font-family="DejaVu Sans, sans-serif" text-anchor="middle" fill="rgba(255,255,255,0.72)">` +
      `<text x="${rect.width / 2}" y="${rect.height / 2 - 4}" font-size="${fontSize}" font-weight="bold">+ ${label}</text>` +
      (hint
        ? `<text x="${rect.width / 2}" y="${rect.height / 2 + fontSize}" font-size="${Math.round(fontSize * 0.62)}" fill="rgba(255,255,255,0.45)">${hint}</text>`
        : "") +
      `</g></svg>`,
  );

  return { input: svg, left: rect.left, top: rect.top, z: slot.z };
}

function textLayer(slot, override) {
  const settings = { ...(slot.defaults || {}), ...(override || {}) };
  const text = String(settings.text || "").trim();
  if (!text) return null;

  const rect = pixelRect(slot.rect);
  const canvasScale = clamp01(Number(settings.scale), 0.04, 0.3);
  const fitted = fitToSlot(text, rect.width, rect.height, Math.round(canvasScale * CANVAS_H));

  const svg = buildSvg(
    {
      text,
      position: "middle",
      color: settings.color,
      strokeColor: settings.strokeColor,
      fontFamily: familyFor(settings.font || DEFAULT_FONT),
      strokeRatio: strokeFor(settings.font || DEFAULT_FONT),
    },
    rect.width,
    rect.height,
    fitted,
  );

  return { input: svg, left: rect.left, top: rect.top, z: slot.z };
}

async function compose(templateId, assets = {}, overrides = {}) {
  const template = byId(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const layers = [];

  for (const slot of template.slots) {
    if (slot.type === "text") {
      const layer = textLayer(slot, overrides[slot.key]);
      if (layer) layers.push(layer);
      continue;
    }

    const source = assets[slot.key];
    if (source) {
      layers.push(await imageLayer(slot, source, overrides[slot.key]));
    } else {
      layers.push(placeholderLayer(slot));
    }
  }

  layers.sort((a, b) => a.z - b.z);

  return sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: { r: 14, g: 14, b: 18 } },
  })
    .composite(layers.map(({ input, left, top }) => ({ input, left, top })))
    .jpeg({ quality: 90 })
    .toBuffer();
}

module.exports = { compose, imageLayer, textLayer, placeholderLayer, CANVAS_W, CANVAS_H };
