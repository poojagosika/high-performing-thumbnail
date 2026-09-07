process.env.JWT_SECRET = require("crypto").randomBytes(48).toString("hex");
process.env.CORS_ORIGINS = "https://x.test";
process.env.PORT = "0";

const SERVER_ROOT = require("path").join(__dirname, "..");
require("mongoose").set("bufferTimeoutMS", 200);
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.endsWith("config/db")) return require.resolve("./stub-db.js");
  return origResolve.call(this, request, ...rest);
};

const path = require("path");
const SERVER = `${SERVER_ROOT}`;

let server;
const origListen = require("http").Server.prototype.listen;
require("http").Server.prototype.listen = function (...a) {
  server = this;
  return origListen.call(this, 0, "127.0.0.1", a[a.length - 1]);
};

process.chdir(SERVER);
require(path.join(SERVER, "src/index.js"));

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? "PASS  " : "FAIL  ") + name.padEnd(48) + (detail || ""));
};

const ORIGIN = "https://x.test";

setTimeout(async () => {
  const base = `http://127.0.0.1:${server.address().port}`;

  const iss = await fetch(`${base}/api/auth/csrf`, { headers: { Origin: ORIGIN } });
  const { csrfToken } = await iss.json();
  const cookie = iss.headers.getSetCookie().find((c) => c.startsWith("csrfSecret=")).split(";")[0];

  const login = (email) =>
    fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });

  const statuses = [];
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) statuses.push((await login("victim@test.com")).status);
  const elapsed = Date.now() - t0;

  check("first 5 attempts not rate-limited", statuses.slice(0, 5).every((s) => s !== 429), statuses.slice(0, 5).join(","));
  check("6th attempt returns 429", statuses[5] === 429, "statuses: " + statuses.join(","));

  const blocked = await login("victim@test.com");
  const body = await blocked.json();
  check("429 body is JSON", typeof body.message === "string", JSON.stringify(body));
  check("RateLimit headers present", !!blocked.headers.get("ratelimit"), blocked.headers.get("ratelimit"));

  const other = await login("someone-else@test.com");
  check("different email NOT blocked", other.status !== 429, "status " + other.status + " (per IP+email key)");

  check("slow-down added measurable delay", elapsed > 1000, elapsed + "ms for 6 attempts");

  const health = await fetch(`${base}/api/health`, { headers: { Origin: ORIGIN } });
  check("GET /api/health unaffected", health.status === 200);

  server.close();
  const failed = results.filter((r) => !r).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  process.exit(failed ? 1 : 0);
}, 400);
