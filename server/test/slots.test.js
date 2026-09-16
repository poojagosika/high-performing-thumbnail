process.env.JWT_SECRET = "x".repeat(64);
delete process.env.YOUTUBE_API_KEY;

const crypto = require("crypto");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const sharp = require("sharp");

const SERVER_ROOT = path.join(__dirname, "..");
const SRC = path.join(SERVER_ROOT, "src");

require(path.join(SRC, "config/fonts")).register();

const { UPLOAD_DIR } = require(path.join(SRC, "config/upload"));
const { CANVAS_W, CANVAS_H, byId, DEFAULT_TEMPLATE } = require(path.join(SRC, "config/templates"));

let projects = [];
let nextId = 1;

const mkProject = (doc = {}) => {
  const p = {
    user: "u1",
    templateId: null,
    slots: {},
    slotOverrides: {},
    composedUrl: null,
    candidates: [],
    ...doc,
    _id: doc._id || `p${nextId++}`,
    createdAt: new Date(),
    save: async function () { return this; },
  };
  projects.push(p);
  return p;
};

const ProjectStub = {
  create: async (doc) => mkProject(doc),
  find: () => ({ sort: () => ({ limit: async () => projects }) }),
  findOne: async (f) =>
    projects.find(
      (p) =>
        String(p._id) === String(f._id) &&
        (f.user === undefined || String(p.user) === String(f.user)),
    ) || null,
  findOneAndDelete: async () => null,
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  const dir = parent && parent.filename ? path.dirname(parent.filename) : "";
  const abs = request.startsWith(".") ? path.resolve(dir, request) : request;
  if (abs === path.join(SRC, "models/Project")) return ProjectStub;
  return origLoad.apply(this, arguments);
};
const ctrl = require(path.join(SRC, "controllers/composeController"));
const { adoptLayout } = require(path.join(SRC, "controllers/projectController"));
const { templateChoiceSchema, slotEditSchema } = require(path.join(SRC, "schemas"));
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

const flat = (w, h, rgb) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .jpeg()
    .toBuffer();

const blob = (w, h, cx, cy, r) => {
  const b = Buffer.alloc(w * h * 3, 18);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) {
        const v = Math.round(255 * (1 - d / r));
        const i = (y * w + x) * 3;
        b[i] = v; b[i + 1] = Math.round(v * 0.7); b[i + 2] = Math.round(v * 0.5);
      }
    }
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
};

const before = new Set(fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []);

const stray = () =>
  (fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []).filter((f) => !before.has(f));

const staged = (buffer, ext) => {
  const filename = `test-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return { filename };
};

const onDisk = (url) => Boolean(url) && fs.existsSync(path.join(UPLOAD_DIR, path.basename(url)));

const asUser = (project, params, body, file) => ({
  user: { _id: project.user },
  params: { id: String(project._id), ...params },
  body: body || {},
  file: file || null,
});

const call = async (handler, req) => {
  const res = mkRes();
  await handler(req, res);
  return res;
};

(async () => {
  const bg = await flat(1280, 720, [40, 80, 160]);
  const person = await blob(800, 800, 400, 400, 260);
  const blank = await flat(800, 450, [90, 90, 110]);

  console.log("\nthe template catalogue");
  const list = mkRes();
  ctrl.listTemplates({}, list);
  const { TEMPLATES } = require(path.join(SRC, "config/templates"));
  check("every template is offered", list.body.length === TEMPLATES.length, String(list.body.length));
  check("including the one-host layout tech channels use",
    list.body.some((t) => t.id === "host-right"), list.body.map((t) => t.id).join(", "));
  check("with the slots the user has to fill",
    list.body.every((t) => t.id && t.name && t.slots.length && t.slots.every((s) => s.key && s.label && s.type)),
    JSON.stringify(list.body[0]));
  check("and says which slots get their background removed",
    list.body.find((t) => t.id === "two-subject").slots.filter((s) => s.cutout).length === 2);

  console.log("\nchoosing a template gives you a draft straight away");
  const project = mkProject();
  let res = await call(ctrl.chooseTemplate, asUser(project, {}, { templateId: "two-subject" }));
  check("the choice is stored", res.body.templateId === "two-subject", JSON.stringify(res.body.templateId));
  check("and a composite already exists before any upload", onDisk(res.body.composedUrl), String(res.body.composedUrl));

  const draft = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.composedUrl))).metadata();
  check(`the draft is ${CANVAS_W}x${CANVAS_H}`, draft.width === CANVAS_W && draft.height === CANVAS_H,
    `${draft.width}x${draft.height}`);

  console.log("\nuploading into a slot");
  const noTemplate = mkProject();
  let file = staged(bg, "jpg");
  res = await call(ctrl.uploadSlot, asUser(noTemplate, { key: "background" }, {}, file));
  check("without a template you are told to pick one", res.statusCode === 400, String(res.statusCode));
  check("and the orphan upload is deleted, not left on disk", !onDisk(file.filename));

  file = staged(bg, "jpg");
  res = await call(ctrl.uploadSlot, asUser(project, { key: "nonsense" }, {}, file));
  check("an unknown slot is a 404", res.statusCode === 404, String(res.statusCode));
  check("and that upload is deleted too", !onDisk(file.filename));

  file = staged(bg, "jpg");
  res = await call(ctrl.uploadSlot, asUser(project, { key: "headline" }, {}, file));
  check("you cannot upload an image into the text slot", res.statusCode === 404, String(res.statusCode));
  check("and that upload is deleted as well", !onDisk(file.filename));

  const firstComposed = project.composedUrl;
  file = staged(bg, "jpg");
  res = await call(ctrl.uploadSlot, asUser(project, { key: "background" }, {}, file));
  check("the background lands in its slot", res.statusCode === 200 && Boolean(res.body.slots.background), JSON.stringify(res.body.slots));
  check("kept as uploaded, since backgrounds are not cut out", res.body.slots.background.cutout === false);
  check("the composite is rebuilt", res.body.composedUrl !== firstComposed);
  check("and the superseded composite is cleaned up", !onDisk(firstComposed));

  console.log("\na subject slot removes the background on the way in");
  file = staged(person, "jpg");
  const rawName = file.filename;
  res = await call(ctrl.uploadSlot, asUser(project, { key: "subjectLeft" }, {}, file));
  check("the upload is accepted", res.statusCode === 200, JSON.stringify(res.body));
  check("marked as cut out", res.body.slots.subjectLeft.cutout === true);
  check("with the coverage it measured", typeof res.body.slots.subjectLeft.coverage === "number",
    String(res.body.slots.subjectLeft.coverage));
  check("the original upload is discarded once cut", !onDisk(rawName));

  const cutMeta = await sharp(path.join(UPLOAD_DIR, path.basename(res.body.slots.subjectLeft.url))).metadata();
  check("and what we stored genuinely has transparency", cutMeta.hasAlpha === true, JSON.stringify(cutMeta.hasAlpha));

  console.log("\nan image with nothing to cut out is refused, not silently emptied");
  const keptUrl = project.slots.subjectLeft.url;
  file = staged(blank, "jpg");
  res = await call(ctrl.uploadSlot, asUser(project, { key: "subjectRight" }, {}, file));
  check("the upload is rejected", res.statusCode === 422, String(res.statusCode));
  check("with a message the user can act on", /subject|background/i.test(res.body.message || ""), res.body.message);
  check("and a code the client can branch on", ["NO_SUBJECT", "NO_BACKGROUND"].includes(res.body.code), res.body.code);
  check("nothing is stored in the slot", project.slots.subjectRight === undefined);
  check("the rejected upload leaves no file behind", !onDisk(file.filename));
  check("and the slot that WAS filled is untouched", project.slots.subjectLeft.url === keptUrl && onDisk(keptUrl));

  console.log("\nediting a slot");
  let composed = project.composedUrl;
  res = await call(ctrl.editSlot, asUser(project, { key: "headline" }, { text: "NEPAL DISASTER" }));
  check("the headline text is saved", res.body.slotOverrides.headline.text === "NEPAL DISASTER",
    JSON.stringify(res.body.slotOverrides));
  check("and the composite is rebuilt with it", res.body.composedUrl !== composed);
  check("replacing the old one", !onDisk(composed));

  res = await call(ctrl.editSlot, asUser(project, { key: "headline" }, { color: "#FFDD00" }));
  check("a second edit MERGES, it does not wipe the first",
    res.body.slotOverrides.headline.text === "NEPAL DISASTER" && res.body.slotOverrides.headline.color === "#FFDD00",
    JSON.stringify(res.body.slotOverrides.headline));

  res = await call(ctrl.editSlot, asUser(project, { key: "headline" }, { zoom: 2 }));
  check("image settings are refused on a text slot", res.statusCode === 400, String(res.statusCode));
  check("saying which slot they do not fit", /headline/i.test(res.body.message || ""), res.body.message);

  res = await call(ctrl.editSlot, asUser(project, { key: "subjectLeft" }, { text: "hi" }));
  check("and text settings are refused on an image slot", res.statusCode === 400, String(res.statusCode));

  composed = project.composedUrl;
  res = await call(ctrl.editSlot, asUser(project, { key: "subjectLeft" }, { dx: 0.1, zoom: 1.2 }));
  check("moving a subject is allowed", res.statusCode === 200 && res.body.slotOverrides.subjectLeft.dx === 0.1,
    JSON.stringify(res.body.slotOverrides.subjectLeft));
  check("and redraws the thumbnail", res.body.composedUrl !== composed);

  res = await call(ctrl.editSlot, asUser(project, { key: "nonsense" }, { text: "hi" }));
  check("an unknown slot cannot be edited", res.statusCode === 404, String(res.statusCode));

  console.log("\nanother user cannot touch my slots");
  const mine = project.slots.subjectLeft.url;
  const intruder = { user: { _id: "u2" }, params: { id: String(project._id), key: "subjectLeft" }, body: { dx: 0.4 }, file: null };
  check("they cannot edit", (await call(ctrl.editSlot, intruder)).statusCode === 404);
  check("they cannot upload", (await call(ctrl.uploadSlot, { ...intruder, file: staged(person, "jpg") })).statusCode === 404);
  check("they cannot clear", (await call(ctrl.clearSlot, intruder)).statusCode === 404);
  check("they cannot switch my template", (await call(ctrl.chooseTemplate, { ...intruder, body: { templateId: "split-screen" } })).statusCode === 404);
  check("my image is still there", onDisk(mine));
  check("and my template is unchanged", project.templateId === "two-subject");

  console.log("\nclearing a slot");
  composed = project.composedUrl;
  res = await call(ctrl.clearSlot, asUser(project, { key: "subjectLeft" }));
  check("the slot is emptied", res.body.slots.subjectLeft === undefined, JSON.stringify(res.body.slots));
  check("its file is deleted", !onDisk(mine));
  check("its edits go with it", res.body.slotOverrides.subjectLeft === undefined);
  check("and the thumbnail is redrawn without it", res.body.composedUrl !== composed);
  check("while the background survives", Boolean(res.body.slots.background));

  console.log("\nswitching template clears what the new one cannot use");
  const bgUrl = project.slots.background.url;
  res = await call(ctrl.chooseTemplate, asUser(project, {}, { templateId: "split-screen" }));
  check("the new template is stored", res.body.templateId === "split-screen");
  check("slots it does not have are dropped", res.body.slots.background === undefined, JSON.stringify(res.body.slots));
  check("their files are deleted rather than orphaned", !onDisk(bgUrl));
  check("their edits are dropped too", res.body.slotOverrides.headline === undefined,
    JSON.stringify(res.body.slotOverrides));
  check("and a fresh draft of the new template is built", onDisk(res.body.composedUrl));

  res = await call(ctrl.chooseTemplate, asUser(project, {}, { templateId: "split-screen" }));
  check("re-picking the same template keeps your work", res.statusCode === 200);

  console.log("\nthe reference decides the first template");
  const fresh = mkProject();
  adoptLayout(fresh, { template: "two-subject", headlineBand: "top" });
  check("a two-person reference picks the two-subject template", fresh.templateId === "two-subject", fresh.templateId);
  check("and the headline starts where the reference put it", fresh.slotOverrides.headline.band === "top",
    JSON.stringify(fresh.slotOverrides));

  const blind = mkProject();
  adoptLayout(blind, null);
  check("with no detection we still open a usable template", blind.templateId === DEFAULT_TEMPLATE, blind.templateId);
  check("and invent no headline placement", Object.keys(blind.slotOverrides).length === 0,
    JSON.stringify(blind.slotOverrides));

  const chosen = mkProject({ templateId: "split-screen" });
  adoptLayout(chosen, { template: "two-subject", headlineBand: "bottom" });
  check("a template the user already picked is never overridden", chosen.templateId === "split-screen");

  const edited = mkProject({ slotOverrides: { headline: { band: "bottom" } } });
  adoptLayout(edited, { template: "two-subject", headlineBand: "top" });
  check("nor is a band the user already moved", edited.slotOverrides.headline.band === "bottom",
    JSON.stringify(edited.slotOverrides));

  const unknown = mkProject();
  adoptLayout(unknown, { template: "made-up", headlineBand: "top" });
  check("an unknown template name falls back instead of breaking compose",
    Boolean(byId(unknown.templateId)), unknown.templateId);

  console.log("\nwhat the edit fields will accept");
  const rejects = (body) => !slotEditSchema.safeParse(body).success;
  check("a colour must be a hex colour", rejects({ color: "red" }));
  check("a font must be one we actually bundle", rejects({ font: "comic-sans" }));
  check("font size stays in a range that renders", rejects({ scale: 4 }) && rejects({ scale: 0 }));
  check("rotation cannot be turned upside down", rejects({ rotate: 90 }));
  check("zoom is bounded", rejects({ zoom: 40 }));
  check("the headline cannot be an essay", rejects({ text: "x".repeat(121) }));
  check("an empty edit is rejected", rejects({}));
  check("a real edit is accepted", slotEditSchema.safeParse({ text: "GO", font: "anton", color: "#FF2A1A" }).success);
  check("only real templates can be chosen", !templateChoiceSchema.safeParse({ templateId: "nope" }).success);
  check("and the real ones are", templateChoiceSchema.safeParse({ templateId: "side-panel" }).success);

  console.log("\nnothing was left lying in the uploads folder");
  const alive = new Set(
    projects
      .flatMap((p) => [p.composedUrl, ...Object.values(p.slots || {}).map((s) => s && s.url)])
      .filter(Boolean)
      .map((u) => path.basename(u)),
  );
  const leaked = stray().filter((f) => !alive.has(f));
  check("every file on disk belongs to a live slot or composite", leaked.length === 0, leaked.join(", "));

  for (const f of stray()) fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
