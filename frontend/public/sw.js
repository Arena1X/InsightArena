const CACHE_VERSION = "v1";
const SHELL_CACHE = `insightarena-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `insightarena-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const APP_SHELL = ["/", OFFLINE_URL, "/manifest.webmanifest"];

const STATIC_ASSET_PATTERN =
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") {
    return response;
  }
  const copy = response.clone();
  caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so users get fresh HTML, falling back to a
  // cached copy of that route, and finally the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cachePut(request, response))
        .catch(
          async () =>
            (await caches.match(request)) || (await caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Immutable build assets and static files: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname.startsWith("/assets/") ||
    STATIC_ASSET_PATTERN.test(url.pathname)
  ) {
    event.respondWith(
      caches
        .match(request)
        .then((cached) => cached || fetch(request).then((response) => cachePut(request, response))),
    );
    return;
  }

  // Everything else (data requests, RSC payloads): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => cachePut(request, response))
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
