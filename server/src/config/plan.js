const { CANVAS_W, CANVAS_H, byId, DEFAULT_TEMPLATE } = require("./templates");
const { FONTS } = require("./fonts");

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

const STACKS = new Set(["host-headline", "photo-headline", "three-panel"]);
const CONDENSED = new Set(["host-headline", "photo-headline"]);

const PAIRINGS = {
  condensed: [["anton", "barlowcondensed"], ["bebas", "barlowsemi"], ["oswald", "barlowcondensed"]],
  geometric: [["poppinsblack", "barlowcondensed"], ["montserrat", "barlowsemi"], ["archivo", "barlowcondensed"]],
};

const RING_MAX_CHARS = 9;
const HIGHLIGHT_MIN = 110;
const FALLBACK_HIGHLIGHT = "#FFD400";
const RING_MIN = 90;
const FALLBACK_RING = "#E52521";
const DANGLING_COST = 10;
const SPREAD_COST = 0.35;
const SMALL_WORDS = new Set(["a", "an", "the", "to", "of", "in", "on", "and", "or", "for", "with", "at", "by", "is", "my", "your", "i", "vs"]);

const seedOf = (text) => [...String(text || "")].reduce((sum, c) => sum + c.charCodeAt(0), 0);

function pairingFor(template, content) {
  const chosen = FONTS.some((f) => f.key === content.font) ? content.font : null;
  const family = PAIRINGS[CONDENSED.has(template) ? "condensed" : "geometric"];
  const [hero, support] = family[seedOf(content.seed) % family.length];
  return { hero: chosen || hero, support };
}

function lumaOf(hexColour) {
  const n = parseInt(hexColour.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

const highlightFrom = (palette) => (lumaOf(palette.accent) >= HIGHLIGHT_MIN ? palette.accent : FALLBACK_HIGHLIGHT);

const ringFrom = (palette) => (lumaOf(palette.accent) >= RING_MIN ? palette.accent : FALLBACK_RING);

const bare = (word) => word.toLowerCase().replace(/[^a-z']/g, "");

function balance(words, wanted) {
  const n = Math.max(1, Math.min(wanted, words.length));
  if (n === 1) return words.length ? [words.join(" ")] : [];

  let best = null;
  const walk = (start, left, acc) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start)];
      const lengths = lines.map((l) => l.join(" ").length);
      const widest = Math.max(...lengths);
      const spread = widest - Math.min(...lengths);
      const dangling = lines.slice(0, -1).filter((l) => SMALL_WORDS.has(bare(l[l.length - 1]))).length;
      const cost = widest + spread * SPREAD_COST + dangling * DANGLING_COST;
      if (!best || cost < best.cost) best = { cost, lines };
      return;
    }
    for (let end = start + 1; end <= words.length - (left - 1); end += 1) {
      walk(end, left - 1, [...acc, words.slice(start, end)]);
    }
  };

  walk(0, n, []);
  return best.lines.map((l) => l.join(" "));
}

const linesFor = (count) => (count <= 2 ? 1 : count <= 4 ? 2 : 3);

function stackFrom(text, template, palette, fonts) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const highlight = highlightFrom(palette);
  const hero = (t, scale, extra = {}) => ({ text: t, font: fonts.hero, scale, color: "#FFFFFF", ...extra });
  const support = (t, scale) => ({ text: t, font: fonts.support, scale, color: "#FFFFFF" });

  if (template === "three-panel") {
    const [lead, ...rest] = words;
    return [hero(lead, 0.19, { color: highlight }), ...balance(rest, 2).map((t) => hero(t, 0.085))];
  }

  if (template === "host-headline") {
    const setupCount = words.length >= 5 ? Math.ceil(words.length * 0.35) : 0;
    const setup = setupCount ? [support(words.slice(0, setupCount).join(" "), 0.06)] : [];
    const body = words.slice(setupCount);
    const emphasis = body[body.length - 1];
    const ringed = body.length >= 2 && emphasis.length <= RING_MAX_CHARS;
    const lines = balance(ringed ? body.slice(0, -1) : body, 2);
    const scale = 0.17;

    if (ringed) return [...setup, ...lines.map((t) => hero(t, scale)), hero(emphasis, scale, { ring: ringFrom(palette) })];

    const last = lines.length - 1;
    return [...setup, ...lines.map((t, i) => hero(t, scale, i === last && lines.length > 1 ? { color: highlight } : {}))];
  }

  const lines = balance(words, linesFor(words.length));
  const last = lines.length - 1;
  return lines.map((t, i) => hero(t, 0.15, i === last && lines.length > 1 ? { color: highlight } : {}));
}

function planThumbnail(input = {}) {
  const { reference = {}, content = {}, assets = {} } = input;
  const style = reference.style || null;
  const layout = reference.layout || null;

  const palette = paletteFrom(style);
  const template = byId(content.template) ? content.template : templateFrom(layout, assets);
  const definition = byId(template);
  const fonts = pairingFor(template, content);
  const stacked = STACKS.has(template);

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
  const lines = stacked
    ? stackFrom(content.headline, template, palette, fonts)
    : headlineFrom(content.headline, palette, fonts.hero, palette.mood === "light");
  const slotAlign = textSlot && textSlot.defaults && textSlot.defaults.align;

  return {
    canvas: { width: CANVAS_W, height: CANVAS_H },
    template,
    mood: palette.mood,
    palette,
    fonts,
    subjects,
    headline: lines
      ? {
          slot: textSlot ? textSlot.key : "headline",
          align: stacked && slotAlign ? slotAlign : palette.mood === "light" ? "left" : "center",
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
      const plain = next.find((l) => !l.box && !l.rule) || {};

      next = parts.map((text, i) => {
        const useBox = boxed && i === parts.length - 1 && parts.length > 1;
        return { ...(useBox ? boxed : plain), text, scale: round3(scales[i] * factor) };
      });
    }
  }

  if (changes.font !== undefined) {
    next = next.map((l) => (l.rule ? l : { ...l, font: changes.font }));
  }

  if (changes.color !== undefined) {
    next = next.map((l) => (l.box || l.rule ? l : { ...l, color: changes.color }));
  }

  if (changes.scale !== undefined) {
    const peak = peakOf(next);
    if (peak > 0) {
      const factor = Number(changes.scale) / peak;
      next = next.map((l) => (l.rule ? l : { ...l, scale: round3(clamp(l.scale * factor, 0.04, 0.42)) }));
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
      text: lines.filter((l) => l.text).map((l) => l.text).join(" "),
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
  stackFrom,
  balance,
  pairingFor,
  STACKS,
  PAIRINGS,
  MAX_HEADLINE_LINES,
  clamp,
};
