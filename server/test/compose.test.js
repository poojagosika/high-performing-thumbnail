const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");

require(path.join(SRC, "config/fonts")).register();

const { compose } = require(path.join(SRC, "config/compose"));
const { TEMPLATES, byId, pixelRect, CANVAS_W, CANVAS_H } = require(path.join(SRC, "config/templates"));
const { FONTS, familyFor, missingFiles } = require(path.join(SRC, "config/fonts"));
const { cutout, hasAlpha, missingPieces, MIN_COVERAGE } = require(path.join(SRC, "config/cutout"));
const { buildSvg } = require(path.join(SRC, "config/caption"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "compose-test-"));
const tmp = (n) => path.join(DIR, n);

const flat = (w, h, rgb) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .jpeg()
    .toBuffer();

const blob = (w, h, cx, cy, r) => {
  const b = Buffer.alloc(w * h * 3, 18);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) {
        const v = Math.round(255 * (1 - d / r));
        const i = (y * w + x) * 3;
        b[i] = v; b[i + 1] = Math.round(v * 0.7); b[i + 2] = Math.round(v * 0.5);
      }
    }
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

const pixelAt = async (buf, x, y) => {
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * CANVAS_W + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

(async () => {
  console.log("\nbundled assets are present");
  check("all font files exist", missingFiles().length === 0, missingFiles().map((f) => f.file).join(","));
  check("cutout script and model exist", missingPieces().length === 0, missingPieces().join(","));

  console.log("\nevery template composes at YouTube's size");
  for (const template of TEMPLATES) {
    const buf = await compose(template.id, {}, {});
    const meta = await sharp(buf).metadata();
    check(`${template.id} is ${CANVAS_W}x${CANVAS_H}`,
      meta.width === CANVAS_W && meta.height === CANVAS_H, `${meta.width}x${meta.height}`);
    check(`${template.id} is under 2MB`, buf.length < 2 * 1024 * 1024, `${(buf.length / 1024).toFixed(0)}KB`);
  }

  console.log("\nempty slots render a placeholder, never a crash");
  const empty = await compose("two-subject", {}, {});
  check("composes with no assets at all", Buffer.isBuffer(empty) && empty.length > 1000);

  console.log("\nslot geometry: content lands where the template says");
  const red = await flat(400, 400, [220, 30, 30]);
  const green = await flat(400, 400, [30, 200, 60]);
  const split = await compose("split-screen", { before: red, after: green }, {});
  const beforeRect = pixelRect(byId("split-screen").slots.find((s) => s.key === "before").rect);
  const afterRect = pixelRect(byId("split-screen").slots.find((s) => s.key === "after").rect);
  const lp = await pixelAt(split, beforeRect.left + 40, beforeRect.top + 40);
  const rp = await pixelAt(split, afterRect.left + 40, afterRect.top + 40);
  check("the left panel holds the left image", lp[0] > 150 && lp[1] < 100, JSON.stringify(lp));
  check("the right panel holds the right image", rp[1] > 130 && rp[0] < 120, JSON.stringify(rp));

  console.log("\naspect handling: no stretching, whatever the upload shape");
  for (const [w, h, label] of [[800, 600, "4:3"], [600, 600, "1:1"], [540, 960, "9:16"]]) {
    const src = await blob(w, h, w / 2, h / 2, Math.min(w, h) * 0.35);
    const out = await compose("side-panel", { background: src }, {});
    const meta = await sharp(out).metadata();
    check(`a ${label} upload still yields ${CANVAS_W}x${CANVAS_H}`,
      meta.width === CANVAS_W && meta.height === CANVAS_H, `${meta.width}x${meta.height}`);
  }

  const wide = await flat(1600, 200, [200, 40, 40]);
  const covered = await compose("side-panel", { background: wide }, {});
  const corners = await Promise.all([
    pixelAt(covered, 5, 5), pixelAt(covered, CANVAS_W - 6, 5), pixelAt(covered, 5, CANVAS_H - 6),
  ]);
  check("a very wide image still COVERS the slot, no letterbox gaps",
    corners.every((c) => c[0] > 120), JSON.stringify(corners));

  console.log("\nz-order: background behind, text in front");
  const bg = await flat(1280, 720, [10, 10, 200]);
  const layered = await compose("side-panel", { background: bg },
    { headline: { text: "TOP LAYER", font: "anton", color: "#FFFFFF", scale: 0.16 } });
  const bgRect = pixelRect(byId("side-panel").slots.find((s) => s.key === "background").rect);
  const bgPixel = await pixelAt(layered, bgRect.left + 20, bgRect.top + 20);
  check("background fills its slot", bgPixel[2] > 150, JSON.stringify(bgPixel));

  const { data } = await sharp(layered).greyscale().raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  for (let i = 0; i < data.length; i += 1) if (data[i] > 230) white += 1;
  check("text is drawn ON TOP of the background", white > 2000, String(white));

  console.log("\none edit changes one thing");
  const subject = await blob(600, 600, 300, 300, 200);
  const baseAssets = { background: bg, subjectLeft: subject, subjectRight: subject };
  const baseText = { headline: { text: "SAME WORDS", font: "anton", color: "#FFFFFF", scale: 0.15 } };
  const first = await compose("two-subject", baseAssets, baseText);
  const same = await compose("two-subject", baseAssets, baseText);
  check("the same inputs give a byte-identical image", first.equals(same));

  const moved = await compose("two-subject", baseAssets,
    { ...baseText, subjectRight: { dx: 0.1 } });
  check("moving one subject changes the output", !first.equals(moved));

  const leftRect = pixelRect(byId("two-subject").slots.find((s) => s.key === "subjectLeft").rect);
  const beforeLeft = await pixelAt(first, leftRect.left + 100, leftRect.top + 300);
  const afterLeft = await pixelAt(moved, leftRect.left + 100, leftRect.top + 300);
  check("and leaves the OTHER subject untouched",
    JSON.stringify(beforeLeft) === JSON.stringify(afterLeft),
    `${JSON.stringify(beforeLeft)} vs ${JSON.stringify(afterLeft)}`);

  console.log("\nfonts are real choices, not all the same fallback");
  const inks = {};
  for (const font of FONTS) {
    const svg = buildSvg({ text: "NEPAL FLOOD", fontFamily: familyFor(font.key) }, 900, 200);
    const probe = await sharp({ create: { width: 900, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: svg }]).raw().toBuffer();
    let ink = 0;
    for (let i = 0; i < probe.length; i += 3) if (probe[i] > 200) ink += 1;
    inks[font.key] = ink;
  }
  console.log(`      ${Object.entries(inks).map(([k, v]) => `${k}:${v}`).join("  ")}`);
  check("every bundled font renders differently", new Set(Object.values(inks)).size === FONTS.length,
    JSON.stringify(inks));

  console.log("\ntext slot keeps the caption module's protections");
  const nasty = buildSvg({ text: '</text><script>x</script>', fontFamily: familyFor("anton") }, 600, 200).toString();
  check("injection escaped", !nasty.includes("<script>"));
  check("document still closes", nasty.trim().endsWith("</svg>"));
  const badColour = buildSvg({ text: "hi", color: 'red" onload="x' }, 600, 200).toString();
  check("a bad colour falls back, never interpolated", badColour.includes('fill="#FFFFFF"') && !badColour.includes("onload"));
  const badFamily = buildSvg({ text: "hi", fontFamily: 'x" onload="y' }, 600, 200).toString();
  check("a bad font family falls back too", !badFamily.includes("onload"));

  console.log("\ncut-out");
  const person = await blob(800, 800, 400, 400, 260);
  fs.writeFileSync(tmp("person.jpg"), person);
  const result = await cutout(tmp("person.jpg"), tmp("person.png"));
  check("a clear subject is separated", result.coverage >= MIN_COVERAGE, JSON.stringify(result));
  check("the result genuinely has alpha", await hasAlpha(tmp("person.png")));

  const flatImage = await flat(800, 450, [90, 90, 110]);
  fs.writeFileSync(tmp("flat.jpg"), flatImage);
  let refused = null;
  try {
    await cutout(tmp("flat.jpg"), tmp("flat.png"));
  } catch (error) {
    refused = error;
  }
  check("an image with no subject is REFUSED, not returned empty", refused !== null, "no error thrown");
  check("with a code the caller can act on", refused && ["NO_SUBJECT", "NO_BACKGROUND"].includes(refused.code),
    refused && refused.code);
  check("and no half-made file is left behind", !fs.existsSync(tmp("flat.png")));

  const tiny = await blob(1200, 1200, 600, 600, 130);
  fs.writeFileSync(tmp("tiny.jpg"), tiny);
  let tinyResult = null;
  try {
    tinyResult = await cutout(tmp("tiny.jpg"), tmp("tiny.png"));
  } catch (error) {
    tinyResult = { error: error.code };
  }
  console.log(`      small subject covers ${tinyResult.coverage}% of its frame`);
  check("a subject that is SMALL in frame is still accepted", !tinyResult.error,
    `refused with ${tinyResult.error}`);

  const tinyMeta = await sharp(tmp("tiny.png")).metadata();
  check("and is trimmed down to the subject, not left as padding",
    tinyMeta.width < 1200 && tinyMeta.height < 1200,
    `${tinyMeta.width}x${tinyMeta.height} from 1200x1200`);

  const passthrough = await cutout(tmp("person.png"), tmp("person2.png"));
  check("an already-transparent PNG passes through untouched", passthrough.passthrough === true);

  console.log("\ncut-outs actually composite with transparency");
  const withCut = await compose("two-subject",
    { background: await flat(1280, 720, [200, 20, 20]), subjectLeft: fs.readFileSync(tmp("person.png")) }, {});
  const cornerRect = pixelRect(byId("two-subject").slots.find((s) => s.key === "subjectLeft").rect);
  const corner = await pixelAt(withCut, cornerRect.left + 3, cornerRect.top + 3);
  check("the background shows through the cut-out's empty corner",
    corner[0] > 40 && corner[0] > corner[1] * 3 && corner[0] > corner[2] * 3,
    `${JSON.stringify(corner)} — expected red-dominant, darkened by the background treatment`);

  console.log("\nunknown template");
  let threw = false;
  try { await compose("no-such-template", {}, {}); } catch { threw = true; }
  check("an unknown template id throws rather than rendering nothing", threw);

  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
