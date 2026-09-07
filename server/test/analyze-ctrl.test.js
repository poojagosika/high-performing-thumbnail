process.env.JWT_SECRET = "x".repeat(64);
const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module"), path = require("path"), fs = require("fs");
const SRC = `${SERVER_ROOT}/src`;
const sharp = require("sharp");
const { UPLOAD_DIR } = require(path.join(SRC, "config/upload"));

let thumbs = [];
const ThumbnailStub = {
  findOne: (f) => { const q = Promise.resolve(thumbs.find((t) => String(t._id) === String(f._id) && String(t.user) === String(f.user)) || null); q.setOptions=()=>q; q.select=()=>q; q.sort=()=>q; q.lean=()=>q; return q; },
  find: () => { const q = Promise.resolve([]); q.setOptions=()=>q; return q; },
  deleteMany: async () => ({}), updateMany: async () => ({}), create: async (d) => d, findOneAndUpdate: async () => null,
};
const origLoad = Module._load;
Module._load = function (r, p) {
  const dir = p && p.filename ? path.dirname(p.filename) : "";
  const abs = r.startsWith(".") ? path.resolve(dir, r) : r;
  if (abs === path.join(SRC, "models/Thumbnail")) return ThumbnailStub;
  if (abs === path.join(SRC, "models/Activity")) return { create: async () => ({}) };
  return origLoad.apply(this, arguments);
};
const ctrl = require(path.join(SRC, "controllers/thumbnailController"));
Module._load = origLoad;

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d}`); } };
const mkRes = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

(async () => {
  const img = await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 220, g: 90, b: 40 } } }).jpeg().toBuffer();
  const name = `atest-${Date.now()}.jpg`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), img);

  const mk = (over = {}) => ({ _id: "t1", user: "u1", title: "x", imageUrl: `/uploads/${name}`, save: async function(){return this;}, ...over });

  console.log("\nanalyze produces measured output");
  thumbs = [mk()];
  let res = mkRes();
  await ctrl.analyzeThumbnail({ user: { _id: "u1" }, params: { id: "t1" } }, res);
  check("200", res.statusCode === 200, JSON.stringify(res.body).slice(0, 100));
  check("score is a number", typeof res.body.score === "number", String(res.body.score));
  check("analysis has the three measured keys",
    JSON.stringify(Object.keys(res.body.analysis)) === JSON.stringify(["legibility","focalConcentration","colourPunch"]),
    JSON.stringify(Object.keys(res.body.analysis || {})));
  check("suggestions present", Array.isArray(res.body.suggestions) && res.body.suggestions.length === 3);
  const first = res.body.score;

  console.log("\nsame image analysed twice gives the SAME score");
  thumbs = [mk()];
  res = mkRes();
  await ctrl.analyzeThumbnail({ user: { _id: "u1" }, params: { id: "t1" } }, res);
  check("identical score on re-analysis", res.body.score === first, `${first} vs ${res.body.score}`);

  console.log("\nfailure modes");
  thumbs = [mk({ imageUrl: "/uploads/does-not-exist.jpg" })];
  res = mkRes();
  await ctrl.analyzeThumbnail({ user: { _id: "u1" }, params: { id: "t1" } }, res);
  check("missing file -> 410, not a crash", res.statusCode === 410, JSON.stringify(res.body));

  const bad = `atest-bad-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, bad), Buffer.from("not an image at all"));
  thumbs = [mk({ imageUrl: `/uploads/${bad}` })];
  res = mkRes();
  await ctrl.analyzeThumbnail({ user: { _id: "u1" }, params: { id: "t1" } }, res);
  check("unreadable image -> 422, not a 500", res.statusCode === 422, JSON.stringify(res.body));

  thumbs = [mk()];
  res = mkRes();
  await ctrl.analyzeThumbnail({ user: { _id: "u2" }, params: { id: "t1" } }, res);
  check("another user's thumbnail -> 404", res.statusCode === 404);

  for (const f of fs.readdirSync(UPLOAD_DIR)) if (f.startsWith("atest-")) fs.unlinkSync(path.join(UPLOAD_DIR, f));
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
