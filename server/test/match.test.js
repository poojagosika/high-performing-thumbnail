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
  matchReport: null, matchReports: null, candidateStyles: {}, gradedUrl: null, gradedReport: null,
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
  let fetches = 0;
  const server = http.createServer(async (req, res) => {
    fetches += 1;
    if (req.url === "/thumb.jpg") {
      const img = await noisy([200, 120, 60], 90, 11);
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": img.length });
      return res.end(img);
    }
    if (req.url.startsWith("/img/")) {
      const n = Number(req.url.slice(5));
      const img = await noisy([40 + n * 45, 120, 220 - n * 40], 60, 30 + n);
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

  console.log("\nscoring against all five winners");
  p = await newProject(`${base}/img/0`);
  for (let i = 1; i < 5; i += 1) {
    p.candidates.push({ videoId: `vid${i + 1}`, title: `ref ${i}`, thumbnailUrl: `${base}/img/${i}`, viewCount: 5000 - i, viewsPerDay: 5 });
  }
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fAll = placeUpload(await noisy([120, 120, 120], 40, 51));
  const fetchesAtUpload = fetches;
  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fAll } }, res);
  const reports = res.body.matchReports;
  check("a report for every candidate", Array.isArray(reports) && reports.length === 5, JSON.stringify(reports?.length));
  check("each report names its video", reports.every((r) => typeof r.videoId === "string"), JSON.stringify(reports.map((r) => r.videoId)));
  check("each report scores 0-100", reports.every((r) => r.score >= 0 && r.score <= 100), JSON.stringify(reports.map((r) => r.score)));
  check("each report splits fixable/manual", reports.every((r) => r.fixable.length === 4 && r.manual.length === 2));
  check("sorted best first", reports.every((r, i) => i === 0 || reports[i - 1].score >= r.score), JSON.stringify(reports.map((r) => r.score)));
  check("the top one really is the maximum", reports[0].score === Math.max(...reports.map((r) => r.score)));
  check("the references genuinely differ", new Set(reports.map((r) => r.score)).size > 1, JSON.stringify(reports.map((r) => r.score)));
  check("chosen candidate's own report still present", typeof res.body.matchReport?.score === "number");
  check("chosen candidate's score matches its entry in the list",
    reports.find((r) => r.videoId === "vid1").score === res.body.matchReport.score,
    `${reports.find((r) => r.videoId === "vid1")?.score} vs ${res.body.matchReport.score}`);
  check("styles cached per candidate", Object.keys(p.candidateStyles).length === 5, String(Object.keys(p.candidateStyles).length));
  check("only the four UNMEASURED references are fetched, the chosen one is reused",
    fetches - fetchesAtUpload === 4, String(fetches - fetchesAtUpload));

  console.log("\nre-upload reuses every measured style");
  const cachedBefore = JSON.stringify(p.candidateStyles);
  const fetchesBeforeReupload = fetches;
  const fReup = placeUpload(await noisy([100, 140, 90], 40, 53));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fReup } }, mkRes());
  check("ZERO further reference fetches", fetches === fetchesBeforeReupload, `${fetches} vs ${fetchesBeforeReupload}`);
  check("cached styles untouched", JSON.stringify(p.candidateStyles) === cachedBefore);
  check("but the scores are recomputed for the new image", p.matchReports.length === 5);

  console.log("\none unreachable reference does not sink the rest");
  p = await newProject(`${base}/img/0`);
  p.candidates.push({ videoId: "vid2", title: "dead", thumbnailUrl: `${base}/boom`, viewCount: 10, viewsPerDay: 1 });
  p.candidates.push({ videoId: "vid3", title: "ok", thumbnailUrl: `${base}/img/2`, viewCount: 10, viewsPerDay: 1 });
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fDead = placeUpload(await noisy([120, 120, 120], 40, 52));
  res = mkRes();
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fDead } }, res);
  check("upload still succeeds", res.statusCode === 200, JSON.stringify(res.body).slice(0, 120));
  check("the reachable two are scored", res.body.matchReports.length === 2, String(res.body.matchReports?.length));
  check("the dead one is omitted, not zero-scored", !res.body.matchReports.some((r) => r.videoId === "vid2"));

  const fetchesBeforeRetry = fetches;
  const fRetry = placeUpload(await noisy([100, 140, 90], 40, 53));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fRetry } }, mkRes());
  check("an unreachable reference is retried next time, not cached as dead", fetches > fetchesBeforeRetry, `${fetches} vs ${fetchesBeforeRetry}`);

  console.log("\nswitching reference keeps your upload and re-scores");
  p = await newProject(`${base}/img/0`);
  p.candidates.push({ videoId: "vid2", title: "other", thumbnailUrl: `${base}/img/3`, viewCount: 100, viewsPerDay: 1 });
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const f5 = placeUpload(await noisy([120, 120, 120], 40, 15));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: f5 } }, mkRes());
  const scoreVsFirst = p.matchReport.score;
  const styleBefore = JSON.stringify(p.uploadStyle);
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, mkRes());
  const staleGraded = p.gradedUrl;
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid2" } }, res);
  check("the upload SURVIVES the switch", res.body.uploadUrl !== null, String(res.body.uploadUrl));
  check("the upload file is still on disk", fs.existsSync(path.join(UPLOAD_DIR, f5)));
  check("uploadStyle is untouched", JSON.stringify(res.body.uploadStyle) === styleBefore);
  check("re-scored against the new reference", typeof res.body.matchReport?.score === "number" && res.body.matchReport.score !== scoreVsFirst,
    `${res.body.matchReport?.score} vs ${scoreVsFirst}`);
  check("graded output cleared, it targeted the old reference", res.body.gradedUrl === null && res.body.gradedReport === null);
  check("stale graded file removed", !fs.existsSync(path.join(UPLOAD_DIR, path.basename(staleGraded || "x"))));

  console.log("\nswitching with no upload behaves as before");
  p = await newProject(`${base}/img/0`);
  p.candidates.push({ videoId: "vid2", title: "other", thumbnailUrl: `${base}/img/1`, viewCount: 1, viewsPerDay: 1 });
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid2" } }, res);
  check("reference switched", res.body.chosenVideoId === "vid2");
  check("nothing to keep, nothing to score", res.body.uploadUrl === null && res.body.matchReport === null);

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
