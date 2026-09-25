const sharp = require("sharp");
const { CANVAS_W, CANVAS_H, byId, pixelRect } = require("./templates");
const { buildSvg, layout: textLayout, escapeXml } = require("./caption");
const { familyFor, strokeFor, weightFor, DEFAULT_FONT } = require("./fonts");
const { buildHeadline } = require("./headline");
const { buildRichHeadline } = require("./richtext");
const { grade, measure, isFlat } = require("./grade");
const { planRecompose } = require("./recompose");
const { paletteFrom } = require("./plan");

const PLACEHOLDER = { r: 24, g: 24, b: 32 };
const MAX_UPSCALE = 2.5;
const SUBJECT_STRENGTH = 0.7;
const SUBJECT_STRENGTH_FLAT = 0.28;
const HALO = 9;

const DARK_AT = 31;
const LIGHT_AT = 60;
const VIGNETTE_MAX = 0.72;
const SCRIM_MAX = 0.42;
const HALO_MAX = 0.82;
const TEXT_SCRIM = 0.86;
const TEXT_SCRIM_REACH = 0.14;
const EXTEND_BELOW = 0.92;
const EXTEND_FEATHER = 0.18;
const EXTEND_BLUR = 28;

const clamp01 = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 1));

function moodOf(referenceStyle) {
  if (!referenceStyle || !Number.isFinite(referenceStyle.brightness)) return 1;
  const span = LIGHT_AT - DARK_AT;
  return Math.max(0, Math.min(1, (LIGHT_AT - referenceStyle.brightness) / span));
}

const depthFor = (mood) => ({
  vignette: Math.max(0.04, VIGNETTE_MAX * mood),
  scrim: Math.max(0.06, SCRIM_MAX * mood),
  halo: Math.max(0.3, HALO_MAX * mood),
});

async function haloFor(fitted, meta, alpha = HALO_MAX) {
  const width = meta.width + HALO * 2;
  const height = meta.height + HALO * 2;

  return sharp(fitted)
    .extend({
      top: HALO, bottom: HALO, left: HALO, right: HALO,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extractChannel("alpha")
    .blur(HALO * 0.45)
    .linear(1.5, -18)
    .blur(HALO * 0.45)
    .linear(alpha, 0)
    .raw()
    .toBuffer()
    .then((mask) =>
      sharp({ create: { width, height, channels: 3, background: { r: 5, g: 5, b: 8 } } })
        .joinChannel(mask, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer(),
    )
    .catch(() => null);
}

async function frameBackground(buffer, referenceStyle) {
  if (!referenceStyle) return buffer;

  try {
    const plan = await planRecompose(buffer, referenceStyle, {
      minWidth: Math.round(CANVAS_W / MAX_UPSCALE),
      minHeight: Math.round(CANVAS_H / MAX_UPSCALE),
    });

    if (!plan || !plan.crop) return buffer;
    return await sharp(buffer).extract(plan.crop).png().toBuffer();
  } catch {
    return buffer;
  }
}

async function toneBackground(buffer, referenceStyle) {
  if (referenceStyle) {
    const graded = await grade(buffer, referenceStyle);
    if (graded) return graded;
  }

  return sharp(buffer)
    .modulate({ brightness: 0.82, saturation: 1.18 })
    .linear(1.16, -20)
    .png()
    .toBuffer();
}

async function treatBackground(source, referenceStyle, depth) {
  const framed = await frameBackground(source, referenceStyle);
  const buffer = await toneBackground(framed, referenceStyle);
  const meta = await sharp(buffer).metadata();
  const edge = depth ? depth.vignette : VIGNETTE_MAX;
  const vignette = Buffer.from(
    `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><radialGradient id="v" cx="50%" cy="46%" r="76%">` +
      `<stop offset="45%" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#000" stop-opacity="${edge}"/></radialGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#v)"/></svg>`,
  );

  return sharp(buffer).composite([{ input: vignette }]).png().toBuffer();
}

function scrimLayer(slot, depth) {
  const rect = pixelRect(slot.rect);
  const outward = (slot.anchor || "center") === "right";
  const strength = depth ? depth.scrim : SCRIM_MAX;

  const svg = Buffer.from(
    `<svg width="${rect.width}" height="${rect.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="s" x1="${outward ? "100%" : "0%"}" y1="0%" x2="${outward ? "0%" : "100%"}" y2="0%">` +
      `<stop offset="0%" stop-color="#000" stop-opacity="${strength}"/>` +
      `<stop offset="62%" stop-color="#000" stop-opacity="0"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#s)"/></svg>`,
  );

  return { input: svg, left: rect.left, top: rect.top, z: slot.z - 0.75 };
}

function featherMask(width, height, anchor) {
  const edge = Math.round(EXTEND_FEATHER * 100);
  const stops =
    anchor === "right"
      ? `<stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="${edge}%" stop-color="#fff" stop-opacity="1"/>`
      : anchor === "left"
        ? `<stop offset="${100 - edge}%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>`
        : `<stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="${edge}%" stop-color="#fff" stop-opacity="1"/>` +
          `<stop offset="${100 - edge}%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>`;

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="f" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#f)"/></svg>`,
  );
}

async function extendLayers(slot, source, rect, zoom, anchor, override) {
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height) return null;
  if (meta.width / meta.height >= (rect.width / rect.height) * EXTEND_BELOW) return null;

  const base = await sharp(source)
    .resize(rect.width, rect.height, { fit: "cover" })
    .blur(EXTEND_BLUR)
    .modulate({ brightness: 0.55 })
    .png()
    .toBuffer();

  const sharpPhoto = await sharp(source)
    .resize({ height: Math.max(1, Math.round(rect.height * zoom)) })
    .png()
    .toBuffer();
  const fitted = await sharp(sharpPhoto).metadata();

  const feathered = await sharp(sharpPhoto)
    .ensureAlpha()
    .composite([{ input: featherMask(fitted.width, fitted.height, anchor), blend: "dest-in" }])
    .png()
    .toBuffer();

  const dx = Math.round((override?.dx || 0) * rect.width);
  const dy = Math.round((override?.dy || 0) * rect.height);
  const left =
    anchor === "left"
      ? rect.left
      : anchor === "right"
        ? rect.left + rect.width - fitted.width
        : rect.left + Math.round((rect.width - fitted.width) / 2);
  const top = rect.top + Math.round((rect.height - fitted.height) / 2);

  return [
    { input: base, left: rect.left, top: rect.top, z: slot.z - 0.2 },
    { input: feathered, left: left + dx, top: top + dy, z: slot.z },
  ];
}

async function imageLayer(slot, source, override, referenceStyle, depth) {
  const rect = pixelRect(slot.rect);
  const requested = override?.zoom ?? slot.defaults?.zoom;
  const zoom = clamp01(requested, 0.5, 3);
  const anchor = override?.anchor || slot.anchor || "center";

  if (slot.fill === "extend" && !slot.cutout) {
    const extended = await extendLayers(slot, source, rect, zoom, anchor, override);
    if (extended) return extended;
  }

  let fitted = slot.cutout
    ? await sharp(source)
        .resize({ height: Math.max(1, Math.round(rect.height * zoom)), withoutEnlargement: false })
        .png()
        .toBuffer()
    : await sharp(source)
        .resize(
          Math.max(1, Math.round(rect.width * zoom)),
          Math.max(1, Math.round(rect.height * zoom)),
          { fit: slot.fit === "contain" ? "inside" : "cover", withoutEnlargement: false },
        )
        .png()
        .toBuffer();

  if (slot.cutout && referenceStyle) {
    const graded = await grade(fitted, referenceStyle, {
      strength: isFlat(referenceStyle) ? SUBJECT_STRENGTH_FLAT : SUBJECT_STRENGTH,
      whiteBalance: false,
    });
    if (graded) fitted = graded;
  }

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

  const layers = [];

  if (slot.cutout) {
    const halo = await haloFor(fitted, meta, depth ? depth.halo : HALO_MAX);
    if (halo) {
      layers.push({
        input: halo,
        left: anchored + dx - HALO,
        top: bottomAligned + dy - HALO,
        z: slot.z - 0.5,
      });
    }
  }

  layers.push({ input: fitted, left: anchored + dx, top: bottomAligned + dy, z: slot.z });
  return layers;
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

function textScrimLayer(slot) {
  const reach = Math.min(CANVAS_W, Math.round((slot.rect.x + slot.rect.w + TEXT_SCRIM_REACH) * CANVAS_W));
  const fromRight = slot.scrim === "right";

  const svg = Buffer.from(
    `<svg width="${reach}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="t" x1="${fromRight ? "100%" : "0%"}" y1="0%" x2="${fromRight ? "0%" : "100%"}" y2="0%">` +
      `<stop offset="0%" stop-color="#000" stop-opacity="${TEXT_SCRIM}"/>` +
      `<stop offset="55%" stop-color="#000" stop-opacity="${TEXT_SCRIM * 0.62}"/>` +
      `<stop offset="100%" stop-color="#000" stop-opacity="0"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#t)"/></svg>`,
  );

  return { input: svg, left: fromRight ? CANVAS_W - reach : 0, top: 0, z: slot.z - 0.5 };
}

function backdropLayer(slot, referenceStyle) {
  const rect = pixelRect(slot.rect);
  const { backdrop, accent, mood } = paletteFrom(referenceStyle);
  const edgeOpacity = mood === "light" ? 0.12 : 0.55;

  const svg = Buffer.from(
    `<svg width="${rect.width}" height="${rect.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<radialGradient id="glow" cx="50%" cy="42%" r="60%">` +
      `<stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>` +
      `<stop offset="1" stop-color="${accent}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<radialGradient id="vignette" cx="50%" cy="50%" r="75%">` +
      `<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000000" stop-opacity="${edgeOpacity}"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="100%" height="100%" fill="${backdrop}"/>` +
      `<rect width="100%" height="100%" fill="url(#glow)"/>` +
      `<rect width="100%" height="100%" fill="url(#vignette)"/>` +
      `</svg>`,
  );

  return { input: svg, left: rect.left, top: rect.top, z: slot.z };
}

const BANDS = {
  top: 0.02,
  middle: 0.28,
  bottom: 0.54,
};

function bandRect(slot, band) {
  const base = pixelRect(slot.rect);
  if (!band || !(band in BANDS)) return base;

  const height = Math.min(base.height, Math.round(CANVAS_H * 0.42));
  return { ...base, top: Math.round(CANVAS_H * BANDS[band]), height };
}

async function textLayer(slot, override) {
  const settings = { ...(slot.defaults || {}), ...(override || {}) };
  const text = String(settings.text || "").trim();
  const rich = Array.isArray(settings.lines) && settings.lines.some((l) => l && String(l.text || "").trim());

  if (!text && !rich) return null;

  if (slot.style === "stack") {
    const placed = pixelRect(slot.rect);
    const svg = await buildRichHeadline(rich ? settings : { ...settings, lines: null }, placed.width, placed.height, CANVAS_H);
    return svg ? { input: svg, left: placed.left, top: placed.top, z: slot.z } : null;
  }

  if (rich) {
    const placed = bandRect(slot, settings.band);
    const svg = await buildRichHeadline(settings, placed.width, placed.height, CANVAS_H);
    return svg ? { input: svg, left: placed.left, top: placed.top, z: slot.z } : null;
  }

  const rect = pixelRect(slot.rect);

  if (slot.style === "headline") {
    const placed = bandRect(slot, settings.band);
    const svg = buildHeadline({ ...settings, text }, placed.width, placed.height);
    return svg ? { input: svg, left: placed.left, top: placed.top, z: slot.z } : null;
  }

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
      fontWeight: weightFor(settings.font || DEFAULT_FONT),
    },
    rect.width,
    rect.height,
    fitted,
  );

  return { input: svg, left: rect.left, top: rect.top, z: slot.z };
}

async function clipToCanvas(layer) {
  const meta = await sharp(layer.input).metadata();
  const cutLeft = Math.max(0, -layer.left);
  const cutTop = Math.max(0, -layer.top);
  const width = Math.min(meta.width - cutLeft, CANVAS_W - Math.max(0, layer.left));
  const height = Math.min(meta.height - cutTop, CANVAS_H - Math.max(0, layer.top));

  if (width <= 0 || height <= 0) return null;

  if (cutLeft === 0 && cutTop === 0 && width === meta.width && height === meta.height) {
    return layer;
  }

  const cropped = await sharp(layer.input)
    .extract({ left: cutLeft, top: cutTop, width, height })
    .png()
    .toBuffer();

  return { ...layer, input: cropped, left: Math.max(0, layer.left), top: Math.max(0, layer.top) };
}

async function compose(templateId, assets = {}, overrides = {}, context = {}) {
  const template = byId(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const referenceStyle = context.referenceStyle || null;
  const depth = depthFor(moodOf(referenceStyle));
  const layers = [];

  const backgrounds = template.slots.filter((s) => s.treat === "background");
  const rest = template.slots.filter((s) => s.treat !== "background");
  let subjectTarget = referenceStyle;

  for (const slot of [...backgrounds, ...rest]) {
    if (slot.type === "text") {
      const layer = await textLayer(slot, overrides[slot.key]);
      if (layer) {
        if (slot.scrim) layers.push(textScrimLayer(slot));
        layers.push(layer);
      }
      continue;
    }

    const source = assets[slot.key];

    if (!source) {
      layers.push(
        slot.treat === "background" && referenceStyle
          ? backdropLayer(slot, referenceStyle)
          : placeholderLayer(slot),
      );
      continue;
    }

    if (slot.cutout) layers.push(scrimLayer(slot, depth));

    let prepared = source;

    if (slot.treat === "background") {
      prepared = await treatBackground(source, referenceStyle, depth);
      const measured = referenceStyle ? await measure(prepared) : null;
      if (measured) subjectTarget = measured;
    }

    layers.push(...(await imageLayer(slot, prepared, overrides[slot.key], subjectTarget, depth)));
  }

  layers.sort((a, b) => a.z - b.z);

  const clipped = (await Promise.all(layers.map(clipToCanvas))).filter(Boolean);

  return sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: { r: 14, g: 14, b: 18 } },
  })
    .composite(clipped.map(({ input, left, top }) => ({ input, left, top })))
    .jpeg({ quality: 90 })
    .toBuffer();
}

module.exports = { compose, imageLayer, textLayer, placeholderLayer, clipToCanvas, moodOf, depthFor, CANVAS_W, CANVAS_H };
