import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);

    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    const script = existing || document.createElement("script");

    script.addEventListener("load", () => resolve(window.turnstile));
    script.addEventListener("error", reject);

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

function Turnstile({ onToken, resetSignal = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;

    let cancelled = false;

    loadScript()
      .then((turnstile) => {
        if (cancelled || !turnstile || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => onToken(""));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onToken]);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    onToken("");
  }, [resetSignal, onToken]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}

export default Turnstile;
