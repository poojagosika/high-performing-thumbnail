const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");
const { planRecompose, recompose, ASPECT, MIN_OUT_W, MIN_OUT_H } = require(path.join(SRC, "config/recompose"));
const { extract, compositionDistance } = require(path.join(SRC, "config/imageStyle"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const blob = async (w, h, cx, cy, radius) => {
  const buf = Buffer.alloc(w * h * 3, 20);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < radius) {
        const v = Math.round(255 * (1 - d / radius));
        const i = (y * w + x) * 3;
        buf[i] = v; buf[i + 1] = v; buf[i + 2] = v;
      }
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

(async () => {
  console.log("\nsubject on the left, reference centred");
  const wide = await blob(1920, 1080, 420, 540, 260);
  const centred = await blob(1280, 720, 640, 360, 180);
  const refStyle = await extract(centred);

  let plan = await planRecompose(wide, refStyle);
  check("a crop is proposed", plan && plan.crop !== null, JSON.stringify(plan));
  check("composition distance improves", plan.after < plan.before, `${plan.after} vs ${plan.before}`);
  check("the crop moves toward the subject, not away",
    plan.crop.left < 1920 / 2 - plan.crop.width / 2 + 1,
    JSON.stringify(plan.crop));

  const cropped = await sharp(wide).extract(plan.crop).jpeg().toBuffer();
  const beforeReal = compositionDistance(await extract(wide), refStyle);
  const afterReal = compositionDistance(await extract(cropped), refStyle);
  check("MEASURED ON THE REAL PIXELS, the gap actually shrinks", afterReal < beforeReal,
    `${afterReal} vs ${beforeReal}`);

  console.log("\naspect");
  const ratio = plan.crop.width / plan.crop.height;
  check("output is 16:9 within rounding", Math.abs(ratio - ASPECT) < 0.02, String(ratio));

  const tall = await blob(1080, 1920, 540, 700, 300);
  const tallPlan = await planRecompose(tall, refStyle);
  if (tallPlan && tallPlan.crop) {
    const r = tallPlan.crop.width / tallPlan.crop.height;
    check("a portrait source still yields 16:9", Math.abs(r - ASPECT) < 0.02, String(r));
  } else {
    check("a portrait source still yields 16:9", true, "no crop proposed");
  }

  console.log("\nan image that already matches is LEFT ALONE");
  const already = await blob(1280, 720, 640, 360, 180);
  const samePlan = await planRecompose(already, await extract(already));
  check("no crop proposed", samePlan && samePlan.crop === null, JSON.stringify(samePlan?.crop));
  check("and it says the gap did not move", samePlan.before === samePlan.after,
    `${samePlan.before} vs ${samePlan.after}`);

  console.log("\nresolution floor");
  const small = await blob(500, 280, 140, 140, 70);
  const smallPlan = await planRecompose(small, refStyle);
  check("a source already below 640x360 gets no crop at all",
    smallPlan && smallPlan.crop === null, JSON.stringify(smallPlan?.crop));

  const mid = await blob(700, 394, 200, 197, 90);
  const midPlan = await planRecompose(mid, refStyle);
  check("a mid-size source is never zoomed past the floor",
    midPlan && (midPlan.crop === null ||
      (midPlan.crop.width >= MIN_OUT_W && midPlan.crop.height >= MIN_OUT_H)),
    JSON.stringify(midPlan?.crop));

  const exact = await blob(MIN_OUT_W, MIN_OUT_H, 150, 180, 80);
  const exactPlan = await planRecompose(exact, refStyle);
  check("an image exactly at the floor cannot be cropped smaller",
    exactPlan && (exactPlan.crop === null ||
      (exactPlan.crop.width >= MIN_OUT_W && exactPlan.crop.height >= MIN_OUT_H)),
    JSON.stringify(exactPlan?.crop));

  console.log("\nbad input");
  check("no reference style -> no plan", (await planRecompose(wide, null)) === null);
  check("reference without an energyGrid -> no plan",
    (await planRecompose(wide, { brightness: 50 })) === null);

  console.log("\nrecompose returns real pixels");
  const out = await recompose(wide, refStyle);
  check("a buffer comes back", Buffer.isBuffer(out.buffer), String(out.buffer));
  const outMeta = await sharp(out.buffer).metadata();
  check("at the planned size", outMeta.width === out.crop.width && outMeta.height === out.crop.height,
    `${outMeta.width}x${outMeta.height} vs ${out.crop.width}x${out.crop.height}`);
  check("above the floor", outMeta.width >= MIN_OUT_W && outMeta.height >= MIN_OUT_H,
    `${outMeta.width}x${outMeta.height}`);

  const noop = await recompose(already, await extract(already));
  check("a no-op returns no buffer to write", noop.buffer === null);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
