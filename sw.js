/* 777 Neon Nights — service worker. Precaches all game assets; cache-first for
   assets, network-first for navigation with cache fallback (offline play). */
const CACHE = "nn777-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css",
  "./config.js",
  "./logic.js",
  "./i18n.js",
  "./metrics.js",
  "./scores.js",
  "./game.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./audio/neon-nights-777-128k.mp3",
  "./audio/neon-nights-777.mp3",
  "./art/wallpaper-777.png",
  "./art/marquee-777.png",
  "./art/cabinet-777.png",
  "./art/badge-777.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // streaming links etc. pass through
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", cp)); return r; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      const cp = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, cp));
      return r;
    }))
  );
});
