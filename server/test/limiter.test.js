process.env.JWT_SECRET = "x".repeat(64);

const SERVER_ROOT = require("path").join(__dirname, "..");
const express = require("express");
const { deleteAccountLimiter } = require(`${SERVER_ROOT}/src/middleware/rateLimit`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const app = express();
app.set("trust proxy", 1);
app.use((req, res, next) => {
  req.user = { _id: req.get("x-test-user") };
  next();
});
app.delete("/account", deleteAccountLimiter, (req, res) => res.json({ ok: true }));

const server = app.listen(0, async () => {
  const port = server.address().port;
  const call = (user, ip) =>
    fetch(`http://127.0.0.1:${port}/account`, {
      method: "DELETE",
      headers: { "x-test-user": user, "x-forwarded-for": ip },
    }).then((r) => r.status);

  console.log("\ndeleteAccountLimiter");

  const alice = [];
  for (let i = 0; i < 6; i++) alice.push(await call("alice", "1.1.1.1"));
  check("first 5 allowed", alice.slice(0, 5).every((s) => s === 200), JSON.stringify(alice));
  check("6th is 429", alice[5] === 429, JSON.stringify(alice));

  const aliceOtherIp = await call("alice", "9.9.9.9");
  check("same user from a new IP is still limited", aliceOtherIp === 429, String(aliceOtherIp));

  const bobSameIp = await call("bob", "1.1.1.1");
  check("different user on the same IP is unaffected", bobSameIp === 200, String(bobSameIp));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
