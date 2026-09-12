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
  matchReport: null, matchReports: null, candidateStyles: {}, framedUrl: null, frameReport: null,
  gradedUrl: null, gradedReport: null, caption: null, captionedUrl: null,
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
const { extract } = require(path.join(SRC, "config/imageStyle"));
const { inkCount, renderCaption } = require(path.join(SRC, "config/caption"));
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

const blobImg = async (w, h, cx, cy, radius) => {
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
    if (req.url.startsWith("/texted/")) {
      const pos = req.url.slice(8);
      const plain = await blobImg(1280, 720, 640, 360, 200);
      const img = await renderCaption(plain, { text: "WINNER TEXT HERE", position: pos });
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": img.length });
      return res.end(img);
    }
    if (req.url === "/centred.jpg") {
      const img = await blobImg(1280, 720, 640, 360, 180);
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

  console.log("\nreframing the upload");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fOff = placeUpload(await blobImg(1920, 1080, 420, 540, 260));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fOff } }, mkRes());
  const beforeFrameScore = p.matchReport.score;
  res = mkRes();
  await ctrl.recomposeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("reframe succeeds", res.statusCode === 200, JSON.stringify(res.body).slice(0, 140));
  check("it actually cropped", res.body.frameReport.cropped === true, JSON.stringify(res.body.frameReport));
  check("composition gap reported as improved", res.body.frameReport.after < res.body.frameReport.before,
    `${res.body.frameReport.after} vs ${res.body.frameReport.before}`);
  check("a framed image was written", typeof res.body.framedUrl === "string" && res.body.framedUrl.length > 0);
  check("the framed file exists on disk", fs.existsSync(path.join(UPLOAD_DIR, path.basename(res.body.framedUrl))));
  check("THE ORIGINAL UPLOAD SURVIVES, so it is undoable", fs.existsSync(path.join(UPLOAD_DIR, fOff)));
  check("the original is still the upload of record", res.body.uploadUrl === `/uploads/${fOff}`);
  const framedMeta = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.framedUrl))).metadata();
  check("the framed image is 16:9", Math.abs(framedMeta.width / framedMeta.height - 16 / 9) < 0.02,
    `${framedMeta.width}x${framedMeta.height}`);
  check("match re-scored on the framed pixels", res.body.matchReport.score !== beforeFrameScore,
    `${res.body.matchReport.score} vs ${beforeFrameScore}`);

  console.log("\ngrading works on the framed pixels, not the original");
  const framedFile = path.basename(p.framedUrl);
  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("grade succeeds after a reframe", res.statusCode === 200 && res.body.gradedUrl, JSON.stringify(res.body).slice(0, 140));
  const gradedMeta = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.gradedUrl))).metadata();
  check("the graded output has the FRAMED dimensions, not the original 1920x1080",
    gradedMeta.width === framedMeta.width && gradedMeta.height === framedMeta.height,
    `${gradedMeta.width}x${gradedMeta.height} vs ${framedMeta.width}x${framedMeta.height}`);

  console.log("\nan already well-framed image is left alone");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fGood = placeUpload(await blobImg(1280, 720, 640, 360, 180));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fGood } }, mkRes());
  const goodScoreBefore = p.matchReport.score;
  res = mkRes();
  await ctrl.recomposeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("NO crop is made", res.body.frameReport.cropped === false, JSON.stringify(res.body.frameReport));
  check("and no framed file is written", res.body.framedUrl === null, String(res.body.framedUrl));
  check("the score is left untouched", res.body.matchReport.score === goodScoreBefore,
    `${res.body.matchReport.score} vs ${goodScoreBefore}`);

  console.log("\nreframe guards");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  res = mkRes();
  await ctrl.recomposeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("reframe with no upload is refused", res.statusCode === 400, JSON.stringify(res.body));

  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fTenant = placeUpload(await blobImg(1920, 1080, 420, 540, 260));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fTenant } }, mkRes());
  res = mkRes();
  await ctrl.recomposeThumbnail({ user: { _id: "u2" }, params: { id: p._id } }, res);
  check("another user cannot reframe my project", res.statusCode === 404, JSON.stringify(res.body));

  console.log("\nswitching reference after a reframe");
  await ctrl.recomposeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, mkRes());
  const staleFramed = p.framedUrl;
  p.candidates.push({ videoId: "vid9", title: "other", thumbnailUrl: `${base}/img/3`, viewCount: 1, viewsPerDay: 1 });
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid9" } }, res);
  check("the framed image is dropped", res.body.framedUrl === null && res.body.frameReport === null);
  check("its file is unlinked", !fs.existsSync(path.join(UPLOAD_DIR, path.basename(staleFramed))));
  check("the original upload still survives", fs.existsSync(path.join(UPLOAD_DIR, fTenant)));
  check("uploadStyle is re-measured from the ORIGINAL, not left describing the deleted crop",
    JSON.stringify(res.body.uploadStyle) === JSON.stringify(await extract(path.join(UPLOAD_DIR, fTenant))),
    JSON.stringify(res.body.uploadStyle).slice(0, 80));

  console.log("\nclear upload removes the framed image too");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fClear = placeUpload(await blobImg(1920, 1080, 420, 540, 260));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fClear } }, mkRes());
  await ctrl.recomposeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, mkRes());
  const clearFramed = p.framedUrl;
  await ctrl.clearUpload({ user: { _id: "u1" }, params: { id: p._id } }, mkRes());
  check("framed file unlinked on clear", !fs.existsSync(path.join(UPLOAD_DIR, path.basename(clearFramed))));
  check("framed state cleared", p.framedUrl === null && p.frameReport === null);

  console.log("\ntext on the thumbnail");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fCap = placeUpload(await blobImg(1280, 720, 640, 360, 200));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fCap } }, mkRes());
  const scoreNoText = p.matchReport.score;

  res = mkRes();
  await ctrl.setCaption({ user: { _id: "u1" }, params: { id: p._id },
    body: { text: "100 NUGGETS", position: "bottom", scale: 0.16, color: "#FFFFFF", strokeColor: "#000000" } }, res);
  check("caption applied", res.statusCode === 200, JSON.stringify(res.body).slice(0, 140));
  check("a captioned image was written", typeof res.body.captionedUrl === "string" && res.body.captionedUrl.length > 0);
  check("the file exists", fs.existsSync(path.join(UPLOAD_DIR, path.basename(res.body.captionedUrl))));
  check("the settings are stored, not just the output", res.body.caption.text === "100 NUGGETS");
  check("the original upload survives", fs.existsSync(path.join(UPLOAD_DIR, fCap)));
  const capMeta = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.captionedUrl))).metadata();
  check("dimensions unchanged by captioning", capMeta.width === 1280 && capMeta.height === 720,
    `${capMeta.width}x${capMeta.height}`);
  console.log(`      match score without text ${scoreNoText} -> with text ${res.body.matchReport.score}`);
  check("the score was recomputed on the captioned image", typeof res.body.matchReport.score === "number");

  console.log("\nTHE STALE-CAPTION CASE: grading re-renders the text");
  const capBeforeGrade = p.captionedUrl;
  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("grade succeeds with a caption present", res.statusCode === 200 && res.body.gradedUrl);
  check("the captioned image was re-rendered, not left stale", res.body.captionedUrl !== capBeforeGrade,
    `${res.body.captionedUrl} vs ${capBeforeGrade}`);
  check("the stale captioned file is gone", !fs.existsSync(path.join(UPLOAD_DIR, path.basename(capBeforeGrade))));
  check("the caption settings survived the grade", res.body.caption.text === "100 NUGGETS");
  const inkGraded = await inkCount(fs.readFileSync(path.join(UPLOAD_DIR, path.basename(res.body.captionedUrl))));
  const inkPlainGraded = await inkCount(fs.readFileSync(path.join(UPLOAD_DIR, path.basename(res.body.gradedUrl))));
  check("the text is really on the graded image", inkGraded > inkPlainGraded, `${inkGraded} vs ${inkPlainGraded}`);

  console.log("\nreframing also re-renders the text, it is not cropped off");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fCap2 = placeUpload(await blobImg(1920, 1080, 420, 540, 260));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fCap2 } }, mkRes());
  await ctrl.setCaption({ user: { _id: "u1" }, params: { id: p._id }, body: { text: "GONE WRONG", position: "bottom", scale: 0.16, color: "#FFFFFF", strokeColor: "#000000" } }, mkRes());
  const capBeforeFrame = p.captionedUrl;
  res = mkRes();
  await ctrl.recomposeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("reframe succeeds with a caption present", res.statusCode === 200);
  check("captioned image re-rendered on the crop", res.body.captionedUrl !== capBeforeFrame);
  const framedM = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.framedUrl))).metadata();
  const capM = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.captionedUrl))).metadata();
  check("the captioned image matches the CROPPED size, so the text was redrawn on it",
    capM.width === framedM.width && capM.height === framedM.height,
    `${capM.width}x${capM.height} vs ${framedM.width}x${framedM.height}`);
  const inkCap = await inkCount(fs.readFileSync(path.join(UPLOAD_DIR, path.basename(res.body.captionedUrl))));
  const inkFramed = await inkCount(fs.readFileSync(path.join(UPLOAD_DIR, path.basename(res.body.framedUrl))));
  check("text present on the reframed image", inkCap > inkFramed, `${inkCap} vs ${inkFramed}`);

  console.log("\nremoving the caption");
  const toRemove = p.captionedUrl;
  res = mkRes();
  await ctrl.removeCaption({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("caption cleared", res.body.caption === null && res.body.captionedUrl === null);
  check("its file unlinked", !fs.existsSync(path.join(UPLOAD_DIR, path.basename(toRemove))));
  check("earlier stages untouched", fs.existsSync(path.join(UPLOAD_DIR, fCap2)) && res.body.framedUrl !== null);

  console.log("\ncaption guards");
  p = await newProject(`${base}/centred.jpg`);
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  res = mkRes();
  await ctrl.setCaption({ user: { _id: "u1" }, params: { id: p._id }, body: { text: "x" } }, res);
  check("captioning with no upload is refused", res.statusCode === 400, JSON.stringify(res.body));

  const fGuard = placeUpload(await blobImg(1280, 720, 640, 360, 200));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fGuard } }, mkRes());
  res = mkRes();
  await ctrl.setCaption({ user: { _id: "u2" }, params: { id: p._id }, body: { text: "x" } }, res);
  check("another user cannot caption my project", res.statusCode === 404, JSON.stringify(res.body));
  res = mkRes();
  await ctrl.removeCaption({ user: { _id: "u2" }, params: { id: p._id } }, res);
  check("another user cannot remove my caption", res.statusCode === 404, JSON.stringify(res.body));

  console.log("\nreading where the winner puts its text");
  const layouts = {};
  for (const pos of ["top", "bottom"]) {
    p = await newProject(`${base}/texted/${pos}`);
    res = mkRes();
    await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
    layouts[pos] = res.body.referenceText;
    check(`a winner with ${pos} text is read as having text`, layouts[pos]?.hasText === true,
      JSON.stringify(layouts[pos]));
    check(`and located at ${pos}`, layouts[pos]?.position === pos, JSON.stringify(layouts[pos]?.position));
  }

  check("THE SUGGESTION VARIES, it is not a hard-coded default",
    layouts.top.position !== layouts.bottom.position,
    `${layouts.top.position} vs ${layouts.bottom.position}`);

  p = await newProject(`${base}/centred.jpg`);
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, res);
  check("a winner with no text is reported as having none", res.body.referenceText?.hasText === false,
    JSON.stringify(res.body.referenceText));
  check("and offers no bogus position", res.body.referenceText?.position === null);

  console.log("\ndetection rides the existing cache, it does not refetch");
  p = await newProject(`${base}/texted/bottom`);
  p.candidates.push({ videoId: "vid2", title: "b", thumbnailUrl: `${base}/texted/top`, viewCount: 9, viewsPerDay: 1 });
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: p._id }, body: { videoId: "vid1" } }, mkRes());
  const fDetect = placeUpload(await blobImg(1280, 720, 640, 360, 200));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fDetect } }, mkRes());
  check("every candidate carries a detected layout",
    Object.values(p.candidateStyles).every((st) => st.textLayout),
    JSON.stringify(Object.keys(p.candidateStyles)));
  const fetchesBeforeSecond = fetches;
  const fDetect2 = placeUpload(await blobImg(1280, 720, 600, 340, 190));
  await ctrl.uploadThumbnail({ user: { _id: "u1" }, params: { id: p._id }, file: { filename: fDetect2 } }, mkRes());
  check("ZERO extra reference fetches on a second upload", fetches === fetchesBeforeSecond,
    `${fetches} vs ${fetchesBeforeSecond}`);

  console.log("\nthe user's own placement is never overridden");
  await ctrl.setCaption({ user: { _id: "u1" }, params: { id: p._id },
    body: { text: "MINE", position: "middle", scale: 0.2, color: "#FFFFFF", strokeColor: "#000000" } }, mkRes());
  check("the reference says bottom", p.referenceStyle.textLayout.position === "bottom",
    p.referenceStyle.textLayout.position);
  res = mkRes();
  await ctrl.gradeThumbnail({ user: { _id: "u1" }, params: { id: p._id } }, res);
  check("but the user's middle placement survives a re-render", res.body.caption.position === "middle",
    res.body.caption.position);
  check("and their size too", res.body.caption.scale === 0.2, String(res.body.caption.scale));

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
