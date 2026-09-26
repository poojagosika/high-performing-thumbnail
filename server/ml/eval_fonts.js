const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "src");
require(path.join(SRC, "config/fonts")).register();

const { compose } = require(path.join(SRC, "config/compose"));
const { analyze } = require(path.join(SRC, "config/detect"));

const FAMILY = {
  anton: "condensed", bebas: "condensed", oswald: "condensed", bigshoulders: "condensed",
  barlowcondensed: "condensed", barlowsemi: "condensed",
  poppins: "geometric", poppinsblack: "geometric", montserrat: "geometric", unbounded: "geometric",
  archivo: "geometric", lexend: "geometric",
  intertight: "neutral", jakarta: "neutral", spacegrotesk: "neutral", bricolage: "neutral", funnel: "neutral",
};

const TITLES = [
  ["I ate 100 nuggets", "in one day"],
  ["Is SaaS", "really dead?"],
  ["First woman", "to pilot the shuttle"],
  ["Zero to placed", "in just 4 months"],
  ["Stop doing this", "right now"],
  ["The secret", "nobody tells you"],
  ["Cheap vs expensive", "AI tools"],
  ["We finally", "won gold"],
];

const COLOURS = ["#FFFFFF", "#FFD400", "#FFFFFF", "#F6C343", "#FFFFFF"];
const PER_FONT = Number(process.env.PER_FONT || 6);
const photos = (process.env.PHOTOS || "").split(",").filter((p) => p && fs.existsSync(p));

async function backdrop(i) {
  if (photos.length) return photos[i % photos.length];
  const colour = { r: 20 + ((i * 53) % 180), g: 30 + ((i * 97) % 160), b: 40 + ((i * 31) % 170) };
  return sharp({ create: { width: 1280, height: 720, channels: 3, background: colour } }).png().toBuffer();
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fonteval-"));
  const results = [];

  for (const font of Object.keys(FAMILY)) {
    for (let i = 0; i < PER_FONT; i += 1) {
      const [a, b] = TITLES[(i + font.length) % TITLES.length];
      const template = i % 2 ? "photo-headline" : "host-headline";
      const slot = template === "photo-headline" ? "photo" : "background";
      const lines = [
        { text: a, font, scale: 0.16, color: "#FFFFFF" },
        { text: b, font, scale: 0.16, color: COLOURS[i % COLOURS.length] },
      ];
      const buffer = await compose(template, { [slot]: await backdrop(i) }, { headline: { lines } }, {});
      const file = path.join(dir, `${font}-${i}.jpg`);
      fs.writeFileSync(file, buffer);
      const read = (await analyze(file)).text.font;
      results.push({ font, read });
    }
  }

  const exact = results.filter((r) => r.read && r.read.key === r.font).length;
  const family = results.filter((r) => r.read && r.read.family === FAMILY[r.font]).length;
  const missed = results.filter((r) => !r.read).length;

  const perFont = {};
  for (const r of results) {
    perFont[r.font] = perFont[r.font] || { right: 0, total: 0, readAs: {} };
    perFont[r.font].total += 1;
    if (r.read && r.read.key === r.font) perFont[r.font].right += 1;
    const as = r.read ? r.read.key : "nothing";
    perFont[r.font].readAs[as] = (perFont[r.font].readAs[as] || 0) + 1;
  }

  console.log(JSON.stringify({
    images: results.length,
    exactAccuracy: +(exact / results.length).toFixed(3),
    familyAccuracy: +(family / results.length).toFixed(3),
    unread: missed,
    perFont,
  }, null, 2));

  fs.rmSync(dir, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
