const { isProduction } = require("./security");
const fixtures = require("./youtubeFixtures");

const SEARCH_URL = "https://youtube.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://youtube.googleapis.com/youtube/v3/videos";
const TIMEOUT_MS = 8000;
const CANDIDATE_COUNT = 25;
const RESULT_COUNT = 5;
const MIN_VIEWS = 1000;
const MIN_AGE_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

class YoutubeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isConfigured = () => Boolean(process.env.YOUTUBE_API_KEY);

const normalizeQuery = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildQuery = ({ title, tags = [] }) =>
  normalizeQuery([title, ...tags.slice(0, 3)].filter(Boolean).join(" ")).slice(0, 120);

const pickThumbnail = (thumbnails = {}) =>
  (thumbnails.maxres || thumbnails.standard || thumbnails.high || thumbnails.medium || thumbnails.default || {}).url || null;

const viewsPerDay = (viewCount, publishedAt, now) => {
  const ageMs = now - new Date(publishedAt).getTime();
  const days = Math.max(ageMs, DAY_MS) / DAY_MS;
  return Math.round(viewCount / days);
};

function rankCandidates(videos, now = Date.now()) {
  return videos
    .filter((v) => v.thumbnailUrl)
    .filter((v) => v.viewCount >= MIN_VIEWS)
    .filter((v) => now - new Date(v.publishedAt).getTime() >= MIN_AGE_MS)
    .map((v) => ({ ...v, viewsPerDay: viewsPerDay(v.viewCount, v.publishedAt, now) }))
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, RESULT_COUNT);
}

async function callApi(url, params) {
  const query = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });

  let response;
  try {
    response = await fetch(`${url}?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new YoutubeError(503, "Could not reach YouTube. Try again shortly.");
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason;

    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new YoutubeError(429, "Daily YouTube search limit reached. Try again tomorrow.");
    }
    if (reason === "keyInvalid" || reason === "badRequest" || response.status === 400) {
      throw new YoutubeError(503, "YouTube search is misconfigured.");
    }
    throw new YoutubeError(503, "YouTube search is unavailable. Try again shortly.");
  }

  return body;
}

function mapVideos(items = []) {
  return items.map((item) => ({
    videoId: item.id,
    title: item.snippet?.title || "",
    channelTitle: item.snippet?.channelTitle || "",
    publishedAt: item.snippet?.publishedAt || null,
    viewCount: Number(item.statistics?.viewCount || 0),
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    duration: item.contentDetails?.duration || "",
  }));
}

async function searchTopic(query, now = Date.now()) {
  if (!isConfigured()) {
    if (isProduction) {
      throw new YoutubeError(503, "Thumbnail research is not configured.");
    }
    return { source: "fixture", results: rankCandidates(fixtures.candidatesFor(query, now), now) };
  }

  const search = await callApi(SEARCH_URL, {
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(CANDIDATE_COUNT),
    order: "viewCount",
    safeSearch: "moderate",
  });

  const ids = (search.items || [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);

  if (ids.length === 0) {
    return { source: "youtube", results: [] };
  }

  const details = await callApi(VIDEOS_URL, {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
    maxResults: String(CANDIDATE_COUNT),
  });

  return { source: "youtube", results: rankCandidates(mapVideos(details.items), now) };
}

module.exports = {
  YoutubeError,
  isConfigured,
  normalizeQuery,
  buildQuery,
  rankCandidates,
  viewsPerDay,
  mapVideos,
  searchTopic,
  RESULT_COUNT,
  MIN_VIEWS,
  MIN_AGE_MS,
};
