const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfToken = null;
let csrfRequest = null;

async function getCsrfToken(force = false) {
  if (csrfToken && !force) return csrfToken;

  if (!csrfRequest || force) {
    csrfRequest = fetch(`${API_URL}/auth/csrf`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { csrfToken: null }))
      .then((data) => {
        csrfToken = data.csrfToken;
        return csrfToken;
      })
      .catch(() => null)
      .finally(() => {
        csrfRequest = null;
      });
  }

  return csrfRequest;
}

async function send(endpoint, { method, headers, body }) {
  const finalHeaders = { ...headers };

  if (!SAFE_METHODS.has(method)) {
    const token = await getCsrfToken();
    if (token) finalHeaders["X-CSRF-Token"] = token;
  }

  return fetch(`${API_URL}${endpoint}`, {
    method,
    headers: finalHeaders,
    credentials: "include",
    body,
  });
}

async function request(endpoint, { method = "GET", headers = {}, body } = {}) {
  let res = await send(endpoint, { method, headers, body });

  if (res.status === 403 && !SAFE_METHODS.has(method)) {
    const clone = res.clone();
    const maybe = await clone.json().catch(() => null);
    if (maybe?.code === "CSRF_INVALID") {
      await getCsrfToken(true);
      res = await send(endpoint, { method, headers, body });
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
}

export async function requestRaw(endpoint, { method = "POST", headers = {}, body } = {}) {
  let res = await send(endpoint, { method, headers, body });

  if (res.status === 403 && !SAFE_METHODS.has(method)) {
    const maybe = await res.clone().json().catch(() => null);
    if (maybe?.code === "CSRF_INVALID") {
      await getCsrfToken(true);
      res = await send(endpoint, { method, headers, body });
    }
  }

  return res;
}

async function api(endpoint, { method = "GET", body } = {}) {
  return request(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function uploadFile(endpoint, formData) {
  return request(endpoint, { method: "POST", body: formData });
}

export default api;
