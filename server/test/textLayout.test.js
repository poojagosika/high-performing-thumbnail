const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");
const { detectText, CONFIDENCE_MIN } = require(path.join(SRC, "config/textLayout"));
const { renderCaption } = require(path.join(SRC, "config/caption"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const raw = (w, h, fn) => {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const [r, g, bl] = fn(x, y);
      b[i] = Math.max(0, Math.min(255, r));
      b[i + 1] = Math.max(0, Math.min(255, g));
      b[i + 2] = Math.max(0, Math.min(255, bl));
    }
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

const gradient = () => raw(1280, 720, (x, y) => [40 + x / 8, 30 + y / 9, 70]);

(async () => {
  const plate = await gradient();

  console.log("\nit finds text where the text is");
  const detected = {};
  for (const position of ["top", "middle", "bottom"]) {
    const img = await renderCaption(plate, { text: "100 NUGGETS CHALLENGE", position });
    const r = await detectText(img);
    detected[position] = r;
    check(`${position} text is detected`, r.hasText === true, JSON.stringify(r));
    check(`and placed at ${position}`, r.position === position, `${r.position} (conf ${r.confidence})`);
  }

  console.log("\nsize estimate tracks real size");
  const sizes = [];
  for (const scale of [0.08, 0.14, 0.22, 0.28]) {
    const img = await renderCaption(plate, { text: "BIG TEXT", position: "middle", scale });
    const r = await detectText(img);
    sizes.push([scale, r.scale]);
  }
  console.log(`      ${sizes.map(([a, b]) => `${a}->${b}`).join("  ")}`);
  check("it never decreases as real text grows",
    sizes.every(([, est], i) => i === 0 || est >= sizes[i - 1][1]),
    JSON.stringify(sizes));
  check("and it actually grows overall", sizes[sizes.length - 1][1] > sizes[0][1],
    `${sizes[0][1]} -> ${sizes[sizes.length - 1][1]}`);

  console.log("\nwhat it correctly refuses to call text");
  const negatives = {
    "plain gradient": plate,
    "horizon line": await raw(1280, 720, (x, y) => (y < 380 ? [120, 150, 220] : [60, 90, 40])),
    "detailed face": await raw(1280, 720, (x, y) => {
      const d = Math.hypot(x - 640, y - 300);
      if (d < 190) { const v = 140 + 70 * Math.sin(x / 5) * Math.cos(y / 6); return [v, v * 0.8, v * 0.65]; }
      return [50, 45, 70];
    }),
    "uniform noise": await raw(1280, 720, (x, y) => {
      const n = ((x * 1103515245 + y * 12345) >>> 0) % 140;
      return [60 + n, 50 + n, 80 + n];
    }),
  };

  let worstNegative = 0;
  for (const [name, img] of Object.entries(negatives)) {
    const r = await detectText(img);
    worstNegative = Math.max(worstNegative, r.confidence);
    check(`${name} is not called text`, r.hasText === false, `conf ${r.confidence}`);
  }

  console.log("\nthe KNOWN false positive, asserted so it stays visible");
  const striped = await raw(1280, 720, (x, y) =>
    y > 430 && y < 560 ? (x % 14 < 7 ? [250, 250, 250] : [10, 10, 10]) : [70, 60, 90],
  );
  const stripedResult = await detectText(striped);
  check("a band of vertical stripes DOES read as text — this is a known limit",
    stripedResult.hasText === true, JSON.stringify(stripedResult));
  check("which is why detection only suggests, never forces",
    stripedResult.position === "middle" || stripedResult.position === "bottom",
    stripedResult.position);

  console.log("\nthe confidence gap is wide, not marginal");
  const textConfidences = Object.values(detected).map((r) => r.confidence);
  const weakestText = Math.min(...textConfidences);
  console.log(`      weakest text ${weakestText}   strongest non-text ${worstNegative}   threshold ${CONFIDENCE_MIN}`);
  check("every text case clears the threshold", weakestText > CONFIDENCE_MIN, String(weakestText));
  check("every non-text case falls under it", worstNegative < CONFIDENCE_MIN, String(worstNegative));
  check("with at least a 3x margin between the two populations",
    weakestText / Math.max(worstNegative, 0.1) > 3,
    `${weakestText} vs ${worstNegative}`);

  console.log("\nbad input does not throw");
  const broken = await detectText(Buffer.from("not an image"));
  check("returns a no-text result instead of blowing up", broken.hasText === false, JSON.stringify(broken));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
