process.env.JWT_SECRET = "x".repeat(64);
delete process.env.YOUTUBE_API_KEY;

const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module");
const path = require("path");
const SRC = `${SERVER_ROOT}/src`;

let cacheRows = [];
let projects = [];
let apiCalls = 0;
let nextId = 1;

const TopicSearchStub = {
  findOne: async (f) => cacheRows.find((r) => r.query === f.query) || null,
  findOneAndUpdate: async (f, update) => {
    const row = cacheRows.find((r) => r.query === f.query);
    const data = update.$set;
    if (row) Object.assign(row, data);
    else cacheRows.push({ query: f.query, ...data });
    return null;
  },
};

const DEFAULTS = {
  chosenVideoId: null, referenceStyle: null,
  uploadUrl: null, gradedUrl: null, matchReport: null,
  description: "", tags: [], candidates: [],
};
const mkProject = (doc) => ({
  ...DEFAULTS,
  ...doc,
  _id: doc._id || `p${nextId++}`,
  createdAt: new Date(),
  save: async function () { return this; },
});

const ProjectStub = {
  create: async (doc) => { const p = mkProject(doc); projects.push(p); return p; },
  find: () => ({ sort: () => ({ limit: async () => projects }) }),
  findOne: async (f) =>
    projects.find((p) => String(p._id) === String(f._id) && (f.user === undefined || String(p.user) === String(f.user))) || null,
  findOneAndDelete: async (f) => {
    const i = projects.findIndex((p) => String(p._id) === String(f._id) && (f.user === undefined || String(p.user) === String(f.user)));
    return i === -1 ? null : projects.splice(i, 1)[0];
  },
};

const realYt = require(path.join(SRC, "config/youtube"));
let searchImpl = async (q, now) => { apiCalls += 1; return realYt.searchTopic(q, now); };
const ytStub = { ...realYt, searchTopic: (q, now) => searchImpl(q, now) };

const origLoad = Module._load;
Module._load = function (request, parent) {
  const dir = parent && parent.filename ? path.dirname(parent.filename) : "";
  const abs = request.startsWith(".") ? path.resolve(dir, request) : request;
  if (abs === path.join(SRC, "models/TopicSearch")) return TopicSearchStub;
  if (abs === path.join(SRC, "models/Project")) return ProjectStub;
  if (abs === path.join(SRC, "config/youtube")) return ytStub;
  return origLoad.apply(this, arguments);
};
const ctrl = require(path.join(SRC, "controllers/projectController"));
const { projectSchema, chooseReferenceSchema } = require(path.join(SRC, "schemas"));
Module._load = origLoad;

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const reset = () => { cacheRows = []; projects = []; apiCalls = 0; nextId = 1; };

(async () => {
  console.log("\ncreate a project (the research call)");
  reset();
  let res = mkRes();
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "Chicken Nuggets Eating Challenge", tags: [], description: "d" } }, res);
  check("201", res.statusCode === 201, JSON.stringify(res.body));
  check("returns 5 candidates", res.body.project.candidates.length === 5, String(res.body.project.candidates?.length));
  check("searchQuery normalised onto the project", res.body.project.searchQuery === "chicken nuggets eating challenge", res.body.project.searchQuery);
  check("source surfaced to the client", res.body.project.source === "fixture", res.body.project.source);
  check("nothing chosen yet", res.body.project.chosenVideoId === null);
  check("step 4-5 fields exist and are empty", res.body.project.uploadUrl === null && res.body.project.matchReport === null);
  check("one API call spent", apiCalls === 1, String(apiCalls));
  check("cached flag false on a fresh topic", res.body.cached === false);

  console.log("\ncaching — this is what keeps you under 99 searches/day");
  res = mkRes();
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "Chicken Nuggets Eating Challenge", tags: [] } }, res);
  check("second identical search spends NO quota", apiCalls === 1, String(apiCalls));
  check("and is flagged as cached", res.body.cached === true);
  check("still returns the 5 results", res.body.project.candidates.length === 5);

  for (const t of ["chicken nuggets eating challenge", "  CHICKEN  Nuggets   Eating Challenge ", "Chicken NUGGETS eating challenge"]) {
    await ctrl.createProject({ user: { _id: "u1" }, body: { title: t, tags: [] } }, mkRes());
  }
  check("4 casing variants total -> still ONE API call", apiCalls === 1, String(apiCalls));
  check("and ONE cache row", cacheRows.length === 1, String(cacheRows.length));

  res = mkRes();
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "minecraft speedrun", tags: [] } }, res);
  check("a genuinely new topic does spend quota", apiCalls === 2, String(apiCalls));

  console.log("\ncache expiry");
  reset();
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "topic", tags: [] } }, mkRes());
  cacheRows[0].fetchedAt = new Date(Date.now() - 8 * 86400000);
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "topic", tags: [] } }, mkRes());
  check("a row older than 7 days refetches", apiCalls === 2, String(apiCalls));

  console.log("\nchoosing a reference — the IDOR surface");
  reset();
  res = mkRes();
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "topic", tags: [] } }, res);
  const project = res.body.project;
  const mine = project.candidates[2].videoId;

  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: project.id }, body: { videoId: mine } }, res);
  check("choosing one of my own 5 works", res.statusCode === 200 && res.body.chosenVideoId === mine, JSON.stringify(res.body?.chosenVideoId));

  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: project.id }, body: { videoId: "dQw4w9WgXcQ" } }, res);
  check("an ARBITRARY videoId is refused", res.statusCode === 400, JSON.stringify(res.body));
  check("and the previous choice is untouched", projects[0].chosenVideoId === mine, String(projects[0].chosenVideoId));

  res = mkRes();
  await ctrl.createProject({ user: { _id: "u2" }, body: { title: "other topic", tags: [] } }, res);
  const othersVideoId = res.body.project.candidates[0].videoId;
  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u1" }, params: { id: project.id }, body: { videoId: othersVideoId } }, res);
  check("a videoId from ANOTHER project is refused", res.statusCode === 400, JSON.stringify(res.body));

  console.log("\ncross-tenant access");
  res = mkRes();
  await ctrl.getProject({ user: { _id: "u2" }, params: { id: project.id } }, res);
  check("another user cannot read my project", res.statusCode === 404, JSON.stringify(res.body));

  res = mkRes();
  await ctrl.chooseReference({ user: { _id: "u2" }, params: { id: project.id }, body: { videoId: mine } }, res);
  check("another user cannot set my reference", res.statusCode === 404, JSON.stringify(res.body));

  res = mkRes();
  await ctrl.deleteProject({ user: { _id: "u2" }, params: { id: project.id } }, res);
  check("another user cannot delete my project", res.statusCode === 404, JSON.stringify(res.body));

  console.log("\nsnapshotting");
  cacheRows.length = 0;
  res = mkRes();
  await ctrl.getProject({ user: { _id: "u1" }, params: { id: project.id } }, res);
  check("project still shows its candidates after the cache is gone", res.body.candidates.length === 5, String(res.body.candidates?.length));

  console.log("\nquota exhaustion surfaces properly");
  reset();
  searchImpl = async () => {
    throw new realYt.YoutubeError(429, "Daily YouTube search limit reached. Try again tomorrow.");
  };
  res = mkRes();
  await ctrl.createProject({ user: { _id: "u1" }, body: { title: "anything", tags: [] } }, res);
  check("quotaExceeded -> 429, not a generic 500", res.statusCode === 429, JSON.stringify(res.body));
  check("with a message a human can act on", /limit reached/i.test(res.body.message), res.body.message);
  searchImpl = async (q, now) => { apiCalls += 1; return realYt.searchTopic(q, now); };

  console.log("\nschemas");
  check("title required", !projectSchema.safeParse({ tags: [] }).success);
  check("empty title rejected", !projectSchema.safeParse({ title: "   " }).success);
  check("tags default to []", JSON.stringify(projectSchema.safeParse({ title: "x" }).data?.tags) === "[]");
  check("description defaults to empty", projectSchema.safeParse({ title: "x" }).data?.description === "");
  check("operator injection in title rejected", !projectSchema.safeParse({ title: { $ne: null } }).success);
  check(">20 tags rejected", !projectSchema.safeParse({ title: "x", tags: Array(21).fill("t") }).success);
  check("videoId required", !chooseReferenceSchema.safeParse({}).success);
  check("operator injection in videoId rejected", !chooseReferenceSchema.safeParse({ videoId: { $ne: null } }).success);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
