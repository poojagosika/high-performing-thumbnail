// Ranks title-prefix matches above mid-string ones, and title above tag matches,
// so typing "th" surfaces "Thumbnail tips" before "Best thumbnails".
const rank = (thumb, query) => {
  const title = thumb.title.toLowerCase();
  if (title.startsWith(query)) return 0;
  if (title.includes(query)) return 1;
  if (thumb.tags?.some((tag) => tag.toLowerCase().startsWith(query))) return 2;
  if (thumb.tags?.some((tag) => tag.toLowerCase().includes(query))) return 3;
  return -1;
};

export function matchThumbnails(thumbnails, query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return thumbnails.slice(0, limit);
  return thumbnails
    .map((t) => ({ thumb: t, score: rank(t, q) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((m) => m.thumb);
}
