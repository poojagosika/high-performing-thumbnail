const fs = require("fs");
const os = require("os");
const path = require("path");

const FONT_DIR = path.resolve(__dirname, "..", "..", "assets", "fonts");

const FONTS = [
  { key: "bebas", label: "Bebas Neue", family: "Bebas Neue", file: "BebasNeue-Regular.ttf", weight: "normal", stroke: 0.1 },
  { key: "bigshoulders", label: "Big Shoulders", family: "Big Shoulders Display", file: "BigShouldersDisplay-var.ttf", weight: "900", stroke: 0.09 },
  { key: "anton", label: "Anton", family: "Anton", file: "Anton-Regular.ttf", weight: "normal", stroke: 0.09 },
  { key: "intertight", label: "Inter Tight", family: "Inter Tight", file: "InterTight-var.ttf", weight: "900", stroke: 0.12 },
  { key: "lexend", label: "Lexend", family: "Lexend", file: "Lexend-var.ttf", weight: "900", stroke: 0.12 },
  { key: "spacegrotesk", label: "Space Grotesk", family: "Space Grotesk", file: "SpaceGrotesk-var.ttf", weight: "700", stroke: 0.12 },
  { key: "bricolage", label: "Bricolage", family: "Bricolage Grotesque", file: "BricolageGrotesque-var.ttf", weight: "800", stroke: 0.12 },
  { key: "funnel", label: "Funnel Display", family: "Funnel Display", file: "FunnelDisplay-var.ttf", weight: "800", stroke: 0.12 },
  { key: "unbounded", label: "Unbounded", family: "Unbounded", file: "Unbounded-var.ttf", weight: "900", stroke: 0.13 },
  { key: "archivo", label: "Archivo Black", family: "Archivo Black", file: "ArchivoBlack-Regular.ttf", weight: "normal", stroke: 0.14 },
  { key: "jakarta", label: "Plus Jakarta", family: "Plus Jakarta Sans", file: "PlusJakartaSans-var.ttf", weight: "800", stroke: 0.12 },
  { key: "poppins", label: "Poppins ExtraBold", family: "Poppins", file: "Poppins-ExtraBold.ttf", weight: "800", stroke: 0.12 },
  { key: "poppinsblack", label: "Poppins Black", family: "Poppins", file: "Poppins-Black.ttf", weight: "900", stroke: 0.12 },
  { key: "barlowcondensed", label: "Barlow Condensed", family: "Barlow Condensed", file: "BarlowCondensed-SemiBold.ttf", weight: "600", stroke: 0.1 },
  { key: "barlowsemi", label: "Barlow Semi Condensed", family: "Barlow Semi Condensed", file: "BarlowSemiCondensed-SemiBold.ttf", weight: "600", stroke: 0.1 },
  { key: "system", label: "Plain", family: "DejaVu Sans", file: null, weight: "bold", stroke: 0.14 },
];

const DEFAULT_FONT = "intertight";

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
