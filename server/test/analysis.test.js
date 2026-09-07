process.env.JWT_SECRET = "x".repeat(64);

const SERVER_ROOT = require("path").join(__dirname, "..");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const SRC = `${SERVER_ROOT}/src`;
const style = require(path.join(SRC, "config/imageStyle"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const raw = (draw) => {
  const w = 640, h = 360, buf = Buffer.alloc(w * h * 3);
  draw(buf, w, h);
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
};
const stripes = (p, a, b) => raw((buf, w, h) => {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = Math.floor(x / p) % 2 === 0 ? a : b;
    buf[(y * w + x) * 3] = c[0]; buf[(y * w + x) * 3 + 1] = c[1]; buf[(y * w + x) * 3 + 2] = c[2];
  }
});
const blob = (r, fg, bg) => raw((buf, w, h) => {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = Math.hypot(x - w / 2, y - h / 2) < r ? fg : bg;
    buf[(y * w + x) * 3] = c[0]; buf[(y * w + x) * 3 + 1] = c[1]; buf[(y * w + x) * 3 + 2] = c[2];
  }
});
const wash = (b, s, seed) => raw((buf, w, h) => {
  let z = seed;
  const r = () => { z = (z * 1103515245 + 12345) >>> 0; return z / 4294967296; };
  for (let i = 0; i < w * h; i += 1) for (let c = 0; c < 3; c += 1) {
    buf[i * 3 + c] = Math.max(0, Math.min(255, b[c] + (r() - 0.5) * s));
  }
});

(async () => {
  console.log("\nno randomness anywhere in the analyze path");
  const ctrlSrc = fs.readFileSync(path.join(SRC, "controllers/thumbnailController.js"), "utf8");
  const analyzeFn = ctrlSrc.slice(ctrlSrc.indexOf("const analyzeThumbnail"), ctrlSrc.indexOf("const bulkCollection"));
  check("analyzeThumbnail contains no Math.random", !/Math\.random/.test(analyzeFn));
  check("imageStyle contains no Math.random",
    !/Math\.random/.test(fs.readFileSync(path.join(SRC, "config/imageStyle.js"), "utf8")));
  check("the old rand helper is gone", !/const rand = \(min, max\)/.test(ctrlSrc));
  check("fabricated dimensions gone from the controller",
    !/emotionalImpact|colorBalance|textReadability/.test(ctrlSrc));

  console.log("\ndeterminism — the whole point");
  const img = await wash([150, 120, 100], 60, 41);
  const a = await style.analyzeStandalone(img);
  const b = await style.analyzeStandalone(img);
  const c = await style.analyzeStandalone(img);
  check("same image, identical score three times", a.score === b.score && b.score === c.score, `${a.score} ${b.score} ${c.score}`);
  check("same image, identical attributes", JSON.stringify(a.attributes) === JSON.stringify(b.attributes));
  check("same image, identical observations", JSON.stringify(a.observations) === JSON.stringify(b.observations));

  console.log("\nlegibility — tonal separation at sidebar size");
  const boldShape = await style.contrastAtSidebar(await blob(120, [255, 255, 255], [10, 10, 10]));
  const muddy = await style.contrastAtSidebar(await blob(120, [130, 130, 130], [110, 110, 110]));
  const flat = await style.contrastAtSidebar(await raw((b2) => b2.fill(128)));
  const noise = await style.contrastAtSidebar(await wash([128, 128, 128], 120, 7));
  const fine = await style.contrastAtSidebar(await stripes(2, [0, 0, 0], [255, 255, 255]));
  const boldStripe = await style.contrastAtSidebar(await stripes(80, [0, 0, 0], [255, 255, 255]));
  console.log(`  bold shape ${boldShape} · bold stripes ${boldStripe} · fine stripes ${fine} · muddy ${muddy} · noise ${noise} · flat ${flat}`);
  check("bold high-contrast holds up", boldShape > 50, String(boldShape));
  check("muddy low-contrast collapses", muddy < 15, String(muddy));
  check("bold beats muddy by a wide margin", boldShape > muddy * 5);
  check("flat grey is zero", flat === 0, String(flat));
  check("fine detail collapses below bold", fine < boldStripe, `${fine} < ${boldStripe}`);
  check("noise collapses", noise < 15, String(noise));

  console.log("\nfocal concentration — is there a subject?");
  const evenWash = style.focalConcentration(await style.extract(await wash([128, 128, 128], 20, 3)));
  const centred = style.focalConcentration(await style.extract(await blob(90, [255, 255, 255], [8, 8, 8])));
  const corner = style.focalConcentration(await style.extract(await raw((buf, w, h) => {
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const v = x < w / 3 && y < h / 3 ? 250 : 8;
      buf[(y * w + x) * 3] = v; buf[(y * w + x) * 3 + 1] = v; buf[(y * w + x) * 3 + 2] = v;
    }
  })));
  const flatGrey = style.focalConcentration(await style.extract(await raw((b2) => b2.fill(128))));
  console.log(`  even wash ${evenWash} · centred ${centred} · corner ${corner} · flat ${flatGrey}`);
  check("flat image has near-zero concentration", flatGrey < 5, String(flatGrey));
  check("even wash near zero", evenWash < 5, String(evenWash));
  check("a clear subject scores high", centred > 40, String(centred));
  check("an off-centre subject scores higher still", corner > centred, `${corner} > ${centred}`);

  console.log("\ncolour punch");
  const vivid = (await style.analyzeStandalone(await blob(150, [255, 60, 20], [10, 10, 60]))).attributes.colourPunch;
  const drab = (await style.analyzeStandalone(await wash([128, 126, 124], 15, 9))).attributes.colourPunch;
  check("vivid beats drab", vivid > drab, `${vivid} vs ${drab}`);
  check("drab is low", drab < 25, String(drab));

  console.log("\nobservations quote their numbers");
  const rep = await style.analyzeStandalone(await wash([128, 126, 124], 15, 9));
  check("three observations, one per dimension", rep.observations.length === 3, String(rep.observations.length));
  const values = Object.values(rep.attributes).map(String);
  for (const o of rep.observations) {
    check(`"${o.category}" cites a measured value`,
      values.some((v) => o.tip.includes(v)), o.tip);
  }
  check("every observation has a priority", rep.observations.every((o) => ["low", "medium", "high"].includes(o.priority)));
  check("no rule-of-thirds boilerplate", !rep.observations.some((o) => /rule of thirds/i.test(o.tip)));

  console.log("\nscore discriminates across a varied set");
  const set = [
    ["flat grey", await raw((b2) => b2.fill(128))],
    ["muddy blob", await blob(120, [130, 130, 130], [110, 110, 110])],
    ["noise", await wash([128, 128, 128], 120, 7)],
    ["bold vivid subject", await blob(110, [255, 70, 30], [12, 12, 40])],
    ["bold mono subject", await blob(110, [255, 255, 255], [8, 8, 8])],
  ];
  const scores = [];
  for (const [label, buf] of set) {
    const r = await style.analyzeStandalone(buf);
    scores.push(r.score);
    console.log(`  ${label.padEnd(20)} ${String(r.score).padStart(4)}   leg ${String(r.attributes.legibility).padStart(6)} focal ${String(r.attributes.focalConcentration).padStart(6)} colour ${String(r.attributes.colourPunch).padStart(6)}`);
  }
  check("scores are not clustered", Math.max(...scores) - Math.min(...scores) >= 30,
    `${Math.min(...scores)}..${Math.max(...scores)}`);
  check("flat grey scores lowest", scores[0] === Math.min(...scores), JSON.stringify(scores));
  check("a bold subject scores well above flat", Math.max(...scores) > scores[0] + 30);
  check("all scores are in range", scores.every((s) => s >= 0 && s <= 100), JSON.stringify(scores));
  check("a good thumbnail lands in a believable band, not mid-scale",
    Math.max(...scores) >= 70, `best was ${Math.max(...scores)}`);
  check("bad images land near the floor", Math.min(...scores) <= 5, `worst was ${Math.min(...scores)}`);
  check("score targets are stated, not implicit",
    style.STANDALONE.every((d) => typeof d.target === "number"),
    JSON.stringify(style.STANDALONE));

  console.log("\nattribute shape matches the model");
  const keys = Object.keys((await style.analyzeStandalone(await blob(100, [200, 100, 50], [20, 20, 20]))).attributes);
  check("exactly legibility, focalConcentration, colourPunch",
    JSON.stringify(keys) === JSON.stringify(["legibility", "focalConcentration", "colourPunch"]), JSON.stringify(keys));
  const modelSrc = fs.readFileSync(path.join(SRC, "models/Thumbnail.js"), "utf8");
  check("model declares the same three", keys.every((k) => modelSrc.includes(`${k}:`)));
  check("model no longer declares emotionalImpact", !/emotionalImpact/.test(modelSrc));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
