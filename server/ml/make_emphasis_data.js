const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "src");
require(path.join(SRC, "config/fonts")).register();

const { compose } = require(path.join(SRC, "config/compose"));
const { FONTS } = require(path.join(SRC, "config/fonts"));

const OUT = process.env.OUT;
const COUNT = Number(process.env.COUNT || 200);
const SEED = Number(process.env.SEED || 1);
const photos = (process.env.PHOTOS || "").split(",").filter((p) => p && fs.existsSync(p));

const STYLES = ["none", "colour", "box", "ring", "gradient"];
const TEMPLATES = ["host-headline", "photo-headline", "photo-bottom", "three-panel"];
const HEROES = FONTS.map((f) => f.key).filter((k) => k !== "system");

const WORDS = (
  "same bugs gold win lose final day secret truth money rich free crazy insane fail stop now never why how " +
  "live exclusive india team medal record fastest biggest worst best first last new old real fake over dead " +
  "saas code ai tools cheap vs expensive rules tips guide hack viral return home back again finally"
).split(" ");

const COLOURS = ["#FFD400", "#FF3B30", "#22C55E", "#F6C343", "#00B4FF", "#FF8A00"];
const BOXES = ["#E4161B", "#FFD400", "#1E6BFF", "#111111", "#22C55E"];
const RINGS = ["#E52521", "#FFD400", "#FFE600", "#F6C343", "#FFFFFF", "#22C55E", "#00B4FF"];
const GRADIENTS = [["#FFF1A8", "#FFC21A"], ["#FFFFFF", "#AAB3C0"], ["#FFE259", "#FF7A00"], ["#FF9933", "#FFFFFF", "#138808"]];

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  if (!OUT) throw new Error("OUT is required");
  fs.mkdirSync(OUT, { recursive: true });
  const rand = random(SEED);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const backdrop = async () => {
    if (photos.length && rand() < 0.75) return pick(photos);
    const colour = { r: Math.floor(rand() * 200), g: Math.floor(rand() * 200), b: Math.floor(rand() * 200) };
    return sharp({ create: { width: 1280, height: 720, channels: 3, background: colour } }).png().toBuffer();
  };

  const labels = [];

  for (let i = 0; i < COUNT; i += 1) {
    const template = pick(TEMPLATES);
    const style = STYLES[i % STYLES.length];
    const count = rand() < 0.5 ? 2 : 3;
    const font = pick(HEROES);
    const italic = rand() < 0.3;
    const target = style === "none" ? -1 : rand() < 0.7 ? count - 1 : 0;

    const lines = [];
    for (let l = 0; l < count; l += 1) {
      const words = l === target && style === "ring" ? [pick(WORDS)] : [pick(WORDS), ...(rand() < 0.6 ? [pick(WORDS)] : [])];
      const line = { text: words.join(" "), font, scale: 0.14, color: "#FFFFFF", italic };

      if (l === target) {
        if (style === "colour") line.color = pick(COLOURS);
        if (style === "box") {
          line.box = pick(BOXES);
          if (line.box === "#FFD400") line.color = "#111111";
        }
        if (style === "ring") {
          line.ring = pick(RINGS);
          line.ringThick = 0.025 + rand() * 0.07;
        }
        if (style === "gradient") line.gradient = pick(GRADIENTS);
      }
      lines.push(line);
    }

    const assets = {};
    if (template === "three-panel") {
      assets.panelLeft = await backdrop();
      assets.panelCenter = await backdrop();
      assets.panelRight = await backdrop();
    } else if (template === "host-headline") {
      assets.background = await backdrop();
      assets.host = await backdrop();
    } else {
      assets.photo = await backdrop();
    }

    const file = `${String(i).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, file), await compose(template, assets, { headline: { lines } }, {}));
    labels.push({ file, style, line: target < 0 ? null : target === 0 ? "first" : "last", template });
  }

  fs.writeFileSync(path.join(OUT, "labels.json"), JSON.stringify(labels));
  console.log(`wrote ${labels.length} thumbnails to ${OUT}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
