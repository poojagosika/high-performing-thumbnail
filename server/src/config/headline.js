const { escapeXml, layout } = require("./caption");
const { familyFor, strokeFor, weightFor, DEFAULT_FONT } = require("./fonts");

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LINES = 3;
const LINE_HEIGHT = 0.96;
const MIN_FONT = 18;
const VERTICAL_ROOM = 0.98;

const colour = (value, fallback) => (HEX.test(String(value || "")) ? value : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

function fit(text, width, height, startFont) {
  let fontSize = Math.max(MIN_FONT, startFont);

  for (let guard = 0; guard < 400; guard += 1) {
    const { lines } = layout(text, width, height, fontSize / height);
    if (lines.length * fontSize * LINE_HEIGHT <= height * VERTICAL_ROOM || fontSize <= MIN_FONT) {
      return { fontSize, lines: lines.slice(0, MAX_LINES) };
    }
    fontSize -= 2;
  }

  return layout(text, width, height, MIN_FONT / height);
}

function buildHeadline(options, width, height) {
  const text = String(options.text || "").trim();
  if (!text) return null;

  const font = options.font || DEFAULT_FONT;
  const family = familyFor(font);
  const weight = weightFor(font);

  const fill = colour(options.color, "#FFFFFF");
  const accent = colour(options.accentColor, "#FF2A1A");
  const strokeColor = colour(options.strokeColor, "#000000");
  const depthColor = colour(options.depthColor, "#1A0605");

  const rotate = clamp(Number(options.rotate ?? -4), -12, 12);
  const depth = Math.round(clamp(Number(options.depth ?? 10), 0, 28));
  const startFont = Math.round(height * clamp(Number(options.scale ?? 0.3), 0.06, 0.62));

  const { fontSize, lines } = fit(text, width, height, startFont);
  const stroke = Math.max(3, Math.round(fontSize * strokeFor(font)));

  const step = fontSize * LINE_HEIGHT;
  const block = step * lines.length;
  const top = (height - block) / 2 + fontSize * 0.82;
  const x = Math.round(width / 2);

  const lineColour = (index) =>
    lines.length > 1 && index >= Math.ceil(lines.length / 2) ? accent : fill;

  const run = (attrs, dx, dy, colourAt) =>
    lines
      .map((line, i) => {
        const y = Math.round(top + i * step) + dy;
        const paint = colourAt ? colourAt(i) : "";
        return `<text x="${x + dx}" y="${y}"${paint}${attrs}>${escapeXml(line)}</text>`;
      })
      .join("");

  const extrusion = Array.from({ length: depth }, (_, d) =>
    run(` fill="${depthColor}"`, d + 1, d + 1, null),
  ).join("");

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<g transform="rotate(${rotate} ${width / 2} ${height / 2})" ` +
      `font-family="${escapeXml(family)}" font-size="${fontSize}" font-weight="${weight}" ` +
      `text-anchor="middle" letter-spacing="${Math.round(fontSize * -0.02)}">` +
      extrusion +
      run(` fill="none" stroke="${strokeColor}" stroke-width="${stroke}" stroke-linejoin="round"`, 0, 0, null) +
      run("", 0, 0, (i) => ` fill="${lineColour(i)}"`) +
      `</g></svg>`,
  );
}

module.exports = { buildHeadline, fit, MAX_LINES };
