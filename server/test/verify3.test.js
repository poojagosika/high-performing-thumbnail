process.env.JWT_SECRET = require("crypto").randomBytes(48).toString("hex");
process.env.CORS_ORIGINS = "https://youtube-publishing.onrender.com,http://localhost:5173";
process.env.PORT = "0";

const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.endsWith("config/db")) return require.resolve("./stub-db.js");
  return origResolve.call(this, request, ...rest);
};

const path = require("path");
const fs = require("fs");
const SERVER = `${SERVER_ROOT}`;

const uploadsDir = path.join(SERVER, "uploads");
const probeName = "verify-probe.png";
fs.writeFileSync(
  path.join(uploadsDir, probeName),
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
);

const origListen = require("http").Server.prototype.listen;
let server;
require("http").Server.prototype.listen = function (...args) {
  server = this;
  return origListen.call(this, 0, "127.0.0.1", args[args.length - 1]);
};

process.chdir(SERVER);
require(path.join(SERVER, "src/index.js"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? "PASS  " : "FAIL  ") + name.padEnd(46) + (detail || ""));
};

setTimeout(async () => {
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  const h = health.headers;
  check("HSTS present", !!h.get("strict-transport-security"), h.get("strict-transport-security"));
  check("nosniff on API", h.get("x-content-type-options") === "nosniff");
  check("frameguard", !!h.get("x-frame-options"), h.get("x-frame-options"));
  check("referrer-policy", !!h.get("referrer-policy"), h.get("referrer-policy"));
  check("X-Powered-By removed", h.get("x-powered-by") === null);
  check("no-Origin request works", health.status === 200, "health checks must not break");

  const up = await fetch(`${base}/uploads/${probeName}`);
  check(
    "CORP on /uploads beats helmet",
    up.headers.get("cross-origin-resource-policy") === "cross-origin",
    "got: " + up.headers.get("cross-origin-resource-policy"),
  );
  check(
    "CSP on /uploads is the strict one",
    (up.headers.get("content-security-policy") || "").includes("default-src 'none'"),
    up.headers.get("content-security-policy"),
  );

  const blocked = await fetch(`${base}/uploads/evil.html`);
  check("static guard 404s .html", blocked.status === 404);

  const good = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://youtube-publishing.onrender.com" },
  });
  check(
    "allowed origin echoed",
    good.headers.get("access-control-allow-origin") === "https://youtube-publishing.onrender.com",
    good.headers.get("access-control-allow-origin"),
  );
  check("credentials allowed", good.headers.get("access-control-allow-credentials") === "true");

  const evil = await fetch(`${base}/api/health`, { headers: { Origin: "https://evil.com" } });
  check(
    "disallowed origin gets no ACAO",
    evil.headers.get("access-control-allow-origin") === null,
    "got: " + evil.headers.get("access-control-allow-origin"),
  );

  const pre = await fetch(`${base}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://youtube-publishing.onrender.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-csrf-token",
    },
  });
  check(
    "preflight allows X-CSRF-Token",
    (pre.headers.get("access-control-allow-headers") || "").toLowerCase().includes("x-csrf-token"),
    pre.headers.get("access-control-allow-headers"),
  );

  const big = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pad: "x".repeat(200 * 1024) }),
  });
  const bigCt = big.headers.get("content-type") || "";
  check("oversized body rejected", big.status === 413, "status " + big.status);
  check("rejection is JSON not HTML", bigCt.includes("application/json"), bigCt);

  const nf = await fetch(`${base}/api/nope`);
  const nfBody = await nf.text();
  check("unknown route 404 JSON", nf.status === 404 && nfBody.trim().startsWith("{"), nfBody.slice(0, 40));

  fs.unlinkSync(path.join(uploadsDir, probeName));
  server.close();

  const failed = results.filter((r) => !r.pass);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
}, 400);
