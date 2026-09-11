const path = require("path");
const sharp = require("sharp");
const SRC = path.join(__dirname, "..", "src");
const {
  renderCaption,
  buildSvg,
  layout,
  escapeXml,
  inkCount,
  MAX_SCALE,
} = require(path.join(SRC, "config/caption"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const plate = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 30, b: 60 } } })
    .jpeg()
    .toBuffer();

const rowInk = async (buffer, fromFrac, toFrac) => {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const y0 = Math.floor(info.height * fromFrac);
  const y1 = Math.floor(info.height * toFrac);
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < info.width; x += 1) if (data[y * info.width + x] > 200) n += 1;
  }
  return n;
};

(async () => {
  const base = await plate(1280, 720);
  const baseInk = await inkCount(base);

  console.log("\nit actually draws text");
  const out = await renderCaption(base, { text: "100 NUGGETS", position: "bottom" });
  const outInk = await inkCount(out);
  check("source plate has no bright pixels", baseInk === 0, String(baseInk));
  check("captioned image does", outInk > 1000, String(outInk));
  const meta = await sharp(out).metadata();
  check("dimensions unchanged", meta.width === 1280 && meta.height === 720, `${meta.width}x${meta.height}`);

  console.log("\nempty text is a no-op, not a blank render");
  check("empty string returns null", (await renderCaption(base, { text: "" })) === null);
  check("whitespace only returns null", (await renderCaption(base, { text: "   " })) === null);
  check("missing options returns null", (await renderCaption(base, undefined)) === null);

  console.log("\nSVG injection");
  const nasty = '</text></g></svg><script>alert(1)</script>';
  const escaped = escapeXml(nasty);
  check("angle brackets escaped", !escaped.includes("<") && !escaped.includes(">"), escaped);
  check("ampersands escaped", escapeXml("a & b") === "a &amp; b", escapeXml("a & b"));
  check("quotes escaped", escapeXml(`"x" 'y'`) === "&quot;x&quot; &apos;y&apos;", escapeXml(`"x" 'y'`));
  const svg = buildSvg({ text: nasty }, 1280, 720).toString();
  check("no raw script tag reaches the document", !svg.includes("<script>"), svg.slice(0, 120));
  check("the document still closes properly", svg.trim().endsWith("</svg>"));
  const injected = await renderCaption(base, { text: nasty });
  check("it renders as literal text without throwing", (await inkCount(injected)) > 500);

  console.log("\ncolours are never interpolated raw");
  const bad = buildSvg({ text: "hi", color: 'red" onload="x', strokeColor: "javascript:x" }, 640, 360).toString();
  check("a non-hex fill falls back to white", bad.includes('fill="#FFFFFF"'), bad.slice(0, 200));
  check("a non-hex stroke falls back to black", bad.includes('stroke="#000000"'));
  check("nothing from the bad value survives", !bad.includes("onload") && !bad.includes("javascript"));
  const good = buildSvg({ text: "hi", color: "#ff0066", strokeColor: "#112233" }, 640, 360).toString();
  check("a valid hex is used", good.includes('fill="#ff0066"') && good.includes('stroke="#112233"'));

  console.log("\nsize scales with the image, not fixed pixels");
  const small = layout("BIG TEXT", 640, 360, 0.16);
  const large = layout("BIG TEXT", 2560, 1440, 0.16);
  check("a 4x taller image gets ~4x the font size",
    Math.abs(large.fontSize / small.fontSize - 4) < 0.35,
    `${small.fontSize} vs ${large.fontSize}`);

  const clamped = buildSvg({ text: "hi", scale: 99 }, 1280, 720).toString();
  const fontSize = Number(clamped.match(/font-size="(\d+)"/)[1]);
  check("an absurd scale is clamped", fontSize <= Math.round(720 * MAX_SCALE), String(fontSize));

  console.log("\nlong text wraps and stays inside the frame");
  const long = layout(
    "THIS IS AN EXTREMELY LONG THUMBNAIL TITLE THAT WOULD NEVER FIT ON ONE LINE",
    1280, 720, 0.16,
  );
  check("it wrapped to more than one line", long.lines.length > 1, String(long.lines.length));
  check("at most three lines", long.lines.length <= 3, String(long.lines.length));
  check("the font shrank to fit", long.fontSize < Math.round(720 * 0.16), String(long.fontSize));
  const joined = long.lines.join(" ");
  check("NO WORDS ARE DROPPED",
    joined.split(/\s+/).length ===
      "THIS IS AN EXTREMELY LONG THUMBNAIL TITLE THAT WOULD NEVER FIT ON ONE LINE".split(/\s+/).length,
    joined);

  const wideOut = await renderCaption(base, {
    text: "THIS IS AN EXTREMELY LONG THUMBNAIL TITLE THAT WOULD NEVER FIT",
    position: "middle",
  });
  const { data, info } = await sharp(wideOut).greyscale().raw().toBuffer({ resolveWithObject: true });
  let leftEdge = info.width, rightEdge = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width + x] > 200) {
        if (x < leftEdge) leftEdge = x;
        if (x > rightEdge) rightEdge = x;
      }
    }
  }
  check("no ink touches the left frame edge", leftEdge > 4, String(leftEdge));
  check("no ink touches the right frame edge", rightEdge < info.width - 4, `${rightEdge} of ${info.width}`);

  console.log("\nposition lands where asked");
  for (const [position, from, to] of [["top", 0, 0.34], ["middle", 0.33, 0.67], ["bottom", 0.66, 1]]) {
    const img = await renderCaption(base, { text: "PLACED", position });
    const inBand = await rowInk(img, from, to);
    const total = await inkCount(img);
    check(`${position} puts most of the ink in its third`, inBand / total > 0.85,
      `${inBand}/${total}`);
  }

  console.log("\nwhat text does to the match score, measured not assumed");
  const { extract, scoreMatch } = require(path.join(SRC, "config/imageStyle"));
  const lit = (w, h) => {
    const b = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 3;
        const t = Math.max(0, 1 - Math.hypot(x - w / 2, y - h / 2) / (h * 0.42));
        b[i] = Math.min(255, 40 + 200 * t);
        b[i + 1] = Math.min(255, 30 + 150 * t);
        b[i + 2] = Math.min(255, 70 + 70 * t);
      }
    }
    return sharp(b, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
  };

  const mine = await lit(1280, 720);
  const refPlain = await lit(1280, 720);
  const refTexted = await renderCaption(refPlain, { text: "INSANE RESULT", position: "bottom" });
  const mineTexted = await renderCaption(mine, { text: "100 NUGGETS", position: "bottom" });

  const sMine = await extract(mine);
  const sMineText = await extract(mineTexted);
  const plainRef = await extract(refPlain);
  const textedRef = await extract(refTexted);

  const vsPlain = [scoreMatch(sMine, plainRef).score, scoreMatch(sMineText, plainRef).score];
  const vsTexted = [scoreMatch(sMine, textedRef).score, scoreMatch(sMineText, textedRef).score];
  console.log(`      vs a reference WITHOUT text: ${vsPlain[0]} -> ${vsPlain[1]}`);
  console.log(`      vs a reference WITH text:    ${vsTexted[0]} -> ${vsTexted[1]}`);

  check("adding text moves you TOWARD a winner that has text", vsTexted[1] > vsTexted[0],
    `${vsTexted[0]} -> ${vsTexted[1]}`);
  check("and AWAY from one that does not", vsPlain[1] < vsPlain[0], `${vsPlain[0]} -> ${vsPlain[1]}`);
  check("so the score is informative, not noise", vsTexted[1] > vsPlain[1], `${vsTexted[1]} vs ${vsPlain[1]}`);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
