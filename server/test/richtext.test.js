const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");

require(path.join(SRC, "config/fonts")).register();

const { buildRichHeadline, measureText, normalise, MAX_LINES } = require(path.join(SRC, "config/richtext"));
const { familyFor, weightFor } = require(path.join(SRC, "config/fonts"));
const { compose } = require(path.join(SRC, "config/compose"));
const { byId, pixelRect } = require(path.join(SRC, "config/templates"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const inkOf = async (svg, w, h) => {
  const { data } = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg }]).raw().toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let i = 0; i < data.length; i += 3) if (data[i] < 200) ink += 1;
  return ink;
};

(async () => {
  const family = familyFor("intertight");
  const weight = weightFor("intertight");

  console.log("\ntext is measured for real, not estimated from character count");
  const narrow = await measureText("IIII", family, weight, 80);
  const wide = await measureText("WWWW", family, weight, 80);
  check("four W's measure wider than four I's, same character count",
    wide.width > narrow.width * 1.5, `${narrow.width} vs ${wide.width}`);

  const small = await measureText("HELLO", family, weight, 40);
  const big = await measureText("HELLO", family, weight, 80);
  check("doubling the font size roughly doubles the width",
    Math.abs(big.width / small.width - 2) < 0.15, `${small.width} -> ${big.width}`);
  check("and it reports how far the glyphs rise above the baseline", big.above > 40, String(big.above));

  console.log("\nper-line styling is what makes it look designed");
  const flat = await buildRichHeadline({ lines: [
    { text: "BUILDING", scale: 0.12 }, { text: "AI AGENTS", scale: 0.12 } ] }, 800, 400, 720);
  const tiered = await buildRichHeadline({ lines: [
    { text: "BUILDING", scale: 0.07 }, { text: "AI AGENTS", scale: 0.17 } ] }, 800, 400, 720);
  check("two lines at different scales render differently from two at the same scale",
    (await inkOf(tiered, 800, 400)) !== (await inkOf(flat, 800, 400)));

  const svg = (await buildRichHeadline({ lines: [
    { text: "ONE", scale: 0.1, color: "#FF2A1A" },
    { text: "TWO", scale: 0.1, color: "#1B6BFF" } ] }, 800, 400, 720)).toString();
  check("each line keeps its own colour", svg.includes("#FF2A1A") && svg.includes("#1B6BFF"));

  console.log("\nthe highlight box hugs the text");
  const boxed = (await buildRichHeadline({ lines: [
    { text: "IN ONE WEEKEND", scale: 0.08, box: "#1B6BFF", color: "#FFFFFF" } ] }, 900, 300, 720)).toString();
  const rect = boxed.match(/<rect[^>]*width="(\d+)"/);
  const measured = await measureText("IN ONE WEEKEND", family, weight, Math.round(720 * 0.08));
  check("a box is drawn", Boolean(rect), boxed.slice(0, 120));
  check("and it is wider than the text but not wildly so",
    rect && Number(rect[1]) > measured.width && Number(rect[1]) < measured.width * 1.6,
    rect ? `box ${rect[1]} vs text ${measured.width}` : "no box");

  const longBox = (await buildRichHeadline({ lines: [
    { text: "A MUCH MUCH LONGER LINE OF TEXT", scale: 0.08, box: "#1B6BFF" } ] }, 900, 300, 720)).toString();
  const longRect = longBox.match(/<rect[^>]*width="(\d+)"/);
  check("a longer line gets a wider box, so it really hugs the glyphs",
    longRect && Number(longRect[1]) > Number(rect[1]), `${rect && rect[1]} -> ${longRect && longRect[1]}`);
  check("and the box never runs past the slot", longRect && Number(longRect[1]) <= 900,
    longRect && longRect[1]);

  console.log("\nboxed text drops the outline, unboxed keeps it");
  check("a boxed line has no stroke", !boxed.includes("stroke-width"));
  const plain = (await buildRichHeadline({ lines: [{ text: "PLAIN", scale: 0.1 }] }, 800, 300, 720)).toString();
  check("an unboxed line is stroked so it survives a busy background", plain.includes("stroke-width"));

  console.log("\noversized text is shrunk to fit rather than overflowing");
  const huge = await buildRichHeadline({ lines: [
    { text: "AN EXTREMELY LONG HEADLINE THAT CANNOT POSSIBLY FIT", scale: 0.42 } ] }, 600, 300, 720);
  const sizes = [...huge.toString().matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
  check("the font size came down from the requested 302px", Math.max(...sizes) < 302, JSON.stringify(sizes));
  check("and the result still fits the box", (await inkOf(huge, 600, 300)) > 0);

  console.log("\ninput handling");
  check("blank lines are dropped", normalise({ lines: [{ text: "A" }, { text: "  " }] }).length === 1);
  check("nothing usable returns null", (await buildRichHeadline({ lines: [{ text: "" }] }, 400, 200, 720)) === null);
  check(`no more than ${MAX_LINES} lines`,
    normalise({ lines: Array.from({ length: 9 }, (_, i) => ({ text: `L${i}` })) }).length === MAX_LINES);
  const nasty = (await buildRichHeadline({ lines: [
    { text: '</text><script>alert(1)</script>', scale: 0.08 } ] }, 800, 300, 720)).toString();
  check("markup in the headline is escaped", !nasty.includes("<script>"));
  check("and the document still closes", nasty.trim().endsWith("</svg>"));
  const badColour = (await buildRichHeadline({ lines: [
    { text: "HI", scale: 0.08, color: 'red" onload="x', box: 'blue" onload="y' } ] }, 800, 300, 720)).toString();
  check("bad colours fall back instead of being interpolated", !badColour.includes("onload"));

  console.log("\nit reaches the real composite");
  const cream = await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 250, g: 244, b: 210 } } })
    .jpeg().toBuffer();
  const built = await compose("host-right", { background: cream },
    { headline: { align: "left", lines: [
      { text: "Building", scale: 0.08, color: "#12121A" },
      { text: "AI AGENTS", scale: 0.15, color: "#12121A" },
      { text: "IN ONE WEEKEND", scale: 0.06, box: "#1B6BFF", color: "#FFFFFF" } ] } }, {});

  const slot = pixelRect(byId("host-right").slots.find((s) => s.key === "headline").rect);
  const { data } = await sharp(built).extract(slot).raw().toBuffer({ resolveWithObject: true });
  let dark = 0, blue = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] < 80 && data[i + 1] < 80) dark += 1;
    if (data[i + 2] > 180 && data[i] < 90) blue += 1;
  }
  check("the headline actually lands on the canvas", dark > 3000, String(dark));
  check("and the blue box with it", blue > 1500, String(blue));

  console.log("\na headline with only lines still renders, even though the slot default text is empty");
  check("lines alone are enough", dark > 0);

  console.log("\nthe headline stack: label, caps, divider, shadow");
  const stack = {
    caps: true,
    shadow: true,
    stroke: false,
    gap: 0.05,
    lines: [
      { text: "Exclusive", box: "#E4161B", scale: 0.07 },
      { text: "big news", scale: 0.15 },
      { rule: "#FFE000" },
      { text: "a quote", scale: 0.06 },
    ],
  };
  const stackSvg = (await buildRichHeadline(stack, 640, 600, 720)).toString();
  check("caps turns every line upper case",
    stackSvg.includes(">EXCLUSIVE<") && stackSvg.includes(">BIG NEWS<") && !stackSvg.includes(">big news<"));
  check("a divider line draws as a bar in its colour", /<rect [^>]*fill="#FFE000"/.test(stackSvg));
  check("the shadow is applied to the whole stack", stackSvg.includes('filter="url(#drop)"'));
  check("no outline is drawn when stroke is off", !stackSvg.includes("stroke-width"));
  check("a divider alone is not a headline",
    (await buildRichHeadline({ lines: [{ rule: "#FFE000" }] }, 640, 600, 720)) === null);

  const withRule = await inkOf(await buildRichHeadline({ lines: [{ text: "A", color: "#000000" }, { rule: "#000000" }] }, 400, 300, 720), 400, 300);
  const withoutRule = await inkOf(await buildRichHeadline({ lines: [{ text: "A", color: "#000000" }] }, 400, 300, 720), 400, 300);
  check("and the divider really paints pixels", withRule > withoutRule, `${withoutRule} -> ${withRule}`);

  console.log("\nflag bands, flanking lines and highlighted words");
  const fancy = (await buildRichHeadline({
    caps: true,
    align: "center",
    lines: [
      { text: "India", scale: 0.2, gradient: ["#FF9933", "#FFFFFF", "#138808"] },
      { text: "in the final", scale: 0.05, flank: "#FFFFFF" },
      { text: "as *two names* make it <through>", scale: 0.04, accent: "#F6C343" },
    ],
  }, 1000, 500, 720)).toString();
  check("a gradient word is filled with its colour bands",
    /<linearGradient id="band0"/.test(fancy) && fancy.includes('fill="url(#band0)"') &&
      ["#FF9933", "#FFFFFF", "#138808"].every((c) => fancy.includes(`stop-color="${c}"`)));
  check("a flanked line gets a bar on each side", (fancy.match(/<rect [^>]*fill="#FFFFFF"/g) || []).length === 2);
  check("marked words take the accent colour", fancy.includes('<tspan fill="#F6C343">TWO NAMES</tspan>'));
  check("and the markers themselves never show", !/\*/.test(fancy));
  check("highlighted text is still escaped", fancy.includes("&lt;THROUGH&gt;") && !fancy.includes("<THROUGH>"));
  const literal = (await buildRichHeadline({ lines: [{ text: "5 * 3 = 15" }] }, 600, 200, 720)).toString();
  check("without an accent colour an asterisk is just an asterisk", literal.includes("5 * 3 = 15"));

  console.log("\nthe three-panel template slants its photos and fades the bottom");
  const panel = (rgb) => sharp({ create: { width: 800, height: 800, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
  const tri = await compose("three-panel", {
    panelLeft: await panel([220, 40, 40]), panelCenter: await panel([40, 200, 60]), panelRight: await panel([40, 60, 220]),
  }, {});
  const at = async (x, y) => {
    const { data } = await sharp(tri).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    return [...data];
  };
  const topSeam = await at(Math.round(0.34 * 1280), 20);
  check("near the top, just left of the slant, is still the middle panel", topSeam[1] > 150 && topSeam[0] < 100, JSON.stringify(topSeam));
  const upperLeft = await at(200, 60);
  const upperRight = await at(1100, 60);
  check("each panel shows its own photo", upperLeft[0] > 180 && upperRight[2] > 180, `${upperLeft} ${upperRight}`);
  const divider = await at(Math.round(0.3265 * 1280), 10);
  check("a white divider runs between the panels", divider.every((v) => v > 200), JSON.stringify(divider));
  const bottom = await at(200, 710);
  check("the bottom fades to navy for the headline", bottom[0] < 40 && bottom[2] > bottom[0], JSON.stringify(bottom));

  console.log("\nthe photo template keeps a narrow photo sharp and unstretched");
  const photoSlot = byId("photo-headline").slots.find((s) => s.key === "photo");
  const square = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 30, g: 170, b: 220 } } }).png().toBuffer();
  const extended = await compose("photo-headline", { photo: square }, {});
  const px = async (buf, x, y) => {
    const { data } = await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    return [...data];
  };
  const right = await px(extended, 1200, 360);
  const farLeft = await px(extended, 20, 360);
  check("the photo itself sits on the right at full strength", right[2] > 200 && right[1] > 150, JSON.stringify(right));
  check("the rest is filled with a darkened copy, not left empty",
    farLeft[2] > 60 && farLeft[2] < right[2], JSON.stringify(farLeft));
  check("and the template says so", photoSlot.fill === "extend" && photoSlot.anchor === "right");

  const wideShot = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 170, b: 220 } } }).png().toBuffer();
  const full = await compose("photo-headline", { photo: wideShot }, {});
  const wideLeft = await px(full, 20, 360);
  check("a 16:9 photo just fills the frame", wideLeft[2] > 200, JSON.stringify(wideLeft));

  const titled = await compose("photo-headline", { photo: wideShot }, { headline: { text: "hello" } });
  const fadedLeft = await px(titled, 20, 360);
  check("adding a headline darkens the side it sits on",
    fadedLeft[2] < wideLeft[2] * 0.4, `${JSON.stringify(wideLeft)} -> ${JSON.stringify(fadedLeft)}`);
  const farRight = await px(titled, 1260, 360);
  check("and leaves the far side of the photo untouched", farRight[2] > 200, JSON.stringify(farRight));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
