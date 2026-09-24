const { CANVAS_W, CANVAS_H, byId, DEFAULT_TEMPLATE } = require("./templates");
const { DEFAULT_FONT, byKey } = require("./fonts");

const MAX_HEADLINE_LINES = 3;
const LIGHT_AT = 60;
const FALLBACK_ACCENT = "#FF2A1A";
const LIGHT_BACKDROP = "#F4EEE1";
const DARK_BACKDROP = "#141418";

const HIERARCHY = {
  3: [0.085, 0.155, 0.062],
  2: [0.155, 0.075],
  1: [0.17],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? c : null);

function splitHeadline(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length <= 2) return [words.join(" ")];

  if (words.length <= 4) {
    const cut = Math.ceil(words.length / 2);
    return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
  }

  const lead = words.slice(0, 1).join(" ");
  const tailCount = Math.min(3, Math.max(2, Math.round((words.length - 1) / 2)));
  const middle = words.slice(1, 1 + tailCount).join(" ");
  const tail = words.slice(1 + tailCount).join(" ");

  return [lead, middle, tail].filter(Boolean).slice(0, MAX_HEADLINE_LINES);
}

function paletteFrom(style) {
  const brightness = Number.isFinite(style?.dominant?.brightness)
    ? style.dominant.brightness
    : Number.isFinite(style?.brightness)
      ? style.brightness
      : 50;

  const light = brightness >= LIGHT_AT;
  const backdrop =
    hex(style?.dominant?.hex) || (light ? LIGHT_BACKDROP : DARK_BACKDROP);

  return {
    mood: light ? "light" : "dark",
    backdrop,
    ink: light ? "#12121A" : "#FFFFFF",
    outline: light ? "#FFFFFF" : "#000000",
    accent: hex(style?.accent?.hex) || FALLBACK_ACCENT,
  };
}

function templateFrom(layout, assets = {}) {
  const wanted = layout && layout.template;
  if (byId(wanted)) return wanted;
  if (assets.subjectLeft && assets.subjectRight) return "two-subject";
  if (assets.host) return "host-right";
  return DEFAULT_TEMPLATE;
}

function headlineFrom(text, palette, font, boxed) {
  const parts = splitHeadline(text);
  if (!parts.length) return null;

  const scales = HIERARCHY[parts.length] || HIERARCHY[1];

  return parts.map((line, i) => {
    const last = i === parts.length - 1;
    const useBox = boxed && last && parts.length > 1;

    return {
      text: line,
      font,
      scale: scales[i],
      color: useBox ? "#FFFFFF" : palette.ink,
      strokeColor: palette.outline,
      ...(useBox ? { box: palette.accent } : {}),
    };
  });
}

function planThumbnail(input = {}) {
  const { reference = {}, content = {}, assets = {} } = input;
  const style = reference.style || null;
  const layout = reference.layout || null;

  const palette = paletteFrom(style);
  const template = templateFrom(layout, assets);
  const definition = byId(template);
  const font = byKey(content.font).key || DEFAULT_FONT;

  const textSlot = definition.slots.find((s) => s.type === "text");
  const subjects = definition.slots
    .filter((s) => s.type === "image" && s.cutout)
    .map((s) => ({
      slot: s.key,
      position: s.anchor || "center",
      crop: content.crop === "chest-up" ? "chest-up" : "head-up",
      supplied: Boolean(assets[s.key]),
    }));

  const band = layout && layout.headlineBand ? layout.headlineBand : "top";
  const lines = headlineFrom(content.headline, palette, font, palette.mood === "light");

  return {
    canvas: { width: CANVAS_W, height: CANVAS_H },
    template,
    mood: palette.mood,
    palette,
    subjects,
    headline: lines
      ? {
          slot: textSlot ? textSlot.key : "headline",
          align: palette.mood === "light" ? "left" : "center",
          band,
          lines,
        }
      : null,
    constraints: {
      people: subjects.length,
      exactPeople: true,
      extraText: false,
      invented: false,
    },
    source: {
      backdropBrightness: Number.isFinite(style?.dominant?.brightness)
        ? style.dominant.brightness
        : null,
      accentFound: Boolean(style?.accent),
      layoutConfidence: layout ? layout.confidence : "no reference",
    },
  };
}

const peakOf = (lines) => Math.max(0, ...lines.map((l) => Number(l.scale) || 0));
const round3 = (v) => Math.round(v * 1000) / 1000;

function restyleLines(lines, changes = {}) {
  let next = lines.map((l) => ({ ...l }));

  if (changes.text !== undefined) {
    const parts = splitHeadline(changes.text);

    if (!parts.length) {
      next = next.map((l) => ({ ...l, text: "" }));
    } else {
      const scales = HIERARCHY[parts.length] || HIERARCHY[1];
      const factor = (peakOf(next) || scales[0]) / Math.max(...scales);
      const boxed = next.find((l) => l.box);
      const plain = next.find((l) => !l.box) || next[0] || {};

      next = parts.map((text, i) => {
        const useBox = boxed && i === parts.length - 1 && parts.length > 1;
        return { ...(useBox ? boxed : plain), text, scale: round3(scales[i] * factor) };
      });
    }
  }

  if (changes.font !== undefined) {
    next = next.map((l) => ({ ...l, font: changes.font }));
  }

  if (changes.color !== undefined) {
    next = next.map((l) => (l.box ? l : { ...l, color: changes.color }));
  }

  if (changes.scale !== undefined) {
    const peak = peakOf(next);
    if (peak > 0) {
      const factor = Number(changes.scale) / peak;
      next = next.map((l) => ({ ...l, scale: round3(clamp(l.scale * factor, 0.04, 0.42)) }));
    }
  }

  return next;
}

function overridesFrom(spec) {
  if (!spec || !spec.headline) return {};

  const { lines } = spec.headline;
  const lead = lines.find((l) => !l.box) || lines[0];

  return {
    [spec.headline.slot]: {
      align: spec.headline.align,
      band: spec.headline.band,
      lines,
      text: lines.map((l) => l.text).join(" "),
      font: lead.font,
      color: lead.color,
      scale: peakOf(lines),
    },
  };
}

module.exports = {
  planThumbnail,
  overridesFrom,
  restyleLines,
  splitHeadline,
  paletteFrom,
  templateFrom,
  headlineFrom,
  MAX_HEADLINE_LINES,
  clamp,
};
