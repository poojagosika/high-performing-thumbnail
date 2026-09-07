const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const only = process.argv[2];

const suites = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".test.js"))
  .filter((f) => (only ? f.includes(only) : true))
  .sort();

const env = {
  ...process.env,
  NODE_ENV: "test",
  JWT_SECRET: process.env.JWT_SECRET || "t".repeat(64),
  BCRYPT_ROUNDS: "4",
};

const runSuite = (file) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(DIR, file)], { env });

    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));

    child.on("close", (code) => {
      const m = out.match(/(\d+) passed, (\d+) failed/);
      const alt = out.match(/(\d+)\/(\d+) passed/);
      const passed = m ? Number(m[1]) : alt ? Number(alt[1]) : 0;
      const failed = m ? Number(m[2]) : alt ? Number(alt[2]) - Number(alt[1]) : code === 0 ? 0 : 1;
      resolve({ file, code, passed, failed, ms: Date.now() - started, out });
    });
  });

(async () => {
  const results = [];

  for (const file of suites) {
    const r = await runSuite(file);
    results.push(r);
    const status = r.code === 0 ? "PASS" : "FAIL";
    process.stdout.write(
      `${status}  ${file.padEnd(24)} ${String(r.passed).padStart(3)} checks  ${String(r.ms).padStart(6)}ms\n`,
    );
    if (r.code !== 0) {
      process.stdout.write(
        out(r.out)
          .split("\n")
          .filter((l) => /FAIL|Error|not ok/i.test(l))
          .map((l) => `      ${l.trim()}\n`)
          .join(""),
      );
    }
  }

  const totalPassed = results.reduce((a, r) => a + r.passed, 0);
  const totalFailed = results.reduce((a, r) => a + r.failed, 0);
  const broken = results.filter((r) => r.code !== 0);
  const ms = results.reduce((a, r) => a + r.ms, 0);

  process.stdout.write(
    `\n${suites.length} suites, ${totalPassed} checks passed, ${totalFailed} failed, ${(ms / 1000).toFixed(1)}s\n`,
  );

  if (broken.length) {
    process.stdout.write(`\nfailing suites: ${broken.map((r) => r.file).join(", ")}\n`);
  }

  process.exit(broken.length ? 1 : 0);
})();

function out(s) {
  return s;
}
