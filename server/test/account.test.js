process.env.JWT_SECRET = "x".repeat(64);
process.env.BCRYPT_ROUNDS = "4";

const SERVER_ROOT = require("path").join(__dirname, "..");
const Module = require("module");
const path = require("path");
const bcrypt = require("bcryptjs");

const SRC = `${SERVER_ROOT}/src`;

let state, removed, queryOptions, deleteOrder;

const mkModel = (name) => ({
  deleteMany: async (filter) => {
    deleteOrder.push(`${name}.deleteMany:${String(filter.user)}`);
    state[name] = [];
    return { deletedCount: 1 };
  },
});

const ThumbnailStub = {
  ...mkModel("Thumbnail"),
  find(filter) {
    const q = {
      _opts: {},
      setOptions(o) { Object.assign(this._opts, o); return this; },
      select() { return this; },
      lean() {
        queryOptions = { filter, opts: { ...this._opts } };
        const all = state.Thumbnail;
        return Promise.resolve(this._opts.withDeleted ? all : all.filter((t) => !t.deletedAt));
      },
    };
    return q;
  },
};

const CollectionStub = mkModel("Collection");
const ComparisonStub = mkModel("Comparison");
const ActivityStub = mkModel("Activity");

const UserStub = {
  findById: (id) => ({
    select: () => Promise.resolve(state.user && String(state.user._id) === String(id) ? state.user : null),
  }),
  deleteOne: async (filter) => {
    deleteOrder.push(`User.deleteOne:${String(filter._id)}`);
    state.user = null;
    return { deletedCount: 1 };
  },
  findOne: () => Promise.resolve(null),
  updateOne: async () => ({}),
  findOneAndUpdate: async () => null,
};

const uploadStub = {
  removeUpload: (u) => {
    if (uploadStub.fail) throw new Error("unlink exploded");
    removed.push(u);
  },
  fail: false,
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  const dir = parent && parent.filename ? path.dirname(parent.filename) : "";
  const abs = request.startsWith(".") ? path.resolve(dir, request) : request;
  const map = {
    [path.join(SRC, "models/User")]: UserStub,
    [path.join(SRC, "models/Thumbnail")]: ThumbnailStub,
    [path.join(SRC, "models/Collection")]: CollectionStub,
    [path.join(SRC, "models/Comparison")]: ComparisonStub,
    [path.join(SRC, "models/Activity")]: ActivityStub,
    [path.join(SRC, "config/upload")]: uploadStub,
    [path.join(SRC, "config/mailer")]: { isMailConfigured: () => true, sendPasswordReset: async () => {} },
  };
  if (map[abs]) return map[abs];
  return origLoad.apply(this, arguments);
};

const auth = require(path.join(SRC, "controllers/authController"));
const { deleteAccountSchema } = require(path.join(SRC, "schemas"));
Module._load = origLoad;

const mkRes = () => {
  const res = { statusCode: 200, body: null, cleared: [] };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.clearCookie = (n, o) => { res.cleared.push({ n, o }); return res; };
  return res;
};

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const seed = async () => {
  removed = [];
  queryOptions = null;
  deleteOrder = [];
  uploadStub.fail = false;
  state = {
    user: {
      _id: "u1",
      name: "Pooja",
      email: "pooja@example.com",
      avatar: "/uploads/avatar.png",
      password: await bcrypt.hash("correcthorse", 4),
    },
    Thumbnail: [
      { _id: "t1", imageUrl: "/uploads/live.jpg", versions: [{ imageUrl: "/uploads/live-v1.jpg" }, { imageUrl: "/uploads/live-v2.jpg" }], deletedAt: null },
      { _id: "t2", imageUrl: "/uploads/trashed.jpg", versions: [{ imageUrl: "/uploads/trashed-v1.jpg" }], deletedAt: new Date() },
      { _id: "t3", imageUrl: "/uploads/plain.webp", versions: [], deletedAt: null },
    ],
    Collection: [{ _id: "c1" }],
    Comparison: [{ _id: "x1" }],
    Activity: [{ _id: "a1" }],
  };
};

const req = (password) => ({ user: { _id: "u1" }, body: { password } });

(async () => {
  console.log("\ndelete account — auth");
  await seed();
  let res = mkRes();
  await auth.deleteAccount(req("wrongpassword"), res);
  check("wrong password -> 401", res.statusCode === 401, JSON.stringify(res.body));
  check("wrong password deletes nothing", deleteOrder.length === 0 && removed.length === 0 && state.user !== null);
  check("no cookie cleared on failure", res.cleared.length === 0);

  console.log("\ndelete account — success path");
  await seed();
  res = mkRes();
  await auth.deleteAccount(req("correcthorse"), res);
  check("correct password -> 200", res.statusCode === 200, JSON.stringify(res.body));
  check("auth cookie cleared", res.cleared.length === 1 && res.cleared[0].n === "token");
  check("clear uses httpOnly cookie options", res.cleared[0].o?.httpOnly === true && "sameSite" in res.cleared[0].o);

  console.log("\ndelete account — the soft-delete trap");
  check("read opts in with withDeleted", queryOptions?.opts?.withDeleted === true, JSON.stringify(queryOptions?.opts));
  check("read scoped to this user", String(queryOptions?.filter?.user) === "u1", JSON.stringify(queryOptions?.filter));
  check("TRASHED thumbnail image removed", removed.includes("/uploads/trashed.jpg"), JSON.stringify(removed));
  check("TRASHED thumbnail version removed", removed.includes("/uploads/trashed-v1.jpg"));

  console.log("\ndelete account — files");
  check("live image removed", removed.includes("/uploads/live.jpg"));
  check("both live versions removed", removed.includes("/uploads/live-v1.jpg") && removed.includes("/uploads/live-v2.jpg"));
  check("versionless thumbnail removed", removed.includes("/uploads/plain.webp"));
  check("avatar removed", removed.includes("/uploads/avatar.png"));
  check("nothing else removed", removed.length === 7, `${removed.length}: ${JSON.stringify(removed)}`);

  console.log("\ndelete account — collections");
  for (const m of ["Thumbnail", "Collection", "Comparison", "Activity"]) {
    check(`${m} purged for this user`, deleteOrder.includes(`${m}.deleteMany:u1`), JSON.stringify(deleteOrder));
  }
  check("user deleted", deleteOrder.includes("User.deleteOne:u1"));
  check("user deleted LAST", deleteOrder[deleteOrder.length - 1] === "User.deleteOne:u1", JSON.stringify(deleteOrder));

  console.log("\ndelete account — resilience");
  await seed();
  uploadStub.fail = true;
  res = mkRes();
  await auth.deleteAccount(req("correcthorse"), res);
  check("unlink failure still 200", res.statusCode === 200, JSON.stringify(res.body));
  check("unlink failure still deletes the account", deleteOrder.includes("User.deleteOne:u1"));

  await seed();
  state.user = null;
  res = mkRes();
  await auth.deleteAccount(req("correcthorse"), res);
  check("missing user -> 401 not 500", res.statusCode === 401, JSON.stringify(res.body));

  console.log("\nschema");
  check("rejects missing password", !deleteAccountSchema.safeParse({}).success);
  check("rejects empty password", !deleteAccountSchema.safeParse({ password: "" }).success);
  check("rejects operator object", !deleteAccountSchema.safeParse({ password: { $ne: null } }).success);
  check("accepts a short existing password", deleteAccountSchema.safeParse({ password: "old" }).success);
  check("strips unknown keys", !("confirm" in (deleteAccountSchema.safeParse({ password: "a", confirm: "DELETE" }).data || {})));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
