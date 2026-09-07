process.env.JWT_SECRET = "x".repeat(64);

const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module");
const path = require("path");
const SRC = `${SERVER_ROOT}/src`;

let stored = { _id: "u1", name: "Pooja", tokenVersion: 0 };

const UserStub = {
  findById: () => ({ select: () => Promise.resolve(stored) }),
  updateOne: async (filter, update) => {
    if (update.$inc?.tokenVersion) stored.tokenVersion += update.$inc.tokenVersion;
    return {};
  },
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  const dir = parent && parent.filename ? path.dirname(parent.filename) : "";
  const abs = request.startsWith(".") ? path.resolve(dir, request) : request;
  if (abs === path.join(SRC, "models/User")) return UserStub;
  if (abs === path.join(SRC, "config/mailer")) return { isMailConfigured: () => true, sendPasswordReset: async () => {} };
  return origLoad.apply(this, arguments);
};

const { signToken } = require(path.join(SRC, "config/security"));
const authMiddleware = require(path.join(SRC, "middleware/auth"));
const auth = require(path.join(SRC, "controllers/authController"));
Module._load = origLoad;

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const mkRes = () => {
  const res = { statusCode: 200, body: null, cleared: [] };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.clearCookie = (n, o) => { res.cleared.push({ n, o }); return res; };
  return res;
};

const tryToken = async (token) => {
  const res = mkRes();
  let passed = false;
  await authMiddleware({ cookies: { token } }, res, () => { passed = true; });
  return { passed, status: res.statusCode };
};

(async () => {
  console.log("\nsign out everywhere");

  const oldToken = signToken("u1", stored.tokenVersion);
  check("fresh token is accepted", (await tryToken(oldToken)).passed);

  const res = mkRes();
  await auth.logoutAll({ user: { _id: "u1" } }, res);
  check("logout-all -> 200", res.statusCode === 200, JSON.stringify(res.body));
  check("logout-all clears this device's cookie", res.cleared.some((c) => c.n === "token"));
  check("tokenVersion incremented 0 -> 1", stored.tokenVersion === 1, String(stored.tokenVersion));

  const after = await tryToken(oldToken);
  check("PREVIOUSLY VALID token now rejected", !after.passed && after.status === 401, JSON.stringify(after));

  const reissued = signToken("u1", stored.tokenVersion);
  check("a token issued after the bump works", (await tryToken(reissued)).passed);

  await auth.logoutAll({ user: { _id: "u1" } }, mkRes());
  check("second call bumps again 1 -> 2", stored.tokenVersion === 2);
  check("the re-issued token is now dead too", !(await tryToken(reissued)).passed);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
