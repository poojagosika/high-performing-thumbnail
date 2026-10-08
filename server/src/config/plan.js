const { CANVAS_W, CANVAS_H, byId, DEFAULT_TEMPLATE } = require("./templates");
const { FONTS } = require("./fonts");

const MAX_HEADLINE_LINES = 3;
const LIGHT_AT = 60;
const FALLBACK_ACCENT = "#FF2A1A";
const LIGHT_BACKDROP = "#F4EEE1";
const DARK_BACKDROP = "#141418";

const HIERARCHY = {
  3: [0.13, 0.13, 0.13],
  2: [0.15, 0.15],
  1: [0.17],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? c : null);

function splitHeadline(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return balance(words, Math.min(MAX_HEADLINE_LINES, linesFor(words.length)));
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

const STACKS = new Set(["host-headline", "photo-headline", "three-panel", "photo-bottom"]);
const CONDENSED = new Set(["host-headline", "photo-headline"]);

const PAIRINGS = {
  condensed: [["anton", "barlowcondensed"], ["bebas", "barlowsemi"], ["oswald", "barlowcondensed"]],
  geometric: [["poppinsblack", "barlowcondensed"], ["montserrat", "barlowsemi"], ["archivo", "barlowcondensed"]],
  neutral: [["intertight", "barlowsemi"], ["jakarta", "barlowsemi"], ["spacegrotesk", "barlowcondensed"]],
};

const SUPPORT_FOR = { condensed: "barlowcondensed", geometric: "barlowcondensed", neutral: "barlowsemi" };
const FONT_TRUST = 0.45;
const FAMILY_TRUST = 0.6;

const RING_MAX_CHARS = 9;
const HIGHLIGHT_MIN = 110;
const FALLBACK_HIGHLIGHT = "#FFD400";
const GOLD_TOP = "#FFF1A8";
const RING_MIN = 90;
const FALLBACK_RING = "#E52521";
const DANGLING_COST = 10;
const SPREAD_COST = 0.35;
const SMALL_WORDS = new Set(["a", "an", "the", "to", "of", "in", "on", "and", "or", "for", "with", "at", "by", "is", "my", "your", "i", "vs"]);

const seedOf = (text) => [...String(text || "")].reduce((sum, c) => sum + c.charCodeAt(0), 0);

const known = (key) => FONTS.some((f) => f.key === key);

function pairingFor(template, content, read = null) {
  const pick = (family) => {
    const options = PAIRINGS[family];
    const [hero, support] = options[seedOf(content.seed) % options.length];
    return { hero, support };
  };

  const guessed = pick(CONDENSED.has(template) ? "condensed" : "geometric");
  if (known(content.font)) return { hero: content.font, support: guessed.support, source: "chosen" };

  if (read && known(read.key) && read.confidence >= FONT_TRUST) {
    return { hero: read.key, support: SUPPORT_FOR[read.family] || guessed.support, source: "read" };
  }

  if (read && PAIRINGS[read.family] && read.familyConfidence >= FAMILY_TRUST) {
    return { ...pick(read.family), source: "family" };
  }

  return { ...guessed, source: "layout" };
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

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const EMPHASIS_TRUST = 0.7;
const INK_TRUST = 0.7;
const DARK_INK = 90;
const DARK_TEXT = "#111111";
const LIGHT_BOX = 170;

function plainLine(line) {
  const { ring, box, gradient, ...rest } = line;
  return { ...rest, color: "#FFFFFF" };
}

function lineFor(name, texts, used) {
  const wanted = name === "first" ? texts[0] : name === "middle" && texts.length >= 3 ? texts[Math.floor(texts.length / 2)] : texts[texts.length - 1];
  return used.has(wanted) ? texts.find((i) => !used.has(i)) : wanted;
}

function heroBlock(next, at, used) {
  const same = (i) => next[i] && next[i].text && !used.has(i) && next[i].scale === next[at].scale && next[i].font === next[at].font;
  let start = at;
  let end = at;
  while (same(start - 1)) start -= 1;
  while (same(end + 1)) end += 1;
  return Array.from({ length: end - start + 1 }, (_, k) => start + k);
}

function emphasise(next, read, used) {
  const texts = next.map((l, i) => (l.text ? i : -1)).filter((i) => i >= 0);
  const at = lineFor(read.line, texts, used);
  if (at === undefined) return next;
  used.add(at);

  const line = next[at];
  const colour = HEX6.test(String(read.colour || "")) ? read.colour : null;

  if (read.style === "colour" && colour) next[at] = { ...line, color: lumaOf(colour) >= RING_MIN ? colour : FALLBACK_HIGHLIGHT };
  if (read.style === "ring") {
    const ring = colour && lumaOf(colour) >= RING_MIN ? colour : FALLBACK_RING;
    const heroes = heroBlock(next, at, used);
    const words = heroes.flatMap((i) => next[i].text.trim().split(/\s+/));
    const first = at === texts[0];
    const word = first ? words[0] : words[words.length - 1];

    if (words.length > 1 && word.length > 2) {
      const remaining = first ? words.slice(1) : words.slice(0, -1);
      const rebuilt = balance(remaining, Math.max(1, heroes.length)).map((text) => ({ ...line, text }));
      const circled = { ...line, text: word, ring };
      next.splice(heroes[0], heroes.length, ...(first ? [circled, ...rebuilt] : [...rebuilt, circled]));
    } else {
      next[at] = { ...line, ring };
    }
  }
  if (read.style === "box" && colour) next[at] = { ...line, box: colour, color: lumaOf(colour) >= LIGHT_BOX ? DARK_TEXT : "#FFFFFF" };
  if (read.style === "gradient") {
    const bands = (read.colours || []).filter((c) => HEX6.test(String(c)));
    next[at] = { ...line, gradient: bands.length >= 2 ? bands : [GOLD_TOP, FALLBACK_HIGHLIGHT] };
  }
  return next;
}

function inkFrom(read) {
  if (!read || !(read.confidence >= INK_TRUST) || !HEX6.test(String(read.colour || ""))) return null;
  const outline = HEX6.test(String(read.outline || "")) ? read.outline : null;
  if (!outline && lumaOf(read.colour) < DARK_INK) return null;
  return { color: read.colour, outline: outline ? { stroke: true, strokeColor: outline } : { stroke: false } };
}

function withInk(line, ink) {
  if (!ink || !line.text || line.box) return line;
  return { ...line, ...(line.color === "#FFFFFF" ? { color: ink.color } : {}), ...ink.outline };
}

function applyEmphasis(lines, read, inkRead) {
  const ink = inkFrom(inkRead);
  if (!lines) return lines;
  if (!read || !read.style || !(read.confidence >= EMPHASIS_TRUST)) return ink ? lines.map((l) => withInk(l, ink)) : lines;
  if (!lines.some((l) => l.text)) return lines;

  const next = lines.map((l) => (l.text ? withInk(plainLine(l), ink) : l));
  const reads = [read, read.also]
    .filter((r) => r && r.style && r.style !== "none" && r.confidence >= EMPHASIS_TRUST)
    .sort((a, b) => (a.style === "ring") - (b.style === "ring"));

  const used = new Set();
  return reads.reduce((acc, r) => emphasise(acc, r, used), next);
}

function stackFrom(text, template, palette, fonts) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const highlight = highlightFrom(palette);
  const hero = (t, scale, extra = {}) => ({ text: t, font: fonts.hero, scale, color: "#FFFFFF", ...extra });
  const support = (t, scale) => ({ text: t, font: fonts.support, scale, color: "#FFFFFF" });

  if (template === "photo-bottom") {
    const lines = balance(words, words.length <= 2 ? 1 : 2);
    const last = lines.length - 1;
    return [
      ...lines.map((t, i) => hero(t, 0.15, i === last && lines.length > 1 ? { gradient: [GOLD_TOP, highlight] } : {})),
      { swoosh: [palette.accent, "#FFFFFF"] },
    ];
  }

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

const COPY_ITEMS = ["font", "ink", "emphasis", "also"];
const FAMILY_LABELS = { condensed: "Condensed", geometric: "Geometric", neutral: "Clean sans" };

function withoutOff(layout, off = []) {
  if (!layout || !off.length) return layout;
  const next = { ...layout };
  if (off.includes("font")) next.font = null;
  if (off.includes("ink")) next.ink = null;

  const read = layout.emphasis;
  if (read) {
    const { also, ...main } = read;
    const second = off.includes("also") ? null : also || null;
    next.emphasis = off.includes("emphasis") ? second : { ...main, ...(second ? { also: second } : {}) };
  }
  return next;
}

function readingFrom(layout) {
  if (!layout) return null;

  const read = layout.font;
  const fontEntry = read && read.confidence >= FONT_TRUST ? FONTS.find((f) => f.key === read.key) : null;
  const font = fontEntry
    ? { key: fontEntry.key, label: fontEntry.label }
    : read && PAIRINGS[read.family] && read.familyConfidence >= FAMILY_TRUST
      ? { family: read.family, label: FAMILY_LABELS[read.family] }
      : null;

  const trusted = (e) =>
    e && e.style && e.style !== "none" && e.confidence >= EMPHASIS_TRUST
      ? { style: e.style, line: e.line || null, colour: e.colour || null, colours: e.colours || null }
      : null;
  const emphasis = trusted(layout.emphasis);
  const ink = inkFrom(layout.ink) ? { colour: layout.ink.colour, outline: layout.ink.outline || null } : null;
  const template = byId(layout.template);

  return {
    template: template ? { id: template.id, name: template.name } : null,
    font,
    ink,
    emphasis,
    also: emphasis ? trusted(layout.emphasis.also) : null,
  };
}

const SIZE_PER_HEIGHT = 0.9;
const SIZE_RANGE = [0.07, 0.2];
const SIZE_STEP = [0.6, 1.5];

function sizedLike(lines, size) {
  const peak = lines ? Math.max(0, ...lines.map((l) => Number(l.scale) || 0)) : 0;
  if (!peak || !(size > 0)) return lines;
  const target = clamp(size * SIZE_PER_HEIGHT, ...SIZE_RANGE);
  const factor = clamp(target / peak, ...SIZE_STEP);
  return lines.map((l) => (l.scale ? { ...l, scale: Math.round(l.scale * factor * 1000) / 1000 } : l));
}

function alignLike(side, subjects, fallback) {
  if (side !== "left" && side !== "right" && side !== "center") return fallback;
  if (subjects.some((s) => s.position === side)) return fallback;
  return side;
}

function planThumbnail(input = {}) {
  const { reference = {}, content = {}, assets = {} } = input;
  const style = reference.style || null;
  const layout = reference.layout || null;

  const palette = paletteFrom(style);
  const template = byId(content.template) ? content.template : templateFrom(layout, assets);
  const definition = byId(template);
  const fonts = pairingFor(template, content, layout && layout.font);
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
  const planned = stacked
    ? applyEmphasis(stackFrom(content.headline, template, palette, fonts), layout && layout.emphasis, layout && layout.ink)
    : applyEmphasis(headlineFrom(content.headline, palette, fonts.hero, palette.mood === "light"), layout && layout.emphasis, layout && layout.ink);
  const slotAlign = textSlot && textSlot.defaults && textSlot.defaults.align;
  const lines = sizedLike(planned, layout && layout.headlineSize);
  const defaultAlign = stacked && slotAlign ? slotAlign : palette.mood === "light" ? "left" : "center";

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
          align: alignLike(layout && layout.headlineSide, subjects, defaultAlign),
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
      const plain = next.find((l) => !l.box && !l.rule && !l.swoosh) || {};

      next = parts.map((text, i) => {
        const useBox = boxed && i === parts.length - 1 && parts.length > 1;
        return { ...(useBox ? boxed : plain), text, scale: round3(scales[i] * factor) };
      });
    }
  }

  if (changes.font !== undefined) {
    next = next.map((l) => (l.rule || l.swoosh ? l : { ...l, font: changes.font }));
  }

  if (changes.color !== undefined) {
    next = next.map((l) => (l.box || l.rule || l.swoosh ? l : { ...l, color: changes.color }));
  }

  if (changes.scale !== undefined) {
    const peak = peakOf(next);
    if (peak > 0) {
      const factor = Number(changes.scale) / peak;
      next = next.map((l) => (l.rule || l.swoosh ? l : { ...l, scale: round3(clamp(l.scale * factor, 0.04, 0.42)) }));
    }
  }

  return next;
}

function overridesFrom(spec) {
  if (!spec || !spec.headline) return {};

  const { lines } = spec.headline;
  const lead = lines.find((l) => l.text && !l.box) || lines[0];

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
  COPY_ITEMS,
  withoutOff,
  readingFrom,
  planThumbnail,
  overridesFrom,
  restyleLines,
  splitHeadline,
  paletteFrom,
  templateFrom,
  headlineFrom,
  stackFrom,
  applyEmphasis,
  balance,
  pairingFor,
  STACKS,
  PAIRINGS,
  MAX_HEADLINE_LINES,
  clamp,
};
