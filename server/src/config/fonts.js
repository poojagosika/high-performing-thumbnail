const fs = require("fs");
const os = require("os");
const path = require("path");

const FONT_DIR = path.resolve(__dirname, "..", "..", "assets", "fonts");

const FONTS = [
  { key: "poppins", label: "Poppins", family: "Poppins", file: "Poppins-ExtraBold.ttf", weight: "normal", stroke: 0.12 },
  { key: "montserrat", label: "Montserrat", family: "Montserrat", file: "Montserrat-var.ttf", weight: "900", stroke: 0.12 },
  { key: "outfit", label: "Outfit", family: "Outfit", file: "Outfit-var.ttf", weight: "900", stroke: 0.12 },
  { key: "figtree", label: "Figtree", family: "Figtree", file: "Figtree-var.ttf", weight: "900", stroke: 0.12 },
  { key: "jakarta", label: "Plus Jakarta", family: "Plus Jakarta Sans", file: "PlusJakartaSans-var.ttf", weight: "800", stroke: 0.12 },
  { key: "lilita", label: "Lilita One", family: "Lilita One", file: "LilitaOne-Regular.ttf", weight: "normal", stroke: 0.11 },
  { key: "bangers", label: "Bangers", family: "Bangers", file: "Bangers-Regular.ttf", weight: "normal", stroke: 0.1 },
  { key: "archivo", label: "Archivo Black", family: "Archivo Black", file: "ArchivoBlack-Regular.ttf", weight: "normal", stroke: 0.14 },
  { key: "anton", label: "Anton", family: "Anton", file: "Anton-Regular.ttf", weight: "normal", stroke: 0.09 },
  { key: "system", label: "Plain", family: "DejaVu Sans", file: null, weight: "bold", stroke: 0.14 },
];

const DEFAULT_FONT = "poppins";

const strokeFor = (key) => byKey(key).stroke || 0.14;

const weightFor = (key) => byKey(key).weight || "bold";

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
  weightFor,
  missingFiles,
  register,
};
