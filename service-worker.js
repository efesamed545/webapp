/* Flow — static shell only; no Supabase or other API caching */
const CACHE_NAME = "app-cache-v1";

function precacheList() {
  const o = self.location.origin;
  return [o + "/", o + "/index.html", o + "/style.css", o + "/script.js", o + "/manifest.json"];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(precacheList()))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error("[sw] precache failed:", err);
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SHELL_PATHS = new Set(["/index.html", "/style.css", "/script.js", "/manifest.json"]);

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isNavigate = event.request.mode === "navigate" || (event.request.destination || "") === "document";
  const isRootPath = path === "/" || path === "";

  if (!isNavigate && !isRootPath && !SHELL_PATHS.has(path)) return;

  const indexUrl = self.location.origin + "/index.html";

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      if (isNavigate || isRootPath) {
        return cache.match(indexUrl).then((hit) => {
          if (hit) return hit;
          return fetch(event.request).catch(() => cache.match(indexUrl));
        });
      }
      return cache.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        });
      });
    })
  );
});
