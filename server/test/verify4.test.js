process.env.JWT_SECRET = require("crypto").randomBytes(48).toString("hex");
process.env.CORS_ORIGINS = "https://youtube-publishing.onrender.com";
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
require("http").Server.prototype.listen = function (...args) {
  server = this;
  return origListen.call(this, 0, "127.0.0.1", args[args.length - 1]);
};

process.chdir(SERVER);
require(path.join(SERVER, "src/index.js"));

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? "PASS  " : "FAIL  ") + name.padEnd(50) + (detail || ""));
};

const GOOD = "https://youtube-publishing.onrender.com";

setTimeout(async () => {
  const base = `http://127.0.0.1:${server.address().port}`;

  const issue = await fetch(`${base}/api/auth/csrf`, { headers: { Origin: GOOD } });
  const { csrfToken } = await issue.json();
  const setCookie = issue.headers.getSetCookie().find((c) => c.startsWith("csrfSecret="));
  const cookie = setCookie.split(";")[0];

  check("GET /auth/csrf returns a token", /^[a-f0-9]{64}$/.test(csrfToken || ""), csrfToken?.slice(0, 16) + "...");
  check("secret cookie is httpOnly", /httponly/i.test(setCookie));
  check("secret cookie is not the token itself", !setCookie.includes(csrfToken));

  const post = (opts) =>
    fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...opts.headers },
      body: JSON.stringify({ email: "a@b.c", password: "irrelevant" }),
    });

  const noToken = await post({ headers: { Origin: GOOD, Cookie: cookie } });
  check("POST with cookie but NO header blocked", noToken.status === 403, "status " + noToken.status);

  const noCookie = await post({ headers: { Origin: GOOD, "X-CSRF-Token": csrfToken } });
  check("POST with header but NO cookie blocked", noCookie.status === 403, "status " + noCookie.status);

  const wrong = await post({
    headers: { Origin: GOOD, Cookie: cookie, "X-CSRF-Token": "f".repeat(64) },
  });
  check("POST with forged token blocked", wrong.status === 403, "status " + wrong.status);

  const evilOrigin = await post({
    headers: { Origin: "https://evil.com", Cookie: cookie, "X-CSRF-Token": csrfToken },
  });
  check("valid token from evil.com origin blocked", evilOrigin.status === 403, "status " + evilOrigin.status);

  const evilReferer = await post({
    headers: { Referer: "https://evil.com/attack", Cookie: cookie, "X-CSRF-Token": csrfToken },
  });
  check("valid token with evil referer blocked", evilReferer.status === 403, "status " + evilReferer.status);

  const mismatch = await fetch(`${base}/api/auth/csrf`, { headers: { Origin: GOOD } });
  const other = await mismatch.json();
  const otherCookie = mismatch.headers.getSetCookie().find((c) => c.startsWith("csrfSecret=")).split(";")[0];
  const crossed = await post({
    headers: { Origin: GOOD, Cookie: otherCookie, "X-CSRF-Token": csrfToken },
  });
  check("token from a different secret blocked", crossed.status === 403, "status " + crossed.status);
  check("second issue produced a different token", other.csrfToken !== csrfToken);

  const valid = await post({ headers: { Origin: GOOD, Cookie: cookie, "X-CSRF-Token": csrfToken } });
  check("valid pair passes CSRF (reaches auth)", valid.status !== 403, "status " + valid.status + " (401 = got to login)");

  const safeGet = await fetch(`${base}/api/health`, { headers: { Origin: GOOD } });
  check("GET unaffected by CSRF", safeGet.status === 200);

  server.close();
  const failed = results.filter((r) => !r).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  process.exit(failed ? 1 : 0);
}, 400);
