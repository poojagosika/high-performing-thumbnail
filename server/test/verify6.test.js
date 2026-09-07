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
  console.log((pass ? "PASS  " : "FAIL  ") + name.padEnd(46) + (detail || ""));
};

const ORIGIN = "https://x.test";

setTimeout(async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const iss = await fetch(`${base}/api/auth/csrf`, { headers: { Origin: ORIGIN } });
  const { csrfToken } = await iss.json();
  const cookie = iss.headers.getSetCookie().find((c) => c.startsWith("csrfSecret=")).split(";")[0];

  const post = (endpoint, body) =>
    fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(body),
    });

  const j = async (r) => ({ status: r.status, body: await r.json() });

  const inj1 = await j(await post("/api/auth/login", { email: { $ne: null }, password: "x" }));
  check("login with {$ne:null} email", inj1.status === 400, inj1.status + " " + JSON.stringify(inj1.body.message));

  const inj2 = await j(await post("/api/auth/login", { email: { $gt: "" }, password: "x" }));
  check("login with {$gt:''} email", inj2.status === 400, inj2.status + " " + JSON.stringify(inj2.body.message));

  const inj3 = await j(await post("/api/auth/register", { name: "a", email: { $ne: null }, password: "password1" }));
  check("register with operator email", inj3.status === 400, inj3.status + " " + JSON.stringify(inj3.body.message));

  const inj4 = await j(await post("/api/thumbnails/bulk-delete", { ids: [{ $ne: null }] }));
  check("bulk-delete ids [{$ne:null}]", inj4.status === 400 || inj4.status === 401, inj4.status + " " + JSON.stringify(inj4.body.message));

  const inj5 = await j(await post("/api/thumbnails/bulk-delete", { ids: ["not-an-objectid"] }));
  check("bulk-delete non-ObjectId id", inj5.status === 400 || inj5.status === 401, inj5.status + " " + JSON.stringify(inj5.body.message));

  const bad = await fetch(`${base}/api/thumbnails/not-a-valid-id`, { headers: { Origin: ORIGIN, Cookie: cookie } });
  check("GET /thumbnails/not-a-valid-id", bad.status === 404 || bad.status === 401, "status " + bad.status + " (was 500 before)");

  const valid = await j(await post("/api/auth/login", { email: "real@user.com", password: "correctpass" }));
  check("valid login body passes validation", valid.status !== 400, "status " + valid.status + " (reaches controller)");

  const short = await j(await post("/api/auth/register", { name: "a", email: "a@b.co", password: "short" }));
  check("short password rejected", short.status === 400, JSON.stringify(short.body.message));

  server.close();
  const failed = results.filter((r) => !r).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  process.exit(failed ? 1 : 0);
}, 400);
