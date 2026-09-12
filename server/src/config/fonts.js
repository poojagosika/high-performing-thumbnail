const fs = require("fs");
const os = require("os");
const path = require("path");

const FONT_DIR = path.resolve(__dirname, "..", "..", "assets", "fonts");

const FONTS = [
  { key: "archivo", label: "Archivo Black", family: "Archivo Black", file: "ArchivoBlack-Regular.ttf", stroke: 0.14 },
  { key: "anton", label: "Anton", family: "Anton", file: "Anton-Regular.ttf", stroke: 0.09 },
  { key: "bebas", label: "Bebas Neue", family: "Bebas Neue", file: "BebasNeue-Regular.ttf", stroke: 0.09 },
  { key: "fjalla", label: "Fjalla One", family: "Fjalla One", file: "FjallaOne-Regular.ttf", stroke: 0.1 },
  { key: "passion", label: "Passion One", family: "Passion One", file: "PassionOne-Bold.ttf", stroke: 0.1 },
  { key: "titan", label: "Titan One", family: "Titan One", file: "TitanOne-Regular.ttf", stroke: 0.13 },
  { key: "bowlby", label: "Bowlby One", family: "Bowlby One", file: "BowlbyOne-Regular.ttf", stroke: 0.13 },
  { key: "alfa", label: "Alfa Slab One", family: "Alfa Slab One", file: "AlfaSlabOne-Regular.ttf", stroke: 0.12 },
  { key: "luckiest", label: "Luckiest Guy", family: "Luckiest Guy", file: "LuckiestGuy-Regular.ttf", stroke: 0.12 },
  { key: "system", label: "Plain", family: "DejaVu Sans", file: null, stroke: 0.14 },
];

const DEFAULT_FONT = "archivo";

const strokeFor = (key) => byKey(key).stroke || 0.14;

const byKey = (key) => FONTS.find((f) => f.key === key) || FONTS.find((f) => f.key === DEFAULT_FONT);

const familyFor = (key) => `${byKey(key).family}, DejaVu Sans, sans-serif`;

function missingFiles() {
  return FONTS.filter((f) => f.file).filter((f) => !fs.existsSync(path.join(FONT_DIR, f.file)));
}

function register() {
  const missing = missingFiles();
  if (missing.length) {
    throw new Error(
      `Bundled fonts missing from ${FONT_DIR}: ${missing.map((f) => f.file).join(", ")}`,
    );
  }

  const cacheDir = path.join(os.tmpdir(), "thumbnail-fontconfig");
  fs.mkdirSync(cacheDir, { recursive: true });

  const confPath = path.join(cacheDir, "fonts.conf");
  fs.writeFileSync(
    confPath,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>${cacheDir}</cachedir>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
</fontconfig>
`,
  );

  process.env.FONTCONFIG_FILE = confPath;
  return confPath;
}

module.exports = {
  FONTS,
  FONT_DIR,
  DEFAULT_FONT,
  byKey,
  familyFor,
  strokeFor,
  missingFiles,
  register,
};
