const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");

require(path.join(SRC, "config/fonts")).register();

const { planThumbnail, overridesFrom, restyleLines, splitHeadline, paletteFrom, templateFrom } =
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

  console.log("\nediting a planned headline changes what renders");
  const planned = overridesFrom(planThumbnail({
    reference: { style: lightStyle, layout: { template: "two-subject" } },
    content: { headline: "I ate 100 nuggets" },
  })).headline;
  check("the planned override carries the text the editor shows",
    planned.text === "I ate 100 nuggets", planned.text);
  check("and the font, colour and size the editor controls start from",
    planned.font && planned.color && planned.scale === Math.max(...planned.lines.map((l) => l.scale)),
    JSON.stringify([planned.font, planned.color, planned.scale]));

  const retexted = restyleLines(planned.lines, { text: "I survived 50 hours in the fridge" });
  check("new text is split into lines again",
    retexted.map((l) => l.text).join(" ") === "I survived 50 hours in the fridge" && retexted.length === 3,
    JSON.stringify(retexted.map((l) => l.text)));
  check("the highlight box moves to the new last line",
    Boolean(retexted[retexted.length - 1].box) && retexted.slice(0, -1).every((l) => !l.box));
  check("a single-line headline drops the box",
    restyleLines(planned.lines, { text: "nuggets" }).every((l) => !l.box));
  check("clearing the text keeps the styling for the next edit",
    restyleLines(planned.lines, { text: "" }).every((l, i) => l.text === "" && l.font === planned.lines[i].font));

  check("a font edit reaches every line",
    restyleLines(planned.lines, { font: "bebas" }).every((l) => l.font === "bebas"));
  const recoloured = restyleLines(planned.lines, { color: "#FFDD00" });
  check("a colour edit recolours plain lines and leaves boxed text readable",
    recoloured.every((l) => (l.box ? l.color === planned.lines.find((p) => p.box).color : l.color === "#FFDD00")),
    JSON.stringify(recoloured.map((l) => [l.color, l.box])));
  const resized = restyleLines(planned.lines, { scale: 0.3 });
  check("a size edit sets the biggest line and keeps the hierarchy",
    Math.max(...resized.map((l) => l.scale)) === 0.3 &&
      Math.abs(resized[1].scale / resized[0].scale - planned.lines[1].scale / planned.lines[0].scale) < 0.01,
    JSON.stringify(resized.map((l) => l.scale)));

  const before = await compose("two-subject", {}, { headline: planned }, { referenceStyle: lightStyle });
  const after = await compose("two-subject", {}, { headline: { ...planned, lines: retexted } }, { referenceStyle: lightStyle });
  check("and the render actually changes", !before.equals(after));

  console.log("\nthe planner fills the new layouts itself");
  const { balance, pairingFor, PAIRINGS } = require(path.join(SRC, "config/plan"));
  const hostPlan = planThumbnail({
    reference: { style: darkStyle, layout: { template: "host-headline" } },
    content: { headline: "I read 50 codebases and found the same bugs", seed: "abc" },
  });
  const hostLines = hostPlan.headline.lines;
  check("the host layout opens with a small setup line in the support font",
    hostLines[0].scale < 0.065 && hostLines[0].font === hostPlan.fonts.support, JSON.stringify(hostLines[0]));
  check("and circles the last word on its own line",
    hostLines[hostLines.length - 1].text === "bugs" && Boolean(hostLines[hostLines.length - 1].ring));
  check("the ring is never too dark to see",
    hostLines[hostLines.length - 1].ring === "#E52521", hostLines[hostLines.length - 1].ring);
  check("a long last word gets a colour instead of a ring",
    planThumbnail({ reference: { style: darkStyle, layout: { template: "host-headline" } }, content: { headline: "stop overthinking absolutely everything" } })
      .headline.lines.every((l) => !l.ring));

  const photoPlan = planThumbnail({
    reference: { style: darkStyle, layout: { template: "photo-headline" } },
    content: { headline: "First woman to pilot the space shuttle" },
  });
  check("the photo layout breaks lines like a designer would",
    JSON.stringify(photoPlan.headline.lines.map((l) => l.text)) === JSON.stringify(["First woman", "to pilot", "the space shuttle"]),
    JSON.stringify(photoPlan.headline.lines.map((l) => l.text)));
  check("and highlights the last line", photoPlan.headline.lines[2].color !== "#FFFFFF");
  check("stack layouts keep their own alignment", photoPlan.headline.align === "left");

  const panelPlan = planThumbnail({
    reference: { style: darkStyle, layout: { template: "three-panel" } },
    content: { headline: "Pioneers who changed computing" },
  });
  check("the three-panel layout makes the first word the hero",
    panelPlan.headline.lines[0].text === "Pioneers" && panelPlan.headline.lines[0].scale > panelPlan.headline.lines[1].scale);
  check("and centres the stack", panelPlan.headline.align === "center");

  console.log("\nfonts are chosen, not fixed");
  const condensed = PAIRINGS.condensed.map(([hero]) => hero);
  const geometric = PAIRINGS.geometric.map(([hero]) => hero);
  check("host and photo layouts use condensed faces", condensed.includes(hostPlan.fonts.hero) && condensed.includes(photoPlan.fonts.hero));
  check("the three-panel layout uses a geometric face", geometric.includes(panelPlan.fonts.hero));
  const heroes = new Set(["a", "b", "c", "d", "e", "f"].map((seed) => pairingFor("host-headline", { seed }).hero));
  check("different references get different pairings", heroes.size > 1, JSON.stringify([...heroes]));
  check("the same reference always gets the same pairing",
    pairingFor("three-panel", { seed: "xyz" }).hero === pairingFor("three-panel", { seed: "xyz" }).hero);
  check("a font the user picked wins", pairingFor("host-headline", { font: "poppins", seed: "a" }).hero === "poppins");
  check("the old layouts no longer default to one font",
    planThumbnail({ reference: { style: darkStyle, layout: { template: "two-subject" } }, content: { headline: "two words here" } })
      .headline.lines.every((l) => geometric.includes(l.font)));
  check("the project's own template wins over the layout guess",
    planThumbnail({ reference: { style: darkStyle, layout: { template: "two-subject" } }, content: { headline: "x y", template: "host-headline" } }).template === "host-headline");

  console.log("\nline breaking avoids dangling small words");
  check("never ends a line on 'to' or 'the'",
    balance("First woman to pilot the space shuttle".split(" "), 3).slice(0, -1).every((l) => !/\b(to|the)$/i.test(l)));
  check("keeps every word, in order",
    balance("I tried every AI coding tool for a month".split(" "), 3).join(" ") === "I tried every AI coding tool for a month");
  check("one line when one is asked for", balance(["a", "b"], 1).length === 1);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
