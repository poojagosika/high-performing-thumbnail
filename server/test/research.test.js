process.env.JWT_SECRET = "x".repeat(64);
delete process.env.YOUTUBE_API_KEY;

const SERVER_ROOT = require("path").join(__dirname, "..");
const path = require("path");
const SRC = `${SERVER_ROOT}/src`;
const yt = require(path.join(SRC, "config/youtube"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const NOW = Date.parse("2026-09-05T00:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const vid = (o) => ({
  videoId: o.id, title: o.id, channelTitle: "c",
  publishedAt: o.published, viewCount: o.views,
  thumbnailUrl: "https://i.ytimg.com/vi/x/maxresdefault.jpg", duration: "PT1M",
  ...o,
});

console.log("\nquery normalisation (what makes the cache hit)");
const variants = [
  "Chicken Nuggets Eating Challenge",
  "chicken nuggets eating challenge",
  "  CHICKEN   nuggets  Eating   Challenge  ",
  "Chicken Nuggets Eating Challenge\t",
];
const normed = variants.map(yt.normalizeQuery);
check("all casings/spacings collapse to one key", new Set(normed).size === 1, JSON.stringify(normed));
check("normalised form is the lowercase single-spaced one", normed[0] === "chicken nuggets eating challenge", normed[0]);

console.log("\nsearch.list asks YouTube for its own popularity order");
const ytSrc = require("fs").readFileSync(`${SERVER_ROOT}/src/config/youtube.js`, "utf8");
check("order=viewCount is sent to the API", /order:\s*"viewCount"/.test(ytSrc));

console.log("\nsearch query built from title + tags");
check("title only", yt.buildQuery({ title: "Chicken Nuggets Eating Challenge" }) === "chicken nuggets eating challenge");
check("title + up to 3 tags", yt.buildQuery({ title: "Nuggets", tags: ["food", "challenge", "mukbang", "vlog", "extra"] }) === "nuggets food challenge mukbang");
check("empty title -> empty query", yt.buildQuery({ title: "  " }) === "");
check("capped at 120 chars", yt.buildQuery({ title: "a".repeat(300) }).length === 120);

console.log("\nviews per day");
check("1,000,000 views over 10 days = 100000/day", yt.viewsPerDay(1000000, daysAgo(10), NOW) === 100000, String(yt.viewsPerDay(1000000, daysAgo(10), NOW)));
check("a sub-day-old video is not divided by a fraction", yt.viewsPerDay(5000, daysAgo(0.25), NOW) === 5000, String(yt.viewsPerDay(5000, daysAgo(0.25), NOW)));

console.log("\nranking — the whole point");
const pool = [
  vid({ id: "old-giant",   views: 40_000_000, published: daysAgo(4000) }),
  vid({ id: "recent-fast", views: 2_400_000,  published: daysAgo(30) }),
  vid({ id: "mid",         views: 500_000,    published: daysAgo(100) }),
  vid({ id: "slow",        views: 90_000,     published: daysAgo(365) }),
  vid({ id: "steady",      views: 1_000_000,  published: daysAgo(200) }),
  vid({ id: "modest",      views: 60_000,     published: daysAgo(60) }),
];
const ranked = yt.rankCandidates(pool, NOW);
const order = ranked.map((r) => r.videoId);

check("returns at most 5", ranked.length === 5, String(ranked.length));
check("highest raw views first, matching YouTube's popularity sort", order[0] === "old-giant", JSON.stringify(order));
check("every candidate above the floor is ranked", order.length === 5, JSON.stringify(order));
check("every result carries viewsPerDay", ranked.every((r) => typeof r.viewsPerDay === "number" && r.viewsPerDay > 0));
check("sorted strictly descending by viewCount",
  ranked.every((r, i) => i === 0 || ranked[i - 1].viewCount >= r.viewCount),
  JSON.stringify(ranked.map((r) => r.viewCount)));
check("viewsPerDay still reported as secondary info",
  ranked.every((r) => typeof r.viewsPerDay === "number"));

console.log("\nfilters");
const noisy = [
  vid({ id: "too-few-views", views: 999, published: daysAgo(50) }),
  vid({ id: "just-enough",   views: 1000, published: daysAgo(50) }),
  vid({ id: "too-new",       views: 900_000, published: daysAgo(1) }),
  vid({ id: "old-enough",    views: 900_000, published: daysAgo(3) }),
  { ...vid({ id: "no-thumb", views: 900_000, published: daysAgo(50) }), thumbnailUrl: null },
];
const ids = yt.rankCandidates(noisy, NOW).map((r) => r.videoId);
check("drops <1000 views", !ids.includes("too-few-views"), JSON.stringify(ids));
check("keeps exactly 1000 views", ids.includes("just-enough"), JSON.stringify(ids));
check("drops <48h old (velocity is meaningless)", !ids.includes("too-new"), JSON.stringify(ids));
check("keeps 3-day-old", ids.includes("old-enough"), JSON.stringify(ids));
check("drops candidates with no thumbnail", !ids.includes("no-thumb"), JSON.stringify(ids));

console.log("\ndeterminism (the opposite of Math.random)");
const a = JSON.stringify(yt.rankCandidates(pool, NOW));
const b = JSON.stringify(yt.rankCandidates(pool, NOW));
const c = JSON.stringify(yt.rankCandidates([...pool].reverse(), NOW));
check("same input, same output", a === b);
check("input order does not change the ranking", a === c);

console.log("\nmapping the YouTube videos.list shape");
const mapped = yt.mapVideos([{
  id: "abc123",
  snippet: {
    title: "Real Title", channelTitle: "Real Channel",
    publishedAt: "2026-08-01T00:00:00Z",
    thumbnails: {
      default: { url: "d.jpg" }, medium: { url: "m.jpg" },
      high: { url: "h.jpg" }, maxres: { url: "max.jpg" },
    },
  },
  statistics: { viewCount: "123456" },
  contentDetails: { duration: "PT10M13S" },
}]);
check("prefers maxres thumbnail", mapped[0].thumbnailUrl === "max.jpg", mapped[0].thumbnailUrl);
check("viewCount coerced to number", mapped[0].viewCount === 123456 && typeof mapped[0].viewCount === "number");
check("carries title/channel/duration", mapped[0].title === "Real Title" && mapped[0].channelTitle === "Real Channel" && mapped[0].duration === "PT10M13S");

const fallback = yt.mapVideos([{ id: "z", snippet: { thumbnails: { medium: { url: "m.jpg" } } }, statistics: {} }]);
check("falls back down the thumbnail ladder", fallback[0].thumbnailUrl === "m.jpg", fallback[0].thumbnailUrl);
check("missing statistics -> 0 views, not NaN", fallback[0].viewCount === 0);

const noThumbs = yt.mapVideos([{ id: "z", snippet: {}, statistics: {} }]);
check("no thumbnails at all -> null (then filtered)", noThumbs[0].thumbnailUrl === null);

console.log("\nfixture mode (dev, no key)");
check("isConfigured false without a key", yt.isConfigured() === false);
(async () => {
  const out = await yt.searchTopic("chicken nuggets eating challenge", NOW);
  check("flagged as fixture, never as youtube", out.source === "fixture", out.source);
  check("returns 5", out.results.length === 5, String(out.results.length));
  check("fixtures are ranked by the same rule",
    out.results.every((r, i) => i === 0 || out.results[i - 1].viewCount >= r.viewCount));

  const again = await yt.searchTopic("chicken nuggets eating challenge", NOW);
  check("fixtures are deterministic for a query", JSON.stringify(out) === JSON.stringify(again));

  const other = await yt.searchTopic("minecraft speedrun", NOW);
  check("a different topic gives different fixtures", JSON.stringify(other) !== JSON.stringify(out));
  check("fixture thumbnails are marked, not fake YouTube URLs",
    out.results.every((r) => r.thumbnailUrl === "fixture://placeholder"));

  console.log("\nfixture mode is refused in production");
  const fresh = { ...process.env, NODE_ENV: "production" };
  const { execFileSync } = require("child_process");
  const script = `
    process.env.JWT_SECRET = "x".repeat(64);
    delete process.env.YOUTUBE_API_KEY;
    const yt = require("${SRC}/config/youtube");
    yt.searchTopic("anything").then(
      () => console.log("NO_THROW"),
      (e) => console.log(e.status + "|" + e.message),
    );`;
  const out2 = execFileSync(process.execPath, ["-e", script], { env: fresh }).toString().trim();
  check("production + no key -> 503, never a silent fixture", out2.startsWith("503|"), out2);
  check("503 message does not leak config detail", !/api[_ ]?key/i.test(out2), out2);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
