const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");

require(path.join(SRC, "config/fonts")).register();

const { planThumbnail, overridesFrom, splitHeadline, paletteFrom, templateFrom } =
  require(path.join(SRC, "config/plan"));
const { evaluateThumbnail } = require(path.join(SRC, "config/evaluate"));
const { compose } = require(path.join(SRC, "config/compose"));
const { byId } = require(path.join(SRC, "config/templates"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const lightStyle = {
  brightness: 63, contrast: 62, saturation: 20, warmth: 11,
  dominant: { hex: "#fbf1d6", brightness: 94, share: 30 },
  accent: null,
  energyGrid: new Array(9).fill(11.1),
};

const darkStyle = {
  brightness: 31, contrast: 41, saturation: 38, warmth: 13,
  dominant: { hex: "#2e2a2b", brightness: 17, share: 12 },
  accent: { hex: "#91030f", chroma: 98, share: 2.7 },
  energyGrid: new Array(9).fill(11.1),
};

const subject = async (w, h) => {
  const body = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 190, g: 140, b: 110 } } })
    .png().toBuffer();
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 3}" ry="${h / 2.4}" fill="#fff"/></svg>`);
  return sharp(body).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
};

const flat = (w, h, rgb) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .jpeg().toBuffer();

(async () => {
  console.log("\nthe plan is derived from the reference, not hardcoded");
  const light = planThumbnail({
    reference: { style: lightStyle, layout: { template: "host-right", headlineBand: "top", confidence: "measured" } },
    content: { headline: "BUILD AI AGENTS IN ONE WEEKEND" },
    assets: { background: 1, host: 1 },
  });
  const dark = planThumbnail({
    reference: { style: darkStyle, layout: { template: "two-subject", headlineBand: "middle", confidence: "measured" } },
    content: { headline: "NEPAL DISASTER" },
    assets: { background: 1, subjectLeft: 1, subjectRight: 1 },
  });

  check("a light reference plans a light thumbnail", light.mood === "light", light.mood);
  check("a dark reference plans a dark one", dark.mood === "dark", dark.mood);
  check("the two plans differ in more than mood",
    light.template !== dark.template && light.headline.align !== dark.headline.align,
    `${light.template}/${light.headline.align} vs ${dark.template}/${dark.headline.align}`);

  console.log("\nthe palette comes off the reference's own pixels");
  check("the backdrop is the reference's dominant colour", light.palette.backdrop === "#fbf1d6",
    light.palette.backdrop);
  check("a real accent is used when the reference has one", dark.palette.accent === "#91030f",
    dark.palette.accent);
  check("and a sane default when it does not", /^#[0-9A-F]{6}$/i.test(light.palette.accent),
    light.palette.accent);
  check("ink flips for a dark reference",
    light.palette.ink !== dark.palette.ink, `${light.palette.ink} vs ${dark.palette.ink}`);

  console.log("\nthe headline gets a hierarchy instead of one flat size");
  const scales = light.headline.lines.map((l) => l.scale);
  check("three lines at three different sizes",
    light.headline.lines.length === 3 && new Set(scales).size === 3, JSON.stringify(scales));
  check("the biggest line is the middle one, not the first",
    scales[1] === Math.max(...scales), JSON.stringify(scales));
  check("the last line is boxed in the accent colour",
    light.headline.lines[2].box === light.palette.accent, JSON.stringify(light.headline.lines[2]));
  check("the words survive the split intact",
    light.headline.lines.map((l) => l.text).join(" ") === "BUILD AI AGENTS IN ONE WEEKEND",
    light.headline.lines.map((l) => l.text).join(" | "));

  console.log("\nheadline splitting across lengths");
  check("one word stays one line", splitHeadline("TSUNAMI").length === 1);
  check("two words stay one line", splitHeadline("NEPAL DISASTER").length === 1);
  check("four words split in two", splitHeadline("SEO IS DEAD NOW").length === 2);
  check("six words split in three", splitHeadline("BUILD AI AGENTS IN ONE WEEKEND").length === 3);
  check("nothing in, nothing out", splitHeadline("   ").length === 0);
  check("a very long headline never exceeds three lines",
    splitHeadline("ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN").length <= 3);

  console.log("\nthe template is chosen, then falls back sensibly");
  check("the detector's choice wins", templateFrom({ template: "host-right" }, {}) === "host-right");
  check("an unknown name falls back to what the assets suggest",
    templateFrom({ template: "nonsense" }, { subjectLeft: 1, subjectRight: 1 }) === "two-subject");
  check("a lone host implies the host template",
    templateFrom(null, { host: 1 }) === "host-right");
  check("no reference and no assets still gives a real template",
    Boolean(byId(templateFrom(null, {}))));

  console.log("\nconstraints say how many people are allowed");
  check("two-subject allows two", dark.constraints.people === 2, String(dark.constraints.people));
  check("host-right allows one", light.constraints.people === 1, String(light.constraints.people));
  check("and it records which were actually supplied",
    light.subjects.every((s) => typeof s.supplied === "boolean"), JSON.stringify(light.subjects));
  check("nothing is invented", light.constraints.invented === false && light.constraints.extraText === false);

  console.log("\nwith no reference at all it still plans something buildable");
  const blind = planThumbnail({ content: { headline: "NO REFERENCE HERE" }, assets: {} });
  check("a template is chosen", Boolean(byId(blind.template)), blind.template);
  check("a headline is planned", Boolean(blind.headline));
  check("and it says so honestly", blind.source.layoutConfidence === "no reference",
    blind.source.layoutConfidence);

  const silent = planThumbnail({ reference: { style: lightStyle }, content: {}, assets: {} });
  check("no headline text plans no headline", silent.headline === null);
  check("and overrides are then empty", Object.keys(overridesFrom(silent)).length === 0);

  console.log("\nthe plan feeds the renderer directly");
  const overrides = overridesFrom(light);
  check("it targets the template's own text slot",
    Object.keys(overrides)[0] === light.headline.slot, JSON.stringify(Object.keys(overrides)));

  const cream = await flat(1280, 720, [250, 244, 210]);
  const person = await subject(420, 700);
  const icon = await flat(400, 300, [30, 30, 40]);
  const fullAssets = { background: cream, graphic: icon, host: person };

  const built = await compose(light.template, fullAssets, overrides, { referenceStyle: lightStyle });
  const meta = await sharp(built).metadata();
  check("and the renderer accepts it unchanged", meta.width === 1280 && meta.height === 720);

  console.log("\nthe evaluator checks the render against the plan");
  const spec = { ...light, source: { ...light.source, backdropBrightness: 94 } };
  const report = await evaluateThumbnail(built, spec);
  console.log(`      ${report.checks.map((c) => `${c.name}:${c.pass ? "ok" : "FAIL"}`).join("  ")}`);
  check("a matching render passes", report.pass, report.failed.join(", "));

  const ignoredPlan = await compose(light.template, fullAssets, overrides, {});
  const ignoredReport = await evaluateThumbnail(ignoredPlan, spec);
  check("a render that ignored the plan is caught",
    ignoredReport.failed.includes("mood") || ignoredReport.failed.includes("backdrop matches the reference"),
    JSON.stringify(ignoredReport.failed));

  const tiny = await sharp(built).resize(640, 360).jpeg().toBuffer();
  const tinyReport = await evaluateThumbnail(tiny, spec);
  check("a wrong-sized render is caught", tinyReport.failed.includes("canvas"),
    JSON.stringify(tinyReport.failed));

  const wrongMood = await evaluateThumbnail(built, { ...spec, mood: "dark" });
  check("a render that contradicts the planned mood is caught",
    wrongMood.failed.includes("mood"), JSON.stringify(wrongMood.failed));

  const blank = await compose(light.template, fullAssets, {}, { referenceStyle: lightStyle });
  const blankReport = await evaluateThumbnail(blank, spec);
  check("a render missing its headline is caught",
    blankReport.failed.includes("headline present") || blankReport.failed.includes("headline band"),
    JSON.stringify(blankReport.failed));

  check("every check reports a reason, pass or fail",
    report.checks.every((c) => typeof c.name === "string" && c.detail !== undefined));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
