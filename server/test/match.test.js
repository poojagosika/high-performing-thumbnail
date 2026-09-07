process.env.JWT_SECRET = "x".repeat(64);
delete process.env.YOUTUBE_API_KEY;

const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module");
const path = require("path");
const fs = require("fs");
const http = require("http");
const SRC = `${SERVER_ROOT}/src`;
const sharp = require("sharp");
const { UPLOAD_DIR } = require(path.join(SRC, "config/upload"));

let projects = [];
let nextId = 1;
const DEFAULTS = {
  chosenVideoId: null, referenceStyle: null, uploadUrl: null, uploadStyle: null,
  matchReport: null, gradedUrl: null, gradedReport: null,
  description: "", tags: [], candidates: [],
};
const mk = (doc) => ({ ...DEFAULTS, ...doc, _id: doc._id || `p${nextId++}`, createdAt: new Date(), save: async function () { return this; } });
const ProjectStub = {
  create: async (d) => { const p = mk(d); projects.push(p); return p; },
  find: () => ({ sort: () => ({ limit: async () => projects }) }),
  findOne: async (f) => projects.find((p) => String(p._id) === String(f._id) && (f.user === undefined || String(p.user) === String(f.user))) || null,
  findOneAndDelete: async () => null,
};
const TopicSearchStub = { findOne: async () => null, findOneAndUpdate: async () => null };

const origLoad = Module._load;
Module._load = function (request, parent) {
  const dir = parent && parent.filename ? path.dirname(parent.filename) : "";
  const abs = request.startsWith(".") ? path.resolve(dir, request) : request;
  if (abs === path.join(SRC, "models/Project")) return ProjectStub;
  if (abs === path.join(SRC, "models/TopicSearch")) return TopicSearchStub;
  return origLoad.apply(this, arguments);
};
const ctrl = require(path.join(SRC, "controllers/projectController"));
Module._load = origLoad;

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const mkRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

const noisy = (base, spread, seed) => {
  const w = 320, h = 180, buf = Buffer.alloc(w * h * 3);
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
  for (let i = 0; i < w * h; i += 1) for (let c = 0; c < 3; c += 1) {
    buf[i * 3 + c] = Math.max(0, Math.min(255, base[c] + (rnd() - 0.5) * spread));
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

const placeUpload = (buf, ext = "jpg") => {
  const name = `test-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
};

(async () => {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/thumb.jpg") {
      const img = await noisy([200, 120, 60], 90, 11);
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": img.length });
      return res.end(img);
    }
    if (req.url === "/notimage") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html>nope</html>");
    }
    if (req.url === "/huge") {
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": String(50 * 1024 * 1024) });
      return res.end(Buffer.alloc(1024));
    }
    res.writeHead(500); res.end("boom");
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const newProject = (thumbUrl) => {
    projects = []; nextId = 1;
    return ProjectStub.create({
      user: "u1", title: "t", searchQuery: "t", source: "youtube",
      candidates: [{ videoId: "vid1", title: "ref", thumbnailUrl: thumbUrl, viewCount: 5000, viewsPerDay: 10 }],
    });
  };

  console.log("\nreference fetch (local server stands in for i.ytimg.com)");
  let p = await newProject(`${base}/thumb.jpg`);
  let res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
  check("reference chosen", res.body.chosenVideoId === "vid1");
  check("real image fetched and analysed", res.body.referenceStyle && typeof res.body.referenceStyle.brightness === "number",
    JSON.stringify(res.body.referenceStyle));

  p = await newProject(`${base}/notimage`);
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
  check("non-image content-type refused, no 500", res.statusCode === 200 && res.body.referenceStyle === null);

  p = await newProject(`${base}/huge`);
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
  check("oversized content-length refused", res.body.referenceStyle === null);

  p = await newProject(`${base}/boom`);
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
  check("fetch failure leaves reference chosen, style null, no 500",
    res.statusCode === 200 && res.body.chosenVideoId === "vid1" && res.body.referenceStyle === null);

  p = await newProject("fixture://placeholder");
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
  check("fixture mode synthesises a reference so the loop is testable locally",
    res.body.referenceStyle !== null, JSON.stringify(res.body.referenceStyle));

  console.log("\nupload + match");
  p = await newProject(`${base}/thumb.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const f1 = placeUpload(await noisy([120, 118, 115], 40, 7));
  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: f1 } }, res);
  check("upload accepted", res.statusCode === 200, JSON.stringify(res.body).slice(0, 120));
  check("match report produced", typeof res.body.matchReport?.score === "number", JSON.stringify(res.body.matchReport?.score));
  check("report splits fixable/manual", res.body.matchReport.fixable.length === 4 && res.body.matchReport.manual.length === 2);
  check("uploadStyle stored", res.body.uploadStyle !== null);
  const firstScore = res.body.matchReport.score;

  console.log("\ngrade");
  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("grade produced a file", typeof res.body.gradedUrl === "string" && res.body.gradedUrl.startsWith("/uploads/"),
    String(res.body.gradedUrl));
  check("graded file exists on disk", fs.existsSync(path.join(UPLOAD_DIR, path.basename(res.body.gradedUrl))));
  check("graded score >= original", res.body.gradedReport.score >= firstScore,
    `${firstScore} -> ${res.body.gradedReport?.score}`);
  check("original report kept for before/after", res.body.matchReport.score === firstScore);
  const gradedFile = path.basename(res.body.gradedUrl);

  console.log("\nre-grading replaces, does not leak");
  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("old graded file unlinked", !fs.existsSync(path.join(UPLOAD_DIR, gradedFile)));
  check("new graded file exists", fs.existsSync(path.join(UPLOAD_DIR, path.basename(res.body.gradedUrl))));

  console.log("\nre-uploading replaces both");
  const oldUpload = path.basename(projects[0].uploadUrl);
  const oldGraded = path.basename(projects[0].gradedUrl);
  const f2 = placeUpload(await noisy([90, 90, 90], 30, 77));
  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: f2 } }, res);
  check("previous upload unlinked", !fs.existsSync(path.join(UPLOAD_DIR, oldUpload)));
  check("previous graded unlinked", !fs.existsSync(path.join(UPLOAD_DIR, oldGraded)));
  check("graded state reset on new upload", res.body.gradedUrl === null && res.body.gradedReport === null);

  console.log("\nordering rules");
  p = await newProject(`${base}/thumb.jpg`);
  const f3 = placeUpload(await noisy([120, 120, 120], 40, 5));
  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: f3 } }, res);
  check("upload before choosing a reference -> 400", res.statusCode === 400, JSON.stringify(res.body));
  check("and the orphan file is cleaned up", !fs.existsSync(path.join(UPLOAD_DIR, f3)));

  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("grade before upload -> 400", res.statusCode === 400, JSON.stringify(res.body));

  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("upload with no file -> 400", res.statusCode === 400);

  console.log("\ncross-tenant");
  p = await newProject(`${base}/thumb.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const f4 = placeUpload(await noisy([120, 120, 120], 40, 9));
  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u2" }, params: { id: p._id }, file: { filename: f4 } }, res);
  check("another user cannot upload to my project", res.statusCode === 404);
  check("their orphan file is cleaned up", !fs.existsSync(path.join(UPLOAD_DIR, f4)));

  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u2" }, params: { id: p._id } }, res);
  check("another user cannot grade my project", res.statusCode === 404);

  res = mkRes();
  await ctrl.clearUpload({ user: { _id: "u2" }, params: { id: p._id } }, res);
  check("another user cannot clear my upload", res.statusCode === 404);

  console.log("\nswitching reference resets downstream work");
  p = await newProject(`${base}/thumb.jpg`);
  p.candidates.push({ videoId: "vid2", title: "other", thumbnailUrl: `${base}/thumb.jpg`, viewCount: 100, viewsPerDay: 1 });
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const f5 = placeUpload(await noisy([120, 120, 120], 40, 15));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: f5 } }, mkRes());
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, mkRes());
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid2" } }, res);
  check("upload cleared when the reference changes", res.body.uploadUrl === null && res.body.matchReport === null);
  check("graded cleared too", res.body.gradedUrl === null && res.body.gradedReport === null);
  check("stale upload file removed", !fs.existsSync(path.join(UPLOAD_DIR, f5)));

  console.log("\nclear upload");
  p = await newProject(`${base}/thumb.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const f6 = placeUpload(await noisy([120, 120, 120], 40, 21));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: f6 } }, mkRes());
  res = mkRes();
  await ctrl.clearUpload({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("clear wipes upload state", res.body.uploadUrl === null && res.body.uploadStyle === null && res.body.matchReport === null);
  check("clear unlinks the file", !fs.existsSync(path.join(UPLOAD_DIR, f6)));

  server.close();
  for (const f of fs.readdirSync(UPLOAD_DIR)) if (f.startsWith("test-")) fs.unlinkSync(path.join(UPLOAD_DIR, f));
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
