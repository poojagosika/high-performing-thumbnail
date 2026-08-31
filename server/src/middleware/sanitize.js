const isUnsafeKey = (key) => key.startsWith("$") || key.includes(".");

function stripOperators(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((entry) => stripOperators(entry, depth + 1));
  }

  const clean = {};
  for (const key of Object.keys(value)) {
    if (isUnsafeKey(key)) continue;
    clean[key] = stripOperators(value[key], depth + 1);
  }
  return clean;
}

function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = stripOperators(req.body);
  }

  if (req.params && typeof req.params === "object") {
    req.params = stripOperators(req.params);
  }

  if (req.query && typeof req.query === "object") {
    const cleaned = stripOperators(req.query);
    for (const key of Object.keys(req.query)) {
      if (!(key in cleaned)) delete req.query[key];
    }
    Object.assign(req.query, cleaned);
  }

  next();
}

module.exports = { sanitizeRequest, stripOperators };
