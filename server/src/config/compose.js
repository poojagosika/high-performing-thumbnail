const sharp = require("sharp");
const { CANVAS_W, CANVAS_H, byId, pixelRect } = require("./templates");
const { buildSvg, layout: textLayout } = require("./caption");
const { familyFor, DEFAULT_FONT } = require("./fonts");

const PLACEHOLDER = { r: 24, g: 24, b: 32 };
const clamp01 = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 1));

async function imageLayer(slot, source, override) {
  const rect = pixelRect(slot.rect);
  const zoom = clamp01(override?.zoom, 0.5, 3);
  const width = Math.max(1, Math.round(rect.width * zoom));
  const height = Math.max(1, Math.round(rect.height * zoom));

  const fitted = await sharp(source)
    .resize(width, height, { fit: slot.cutout ? "inside" : "cover", withoutEnlargement: false })
    .png()
    .toBuffer();

  const meta = await sharp(fitted).metadata();
  const dx = Math.round((override?.dx || 0) * rect.width);
  const dy = Math.round((override?.dy || 0) * rect.height);

  const left = rect.left + Math.round((rect.width - meta.width) / 2) + dx;
  const top = rect.top + Math.round((rect.height - meta.height) / 2) + dy;

  return { input: fitted, left, top, z: slot.z };
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
  return {
    input: {
      create: { width: rect.width, height: rect.height, channels: 4, background: { ...PLACEHOLDER, alpha: 0.55 } },
    },
    left: rect.left,
    top: rect.top,
    z: slot.z,
  };
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
