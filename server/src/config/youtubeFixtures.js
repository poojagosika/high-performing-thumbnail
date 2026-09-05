const SHAPES = [
  { suffix: "— I Tried It For 24 Hours", channel: "Sample Creator One", views: 2_400_000, ageDays: 41 },
  { suffix: "Gone Wrong", channel: "Sample Creator Two", views: 880_000, ageDays: 12 },
  { suffix: "(Full Challenge)", channel: "Sample Creator Three", views: 5_100_000, ageDays: 260 },
  { suffix: "vs My Brother", channel: "Sample Creator Four", views: 340_000, ageDays: 6 },
  { suffix: "— The Honest Review", channel: "Sample Creator Five", views: 1_250_000, ageDays: 95 },
  { suffix: "in 60 Seconds", channel: "Sample Creator Six", views: 47_000_000, ageDays: 3400 },
  { suffix: "That Broke The Internet", channel: "Sample Creator Seven", views: 610_000, ageDays: 21 },
];

const hash = (value) => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
};

const titleCase = (value) =>
  value.replace(/\b\w/g, (c) => c.toUpperCase());

function candidatesFor(query, now = Date.now()) {
  const seed = hash(query || "topic");
  const label = titleCase(query || "topic");

  return SHAPES.map((shape, i) => {
    const spread = ((seed >>> (i * 3)) % 7) + 1;
    return {
      videoId: `fixture${String(seed % 100000).padStart(5, "0")}${i}`,
      title: `${label} ${shape.suffix}`,
      channelTitle: shape.channel,
      publishedAt: new Date(now - shape.ageDays * 24 * 60 * 60 * 1000).toISOString(),
      viewCount: shape.views * spread,
      thumbnailUrl: "fixture://placeholder",
      duration: "PT10M13S",
    };
  });
}

module.exports = { candidatesFor };
