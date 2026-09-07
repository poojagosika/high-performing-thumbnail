const fs = require("fs");
const path = require("path");
const os = require("os");

const { removeUpload, UPLOAD_DIR } = require("../src/config/upload");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const SERVER_ROOT = path.resolve(UPLOAD_DIR, "..");
const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), "ru-"));
const outsideFile = path.join(sentinelDir, "precious.txt");
const siblingFile = path.join(SERVER_ROOT, "package.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

console.log("\nremoveUpload");

const target = path.join(UPLOAD_DIR, "victim.jpg");
fs.writeFileSync(target, "x");
removeUpload("/uploads/victim.jpg");
check("removes a normal upload", !fs.existsSync(target));

fs.writeFileSync(outsideFile, "x");
removeUpload("/uploads/../../../../../../.." + outsideFile);
check("traversal out of UPLOAD_DIR is refused", fs.existsSync(outsideFile), outsideFile);

check("sibling file exists before", fs.existsSync(siblingFile));
removeUpload("/uploads/../package.json");
check("dot-dot to a sibling is refused", fs.existsSync(siblingFile));

removeUpload("/etc/passwd");
check("absolute path outside is refused", fs.existsSync("/etc/passwd"));

removeUpload("");
removeUpload(null);
removeUpload(undefined);
removeUpload(0);
removeUpload({});
removeUpload("/uploads/");
check("empty / non-string / trailing-slash inputs are no-ops", fs.existsSync(UPLOAD_DIR));

removeUpload("/uploads/never-existed-abc123.jpg");
check("missing file is a silent no-op", true);

const nested = path.join(UPLOAD_DIR, "deep");
fs.mkdirSync(nested, { recursive: true });
removeUpload("/uploads/deep");
check("directory is not unlinked", fs.existsSync(nested));
fs.rmSync(nested, { recursive: true, force: true });

fs.rmSync(sentinelDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
