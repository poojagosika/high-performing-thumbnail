process.env.JWT_SECRET = "x".repeat(64);

const SERVER_ROOT = require("path").join(__dirname, "..");
const sharp = require("sharp");
const style = require(`${SERVER_ROOT}/src/config/imageStyle`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const solid = (r, g, b) =>
  sharp({ create: { width: 320, height: 180, channels: 3, background: { r, g, b } } }).png().toBuffer();

const checker = (a, b, cells) => {
  const w = 320, h = 180, buf = Buffer.alloc(w * h * 3), cw = w / cells;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = (Math.floor(x / cw) + Math.floor(y / cw)) % 2 === 0 ? a : b;
    buf[(y * w + x) * 3] = c[0]; buf[(y * w + x) * 3 + 1] = c[1]; buf[(y * w + x) * 3 + 2] = c[2];
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
};

const noisy = (base, spread, seed) => {
  const w = 320, h = 180, buf = Buffer.alloc(w * h * 3);
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
  for (let i = 0; i < w * h; i += 1) for (let c = 0; c < 3; c += 1) {
    buf[i * 3 + c] = Math.max(0, Math.min(255, base[c] + (rnd() - 0.5) * spread));
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
};

const weighted = (side) => {
  const w = 320, h = 180, buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const on = side === "left" ? x < w / 3 : side === "right" ? x > (2 * w) / 3 : y < h / 3;
    const v = on ? 245 : 12;
    buf[(y * w + x) * 3] = v; buf[(y * w + x) * 3 + 1] = v; buf[(y * w + x) * 3 + 2] = v;
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
};

(async () => {
  console.log("\nsignals respond to known differences");
  const dark = await style.extract(await solid(20, 20, 20));
  const mid = await style.extract(await solid(128, 128, 128));
  const bright = await style.extract(await solid(230, 230, 230));
  check("brightness ordered dark < mid < bright",
    dark.brightness < mid.brightness && mid.brightness < bright.brightness,
    `${dark.brightness} ${mid.brightness} ${bright.brightness}`);

  const warm = await style.extract(await solid(220, 100, 40));
  const cool = await style.extract(await solid(40, 100, 220));
  const grey = await style.extract(await solid(120, 120, 120));
  check("warmth sign correct", warm.warmth > 0 && cool.warmth < 0, `${warm.warmth} / ${cool.warmth}`);
  check("grey is neutral and unsaturated", Math.abs(grey.warmth) < 1 && grey.saturation < 1);
  check("colour is saturated", warm.saturation > 50, String(warm.saturation));

  const flat = await style.extract(await checker([120, 120, 120], [125, 125, 125], 4));
  const busy = await style.extract(await checker([0, 0, 0], [255, 255, 255], 32));
  check("busyness ordered", flat.busyness < busy.busyness, `${flat.busyness} < ${busy.busyness}`);

  const lowC = await style.extract(await checker([120, 120, 120], [136, 136, 136], 4));
  const highC = await style.extract(await checker([0, 0, 0], [255, 255, 255], 4));
  check("contrast ordered", lowC.contrast < highC.contrast, `${lowC.contrast} < ${highC.contrast}`);

  console.log("\ncomposition — where the weight sits");
  const left = await style.extract(await weighted("left"));
  const right = await style.extract(await weighted("right"));
  const top = await style.extract(await weighted("top"));
  const lc = left.energyGrid[0] + left.energyGrid[3] + left.energyGrid[6];
  const rc = left.energyGrid[2] + left.energyGrid[5] + left.energyGrid[8];
  check("left-weighted image puts energy on the left", lc > 80 && rc < 10, `${lc.toFixed(1)} vs ${rc.toFixed(1)}`);
  check("left vs right is a large distance", style.compositionDistance(left, right) > 50,
    String(style.compositionDistance(left, right)));
  check("left vs itself is zero", style.compositionDistance(left, left) === 0);
  check("left vs top differs", style.compositionDistance(left, top) > 20, String(style.compositionDistance(left, top)));

  console.log("\ndeterminism — the anti-Math.random test");
  const img = await noisy([150, 120, 100], 60, 41);
  const a = await style.extract(img);
  const b = await style.extract(img);
  check("same image, byte-identical extraction", JSON.stringify(a) === JSON.stringify(b));
  const s1 = style.scoreMatch(a, warm).score;
  const s2 = style.scoreMatch(a, warm).score;
  const s3 = style.scoreMatch(a, warm).score;
  check("same pair, same score every time", s1 === s2 && s2 === s3, `${s1} ${s2} ${s3}`);

  console.log("\nscore spread");
  const pairs = [
    ["identical", warm, warm],
    ["near-identical greys", mid, await style.extract(await solid(140, 138, 132))],
    ["opposite warmth", warm, cool],
    ["opposite brightness", dark, bright],
    ["flat vs busy", flat, busy],
    ["left vs right weighted", left, right],
  ];
  const scores = [];
  for (const [label, x, y] of pairs) {
    const r = style.scoreMatch(x, y);
    scores.push(r.score);
    console.log(`  ${label.padEnd(24)} ${String(r.score).padStart(4)}`);
  }
  check("identical scores 100", scores[0] === 100, String(scores[0]));
  check("spread is wide (>=40 points)", Math.max(...scores) - Math.min(...scores) >= 40,
    `${Math.min(...scores)}..${Math.max(...scores)}`);
  check("only identical hits 100", scores.slice(1).every((s) => s < 100), JSON.stringify(scores));

  console.log("\ngap split — the honesty requirement");
  const rep = style.scoreMatch(flat, busy);
  const fixKeys = rep.fixable.map((g) => g.key);
  const manKeys = rep.manual.map((g) => g.key);
  check("fixable is exactly the four tone dimensions",
    JSON.stringify(fixKeys) === JSON.stringify(["brightness", "contrast", "saturation", "warmth"]),
    JSON.stringify(fixKeys));
  check("busyness is NEVER offered as fixable", !fixKeys.includes("busyness"), JSON.stringify(fixKeys));
  check("composition is NEVER offered as fixable", !fixKeys.includes("composition"), JSON.stringify(fixKeys));
  check("manual holds busyness + composition",
    JSON.stringify(manKeys) === JSON.stringify(["busyness", "composition"]), JSON.stringify(manKeys));
  check("gaps carry the real numbers",
    rep.fixable[0].mine === flat.brightness && rep.fixable[0].reference === busy.brightness);
  check("severity is labelled", rep.manual.every((g) => ["low", "medium", "high"].includes(g.severity)));

  console.log("\ngrading raises the score");
  const cases = [
    ["dull grey -> vivid warm", await noisy([120, 118, 115], 40, 7), await noisy([200, 120, 60], 90, 11)],
    ["dark -> bright", await noisy([50, 50, 55], 30, 3), await noisy([190, 190, 195], 60, 5)],
    ["cool -> warm", await noisy([80, 110, 190], 50, 13), await noisy([200, 130, 70], 50, 17)],
    ["flat -> punchy", await noisy([130, 130, 130], 10, 19), await noisy([130, 130, 130], 150, 23)],
    ["already close", await noisy([160, 120, 90], 50, 29), await noisy([165, 125, 95], 55, 31)],
  ];
  let improved = 0;
  for (const [label, mineBuf, refBuf] of cases) {
    const ref = await style.extract(refBuf);
    const mineS = await style.extract(mineBuf);
    const before = style.scoreMatch(mineS, ref).score;
    const graded = await style.gradeToward(mineBuf, mineS, ref);
    const after = style.scoreMatch(await style.extract(graded), ref).score;
    if (after >= before) improved += 1;
    console.log(`  ${label.padEnd(24)} ${String(before).padStart(4)} -> ${String(after).padStart(4)}`);
  }
  check("all cases improved or held", improved === cases.length, `${improved}/${cases.length}`);

  console.log("\ngrading safety");
  const selfBuf = await noisy([150, 120, 100], 60, 41);
  const selfS = await style.extract(selfBuf);
  const selfGraded = await style.gradeToward(selfBuf, selfS, selfS);
  check("grading toward itself is a no-op (>=97)",
    style.scoreMatch(await style.extract(selfGraded), selfS).score >= 97,
    String(style.scoreMatch(await style.extract(selfGraded), selfS).score));

  const blackBuf = await solid(0, 0, 0);
  const blackS = await style.extract(blackBuf);
  const wild = await style.gradeToward(blackBuf, blackS, await style.extract(await solid(255, 255, 255)));
  const wildS = await style.extract(wild);
  check("pure black toward pure white does not crash", true);
  check("clamped output is still a valid image", (await sharp(wild).metadata()).width === 320);
  check("clamped output is not pure black", wildS.brightness > 0, String(wildS.brightness));

  const graded = await style.gradeToward(selfBuf, selfS, await style.extract(await solid(200, 120, 60)));
  const meta = await sharp(graded).metadata();
  check("graded output is jpeg at original size", meta.format === "jpeg" && meta.width === 320 && meta.height === 180,
    `${meta.format} ${meta.width}x${meta.height}`);

  console.log("\nalpha handling");
  const withAlpha = await sharp({ create: { width: 320, height: 180, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 0.5 } } }).png().toBuffer();
  const alphaS = await style.extract(withAlpha);
  check("transparent png extracts without NaN",
    Object.values(alphaS).flat().every((v) => typeof v !== "number" || Number.isFinite(v)),
    JSON.stringify(alphaS));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
