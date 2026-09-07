const SERVER_ROOT = require("path").join(__dirname, "..");
const path = require("path");

const SERVER = `${SERVER_ROOT}`;
const CONTROLLERS = path.join(SERVER, "src/controllers");
const { UPLOAD_DIR } = require(path.join(SERVER, "src/config/upload"));

const oldPath = (imageUrl) => path.join(CONTROLLERS, "../../", imageUrl);
const newPath = (imageUrl) => path.resolve(UPLOAD_DIR, path.basename(imageUrl));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

console.log("\nremoveFile -> removeUpload equivalence on real stored values");

const real = [
  "/uploads/1756500000000-a1b2c3d4e5f6a7b8.jpg",
  "/uploads/1756500000001-0000000000000000.jpeg",
  "/uploads/1756500000002-ffffffffffffffff.png",
  "/uploads/1756500000003-deadbeefdeadbeef.webp",
];

for (const url of real) {
  check(`same target for ${url}`, oldPath(url) === newPath(url), `${oldPath(url)} vs ${newPath(url)}`);
}

check("every real target sits inside UPLOAD_DIR",
  real.every((u) => newPath(u).startsWith(`${UPLOAD_DIR}${path.sep}`)));

console.log("\ninputs where they intentionally diverge");

const hostile = [
  "/uploads/../../../etc/passwd",
  "/uploads/../package.json",
  "/etc/passwd",
  "../../../../root/.ssh/id_rsa",
];

for (const url of hostile) {
  const before = oldPath(url);
  const after = newPath(url);
  const escaped = !before.startsWith(`${UPLOAD_DIR}${path.sep}`);
  const contained = after.startsWith(`${UPLOAD_DIR}${path.sep}`);
  check(`${url} — old escaped, new contained`, escaped && contained, `${before} -> ${after}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
