/* Flow service worker: reliable updates, no Supabase/API caching */
const CACHE_NAME = "flow-cache-v3";
const NETWORK_FIRST_PATHS = new Set(["/", "/index.html", "/script.js", "/style.css", "/manifest.json"]);
const PRECACHE_PATHS = ["/", "/index.html", "/script.js", "/style.css", "/manifest.json"];

function isSupabaseRequest(url) {
  return url.hostname.endsWith(".supabase.co");
}

/** Same-origin only; Supabase + externe Origins nicht abfangen → nie durch SW cachen. */
function shouldBypassServiceWorker(url) {
  if (isSupabaseRequest(url)) return true;
  if (url.origin !== self.location.origin) return true;
  return false;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const origin = self.location.origin;
      await cache.addAll(PRECACHE_PATHS.map((p) => origin + p));
      await self.skipWaiting();
    })().catch((err) => {
      console.error("[sw] install failed:", err);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (shouldBypassServiceWorker(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  const path = url.pathname === "" ? "/" : url.pathname;
  const isNavigate = event.request.mode === "navigate" || event.request.destination === "document";
  if (isNavigate || NETWORK_FIRST_PATHS.has(path)) {
    const req = isNavigate ? new Request(self.location.origin + "/index.html", { method: "GET" }) : event.request;
    event.respondWith(networkFirst(req));
  }
});
