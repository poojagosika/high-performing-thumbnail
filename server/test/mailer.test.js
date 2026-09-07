process.env.JWT_SECRET = "x".repeat(64);
process.env.CLIENT_URL = "https://thumb.poojagosika.com/";

const SERVER_ROOT = require("path").join(__dirname, "..");
const SRC = `${SERVER_ROOT}/src`;
const mailer = require(`${SRC}/config/mailer`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

(async () => {
  console.log("\nmailer");
  check("not configured without key", mailer.isMailConfigured() === false);

  const url = mailer.buildResetUrl("a".repeat(64));
  check("link built from CLIENT_URL, no double slash",
    url === `https://thumb.poojagosika.com/reset-password?token=${"a".repeat(64)}`, url);

  const logged = [];
  const origLog = console.log;
  console.log = (m) => logged.push(m);
  await mailer.sendPasswordReset("pooja@example.com", "Pooja", "b".repeat(64));
  console.log = origLog;
  check("dev fallback logs the link", logged.some((l) => l.includes(`token=${"b".repeat(64)}`)), JSON.stringify(logged));

  process.env.RESEND_API_KEY = "re_test_key";
  process.env.MAIL_FROM = "noreply@poojagosika.com";
  check("configured with key + from", mailer.isMailConfigured() === true);

  let captured = null;
  const origFetch = global.fetch;
  global.fetch = async (u, opts) => {
    captured = { u, opts };
    return { ok: true, status: 200, text: async () => "" };
  };

  await mailer.sendPasswordReset("pooja@example.com", 'Pooja "<script>alert(1)</script>"', "c".repeat(64));

  const body = JSON.parse(captured.opts.body);
  check("posts to resend", captured.u === "https://api.resend.com/emails");
  check("bearer auth header", captured.opts.headers.Authorization === "Bearer re_test_key");
  check("from = MAIL_FROM", body.from === "noreply@poojagosika.com");
  check("to = recipient", Array.isArray(body.to) && body.to[0] === "pooja@example.com");
  check("subject set", typeof body.subject === "string" && body.subject.length > 0);
  check("html carries the link", body.html.includes(`token=${"c".repeat(64)}`));
  check("text carries the link", body.text.includes(`token=${"c".repeat(64)}`));
  check("name escaped in html", !body.html.includes("<script>") && body.html.includes("&lt;script&gt;"), body.html.slice(0, 200));
  check("timeout signal attached", captured.opts.signal instanceof AbortSignal);

  global.fetch = async () => ({ ok: false, status: 422, text: async () => "domain not verified" });
  let threw = false;
  try {
    await mailer.sendPasswordReset("pooja@example.com", "Pooja", "d".repeat(64));
  } catch (e) {
    threw = /422/.test(e.message);
  }
  check("non-2xx from resend throws", threw);
  global.fetch = origFetch;

  console.log("\nproduction fail-closed");
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  process.env.NODE_ENV = "production";

  const Module = require("module");
  const path = require("path");
  for (const k of Object.keys(require.cache)) delete require.cache[k];

  const origLoad = Module._load;
  Module._load = function (request, parent) {
    const dir = parent && parent.filename ? path.dirname(parent.filename) : "";
    const abs = request.startsWith(".") ? path.resolve(dir, request) : request;
    if (abs === path.join(SRC, "models/User")) {
      return { findOne: () => { throw new Error("db must not be touched"); } };
    }
    return origLoad.apply(this, arguments);
  };

  const auth = require(`${SRC}/controllers/authController`);
  Module._load = origLoad;

  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, res);
  check("prod + no key -> 503", res.statusCode === 503, JSON.stringify(res.body));
  check("503 message is non-leaky", !/resend|api key/i.test(res.body.message), res.body.message);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
