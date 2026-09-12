const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");

require(path.join(SRC, "config/fonts")).register();

const { analyze, layoutFrom, missingPieces, EMPTY } = require(path.join(SRC, "config/detect"));
const { renderCaption } = require(path.join(SRC, "config/caption"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "detect-test-"));
const tmp = (n) => path.join(DIR, n);

const scene = (w, h) => {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const v = 60 + 40 * Math.sin(x / 30) * Math.cos(y / 40);
      b[i] = v; b[i + 1] = v * 0.9; b[i + 2] = v * 1.2;
    }
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

(async () => {
  console.log("\ninstallation");
  const missing = missingPieces();
  check("detector script and both models present", missing.length === 0, missing.join(", "));

  const plate = await scene(1280, 720);
  fs.writeFileSync(tmp("plain.jpg"), plate);

  console.log("\ntext detection — the thing my hand-rolled version got wrong");
  const bands = {};
  for (const band of ["top", "middle", "bottom"]) {
    const withText = await renderCaption(plate, { text: "NEPAL DISASTER", position: band, scale: 0.2 });
    fs.writeFileSync(tmp(`t_${band}.jpg`), withText);
    const result = await analyze(tmp(`t_${band}.jpg`));
    bands[band] = result.text;
    check(`${band} text is found`, result.text.hasText === true, JSON.stringify(result.text));
    check(`and placed at ${band}`, result.text.band === band,
      `got ${result.text.band} (y=${result.text.y})`);
  }

  check("THE SUGGESTION VARIES with the image, it is not a constant",
    new Set(Object.values(bands).map((b) => b.band)).size === 3,
    JSON.stringify(Object.values(bands).map((b) => b.band)));

  console.log("\nan image with no text");
  const clean = await analyze(tmp("plain.jpg"));
  check("is not called text", clean.text.hasText === false, JSON.stringify(clean.text));
  check("and offers no band", clean.text.band === null);

  console.log("\nincidental text is not mistaken for a headline");
  const badge = await sharp(plate)
    .composite([{
      input: Buffer.from(
        '<svg width="1280" height="720"><rect x="1150" y="650" width="100" height="40" rx="6" fill="#000"/>' +
        '<text x="1200" y="678" font-family="DejaVu Sans" font-size="26" fill="#fff" text-anchor="middle">20:15</text></svg>',
      ),
    }])
    .jpeg()
    .toBuffer();
  fs.writeFileSync(tmp("badge.jpg"), badge);
  const badgeResult = await analyze(tmp("badge.jpg"));
  check("a small duration badge is rejected as a headline", badgeResult.text.hasText === false,
    JSON.stringify(badgeResult.text));

  console.log("\nface detection drives the layout choice");
  const faceless = await analyze(tmp("plain.jpg"));
  check("a scene with no people finds no faces", faceless.faceCount === 0, String(faceless.faceCount));

  const layout = layoutFrom(faceless);
  check("layout still returned for a faceless image", layout !== null);
  check("and falls back to the single-image template", layout.template === "side-panel", layout.template);
  check("reporting honestly that nothing was found", layout.confidence === "nothing found", layout.confidence);

  console.log("\nROUND TRIP: the band we ask for is the band that comes out");
  const { compose } = require(path.join(SRC, "config/compose"));
  const person = await sharp(await scene(600, 800)).jpeg().toBuffer();
  const roundTrip = {};
  for (const band of ["top", "middle", "bottom"]) {
    const built = await compose(
      "two-subject",
      { background: plate, subjectLeft: person, subjectRight: person },
      { headline: { text: "NEPAL DISASTER", font: "poppins", band } },
    );
    fs.writeFileSync(tmp(`rt_${band}.jpg`), built);
    const read = await analyze(tmp(`rt_${band}.jpg`));
    roundTrip[band] = read.text.band;
    check(`asked for ${band}, rendered pixels read back as ${band}`, read.text.band === band,
      `got ${read.text.band} (y=${read.text.y})`);
  }
  check("all three bands land differently, so it is really following the band",
    new Set(Object.values(roundTrip)).size === 3, JSON.stringify(roundTrip));

  console.log("\ndegrading safely");
  const broken = await analyze(tmp("does-not-exist.jpg"));
  check("a missing file returns the empty result, never throws", broken.faceCount === 0);
  check("and is flagged unavailable rather than pretending", broken.available === false);
  check("layoutFrom refuses to guess from an unavailable detection", layoutFrom(broken) === null);
  check("layoutFrom handles null input", layoutFrom(null) === null);

  const garbage = tmp("garbage.jpg");
  fs.writeFileSync(garbage, Buffer.from("this is not an image"));
  const garbled = await analyze(garbage);
  check("unreadable data returns the empty result", garbled.available === false && garbled.faceCount === 0);

  console.log("\nthe empty result is a safe shape");
  check("it has the same keys callers expect",
    ["faces", "faceCount", "text", "suggested", "available"].every((k) => k in EMPTY));

  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
