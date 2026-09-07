process.env.JWT_SECRET = "x".repeat(64);
process.env.CLIENT_URL = "https://thumb.poojagosika.com";
process.env.BCRYPT_ROUNDS = "4";

const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SRC = `${SERVER_ROOT}/src`;

let db = [];
let mails = [];

const clone = (o) => (o ? JSON.parse(JSON.stringify(o), (k, v) =>
  (k === "resetTokenExpires" || k === "lockUntil") && typeof v === "string" ? new Date(v) : v) : o);

const matches = (doc, filter) => {
  for (const [k, v] of Object.entries(filter)) {
    if (k === "_id") { if (String(doc._id) !== String(v)) return false; continue; }
    if (v && typeof v === "object" && "$gt" in v) {
      if (!doc[k] || new Date(doc[k]).getTime() <= new Date(v.$gt).getTime()) return false;
      continue;
    }
    if (doc[k] !== v) return false;
  }
  return true;
};

const applyUpdate = (doc, update) => {
  if (update.$set) Object.assign(doc, update.$set);
  if (update.$inc) for (const [k, n] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + n;
};

const UserStub = {
  findOne: (filter) => {
    const found = db.find((d) => matches(d, filter));
    const q = Promise.resolve(clone(found));
    q.select = () => Promise.resolve(clone(found));
    return q;
  },
  updateOne: async (filter, update) => {
    const doc = db.find((d) => matches(d, filter));
    if (doc) applyUpdate(doc, update);
    return { modifiedCount: doc ? 1 : 0 };
  },
  findOneAndUpdate: async (filter, update) => {
    const doc = db.find((d) => matches(d, filter));
    if (!doc) return null;
    const before = clone(doc);
    applyUpdate(doc, update);
    return before;
  },
};

const mailerStub = {
  isMailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
  sendPasswordReset: async (to, name, token) => {
    if (mailerStub.fail) throw new Error("send failed");
    mails.push({ to, name, token });
  },
  buildResetUrl: (t) => t,
  fail: false,
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolvedFrom = parent && parent.filename ? path.dirname(parent.filename) : "";
  const abs = request.startsWith(".") ? path.resolve(resolvedFrom, request) : request;
  if (abs === path.join(SRC, "models/User")) return UserStub;
  if (abs === path.join(SRC, "config/mailer")) return mailerStub;
  return origLoad.apply(this, arguments);
};

const auth = require(path.join(SRC, "controllers/authController"));
const { forgotPasswordSchema, resetPasswordSchema } = require(path.join(SRC, "schemas"));

const mkRes = () => {
  const res = { statusCode: 200, body: null, cookies: [] };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.cookie = (n, v, o) => { res.cookies.push({ n, v, o }); return res; };
  return res;
};

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const seed = async () => {
  db = [{
    _id: "u1",
    name: "Pooja",
    email: "pooja@example.com",
    password: await bcrypt.hash("originalpw", 4),
    tokenVersion: 3,
    failedLoginAttempts: 4,
    lockUntil: new Date(Date.now() + 600000),
    resetTokenHash: null,
    resetTokenExpires: null,
  }];
  mails = [];
};

(async () => {
  console.log("\nforgot-password");
  await seed();
  let res = mkRes();
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, res);
  const known = { status: res.statusCode, body: JSON.stringify(res.body) };
  check("known email -> 200 generic", res.statusCode === 200 && /reset link is on its way/.test(res.body.message));
  check("mail queued", mails.length === 1);
  check("token stored hashed, raw absent", db[0].resetTokenHash === sha(mails[0].token) && !JSON.stringify(db[0]).includes(mails[0].token));
  check("token is 64 hex", /^[a-f0-9]{64}$/.test(mails[0].token));
  check("expiry ~30min out", Math.abs(db[0].resetTokenExpires.getTime() - Date.now() - 1800000) < 5000);

  await seed();
  res = mkRes();
  await auth.forgotPassword({ body: { email: "nobody@example.com" } }, res);
  const unknown = { status: res.statusCode, body: JSON.stringify(res.body) };
  check("unknown email -> byte-identical response", known.status === unknown.status && known.body === unknown.body,
    `${JSON.stringify(known)} vs ${JSON.stringify(unknown)}`);
  check("no mail for unknown email", mails.length === 0);

  await seed();
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, mkRes());
  const firstToken = mails[0].token;
  res = mkRes();
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, res);
  check("resend inside 60s suppressed", mails.length === 1);
  check("suppressed resend still generic 200", res.statusCode === 200 && JSON.stringify(res.body) === known.body);
  check("stored token untouched by suppressed resend", db[0].resetTokenHash === sha(firstToken));

  db[0].resetTokenExpires = new Date(Date.now() + 1800000 - 61000);
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, mkRes());
  check("resend allowed after 60s", mails.length === 2);

  await seed();
  mailerStub.fail = true;
  res = mkRes();
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, res);
  mailerStub.fail = false;
  check("send failure still generic 200", res.statusCode === 200 && JSON.stringify(res.body) === known.body);

  console.log("\nreset-password");
  await seed();
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, mkRes());
  const token = mails[0].token;

  res = mkRes();
  await auth.resetPassword({ body: { token, password: "brandnewpw1" } }, res);
  check("valid token -> 200", res.statusCode === 200, JSON.stringify(res.body));
  check("password replaced", await bcrypt.compare("brandnewpw1", db[0].password));
  check("tokenVersion bumped 3 -> 4", db[0].tokenVersion === 4, String(db[0].tokenVersion));
  check("reset fields cleared", db[0].resetTokenHash === null && db[0].resetTokenExpires === null);
  check("lockout cleared", db[0].failedLoginAttempts === 0 && db[0].lockUntil === null);
  check("no auth cookie set", res.cookies.length === 0);

  res = mkRes();
  await auth.resetPassword({ body: { token, password: "anotherpw123" } }, res);
  const invalidBody = JSON.stringify(res.body);
  check("token is single-use -> 400", res.statusCode === 400);
  check("password not changed on replay", await bcrypt.compare("brandnewpw1", db[0].password));

  await seed();
  await auth.forgotPassword({ body: { email: "pooja@example.com" } }, mkRes());
  const expiring = mails[0].token;
  db[0].resetTokenExpires = new Date(Date.now() - 1000);
  res = mkRes();
  await auth.resetPassword({ body: { token: expiring, password: "brandnewpw1" } }, res);
  check("expired token -> 400", res.statusCode === 400);
  check("expired message identical to invalid", JSON.stringify(res.body) === invalidBody);
  check("password untouched by expired token", await bcrypt.compare("originalpw", db[0].password));

  res = mkRes();
  await auth.resetPassword({ body: { token: "a".repeat(64), password: "brandnewpw1" } }, res);
  check("unknown token -> 400", res.statusCode === 400);

  console.log("\nschemas");
  check("forgot rejects missing email", !forgotPasswordSchema.safeParse({}).success);
  check("forgot rejects bad email", !forgotPasswordSchema.safeParse({ email: "nope" }).success);
  check("forgot lowercases + trims", forgotPasswordSchema.safeParse({ email: " Pooja@Example.COM " }).data?.email === "pooja@example.com");
  check("forgot strips turnstileToken", !("turnstileToken" in (forgotPasswordSchema.safeParse({ email: "a@b.co", turnstileToken: "x" }).data || {})));
  check("reset rejects short token", !resetPasswordSchema.safeParse({ token: "abc", password: "longenough1" }).success);
  check("reset rejects non-hex token", !resetPasswordSchema.safeParse({ token: "g".repeat(64), password: "longenough1" }).success);
  check("reset rejects operator object token", !resetPasswordSchema.safeParse({ token: { $ne: null }, password: "longenough1" }).success);
  check("reset rejects 7-char password", !resetPasswordSchema.safeParse({ token: "a".repeat(64), password: "short12" }).success);
  const shortMsg = resetPasswordSchema.safeParse({ token: "a".repeat(64), password: "short12" }).error.issues[0].message;
  check("short password message is useful", /at least 8/.test(shortMsg), shortMsg);
  check("reset accepts valid input", resetPasswordSchema.safeParse({ token: "a".repeat(64), password: "longenough1" }).success);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
