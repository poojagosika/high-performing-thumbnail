const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");

const {
  measure,
  grade,
  planGrade,
  temperatureCoefficients,
  curveFor,
  distance,
  axisGap,
  AXES,
  TONE_AXES,
} = require(path.join(SRC, "config/grade"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "grade-test-"));
const tmp = (n) => path.join(DIR, n);

const scene = (w, h, tint) => {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const v = 70 + 55 * Math.sin(x / 21) * Math.cos(y / 17);
      b[i] = Math.max(0, Math.min(255, v * tint[0]));
      b[i + 1] = Math.max(0, Math.min(255, v * tint[1]));
      b[i + 2] = Math.max(0, Math.min(255, v * tint[2]));
    }
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

const cutout = async (w, h, tint) => {
  const body = await scene(w, h, tint);
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 3}" ry="${h / 3}" fill="#fff"/></svg>`,
  );
  return sharp(body).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
};

(async () => {
  const warm = await scene(400, 300, [1.35, 0.95, 0.6]);
  const cool = await scene(400, 300, [0.6, 0.9, 1.4]);
  const target = await measure(cool);
  const before = await measure(warm);

  console.log("\nevery axis moves toward the target, not just the total");
  const graded = await grade(warm, target);
  const after = await measure(graded);
  console.log(`      before ${JSON.stringify(axisGap(before, target))}`);
  console.log(`      after  ${JSON.stringify(axisGap(after, target))}`);

  for (const axis of AXES) {
    const was = Math.abs(before[axis] - target[axis]);
    const now = Math.abs(after[axis] - target[axis]);
    check(`${axis} is closer`, now <= was + 0.5, `${was.toFixed(2)} -> ${now.toFixed(2)}`);
  }

  console.log("\nthe tonal range lands too, which is what the extra two filters are for");
  for (const axis of TONE_AXES) {
    const was = Math.abs(before[axis] - target[axis]);
    const now = Math.abs(after[axis] - target[axis]);
    check(`${axis} is closer`, now <= was + 0.5, `${was.toFixed(2)} -> ${now.toFixed(2)}`);
  }

  console.log("\ngrading something against ITSELF barely moves it");
  const selfGraded = await measure(await grade(cool, target));
  check("the total distance stays near zero", distance(selfGraded, target) < 2,
    String(distance(selfGraded, target)));
  check("and no single axis drifts", AXES.every((a) => Math.abs(selfGraded[a] - target[a]) < 1.5),
    JSON.stringify(axisGap(selfGraded, target)));

  console.log("\nstrength scales the correction");
  const none = await measure(await grade(warm, target, { strength: 0 }));
  const half = await measure(await grade(warm, target, { strength: 0.5 }));
  const full = after;
  const d = (m) => distance(m, target);
  console.log(`      strength 0: ${d(none)}   0.5: ${d(half)}   1: ${d(full)}`);
  check("strength 0 leaves the image where it was", Math.abs(d(none) - d(before)) < 1.5,
    `${d(before)} vs ${d(none)}`);
  check("strength 1 moves furthest", d(full) < d(half), `${d(half)} vs ${d(full)}`);
  check("and 0.5 lands in between", d(half) < d(none) && d(half) > d(full),
    `${d(none)} / ${d(half)} / ${d(full)}`);

  console.log("\nmeasuring a cut-out ignores what is behind the transparent pixels");
  const subject = await cutout(300, 300, [1.3, 1.0, 0.7]);
  fs.writeFileSync(tmp("subject.png"), subject);
  const onBlack = await measure(
    await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: subject }]).png().toBuffer(),
  );
  const alone = await measure(subject);
  check("the subject measures the same either way",
    Math.abs(alone.brightness - onBlack.brightness) > 3,
    `alone ${alone.brightness} vs flattened-on-black ${onBlack.brightness} — should differ, proving transparency is skipped`);
  check("and it reports the coverage it actually saw", alone.coverage > 15 && alone.coverage < 90,
    String(alone.coverage));

  console.log("\ngrading a cut-out keeps its transparency");
  const gradedCut = await grade(subject, target);
  const cutMeta = await sharp(gradedCut).metadata();
  check("alpha survives the whole six-filter pass", cutMeta.hasAlpha === true);
  const { data } = await sharp(gradedCut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 8) clear += 1;
  check("the transparent area is still transparent", clear > 1000, String(clear));

  console.log("\nrefusing to guess");
  const empty = await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer();
  check("a fully transparent image measures as nothing", (await measure(empty)) === null);
  check("and grading it returns null, not a graded rectangle", (await grade(empty, target)) === null);
  check("a target missing the axes is refused", (await grade(warm, { brightness: 10 })) === null);
  check("a null target is refused", (await grade(warm, null)) === null);

  console.log("\nolder stored reference styles still work");
  const legacy = { ...target };
  delete legacy.channels;
  const legacyOut = await grade(warm, legacy);
  check("a style saved before channel means existed still grades", legacyOut !== null);
  const legacyStats = await measure(legacyOut);
  check("and still gets closer overall", distance(legacyStats, target) < distance(before, target),
    `${distance(before, target)} -> ${distance(legacyStats, target)}`);

  console.log("\nthe grey-world temperature beats the additive shift it replaced");
  check("it wins on the same input", distance(after, target) < distance(legacyStats, target),
    `grey-world ${distance(after, target)} vs additive ${distance(legacyStats, target)}`);

  console.log("\nwhite balance is skippable, because grey-world wrecks skin tone");
  const kept = await measure(await grade(warm, target, { whiteBalance: false }));
  const rebalanced = await measure(await grade(warm, target, { whiteBalance: true }));
  check("skipping it leaves the colour cast alone",
    Math.abs(kept.warmth - before.warmth) < Math.abs(rebalanced.warmth - before.warmth),
    `kept ${kept.warmth}, rebalanced ${rebalanced.warmth}, was ${before.warmth}`);
  check("but brightness is still matched", Math.abs(kept.brightness - target.brightness) < 3,
    `${kept.brightness} vs ${target.brightness}`);
  check("and so is contrast", Math.abs(kept.contrast - target.contrast) < 4,
    `${kept.contrast} vs ${target.contrast}`);

  console.log("\ntemperature coefficients");
  const coefficients = temperatureCoefficients(before, target);
  check("a warm image is told to pull red down and blue up",
    coefficients[0] < 1 && coefficients[2] > 1, JSON.stringify(coefficients));
  check("an image against itself is told to do nothing",
    temperatureCoefficients(target, target).every((c) => Math.abs(c - 1) < 0.02),
    JSON.stringify(temperatureCoefficients(target, target)));
  check("a target with no channel means gives no coefficients",
    temperatureCoefficients(before, legacy) === null);

  console.log("\nthe tone curves are monotonic, so they never posterise or invert");
  for (const kind of ["shadow", "highlight"]) {
    for (const exponent of [0.6, 1, 1.7]) {
      const lut = curveFor(kind, exponent);
      let rising = true;
      for (let v = 1; v < 256; v += 1) if (lut[v] < lut[v - 1]) rising = false;
      check(`${kind} at ${exponent} never goes backwards`, rising);
    }
  }
  check("an exponent of 1 is the identity curve",
    Array.from(curveFor("shadow", 1)).every((v, i) => Math.abs(v - i) <= 1));
  check("both curves keep black at black and white at white",
    curveFor("shadow", 1.7)[0] === 0 && curveFor("shadow", 1.7)[255] === 255 &&
    curveFor("highlight", 1.7)[0] === 0 && curveFor("highlight", 1.7)[255] === 255);

  console.log("\nthe contrast plan pivots on the image's own mean, not mid-grey");
  const dark = { brightness: 20, contrast: 20, saturation: 30, warmth: 0 };
  const bright = { brightness: 60, contrast: 40, saturation: 30, warmth: 0 };
  const plan = planGrade(dark, bright);
  check("it doubles contrast", Math.abs(plan.gain - 2) < 0.05, String(plan.gain));
  check("and lifts to land on the wanted brightness, which mid-grey pivoting would not",
    Math.abs((plan.gain * dark.brightness + (plan.lift / 255) * 100) - bright.brightness) < 1,
    `gain ${plan.gain} lift ${plan.lift}`);

  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
