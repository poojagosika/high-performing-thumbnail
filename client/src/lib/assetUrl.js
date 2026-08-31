const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const ORIGIN = API_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

export function assetUrl(path) {
  if (!path || typeof path !== "string") return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export default assetUrl;
