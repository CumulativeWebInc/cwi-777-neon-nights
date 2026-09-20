/* 777 Neon Nights — service worker nn777-v4.
   Hardened after the 2026-09-20 iPhone post-mortem:
   1. NEVER caches non-ok responses (the old handler cached 404s, so a phone
      could sit on a broken cabinet.js forever).
   2. NON-ATOMIC install: each asset is added individually inside try/catch —
      one 404 no longer fails the whole install and leaves a stale SW in control.
   3. Version handshake: SKIP_WAITING message support so the page's "Update
      available — tap to reload" toast can activate a waiting worker immediately.
   Cache-first for same-origin assets, network-first for navigations. */
const CACHE = "nn777-v6";
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
  "./cabinet-anim.js",
  "./cabinet3d.js",
  "./game.js",
  "./vendor/three/build/three.module.min.js",
  "./vendor/three/addons/postprocessing/EffectComposer.js",
  "./vendor/three/addons/postprocessing/RenderPass.js",
  "./vendor/three/addons/postprocessing/UnrealBloomPass.js",
  "./vendor/three/addons/postprocessing/ShaderPass.js",
  "./vendor/three/addons/postprocessing/OutputPass.js",
  "./vendor/three/addons/postprocessing/Pass.js",
  "./vendor/three/addons/postprocessing/MaskPass.js",
  "./vendor/three/addons/shaders/CopyShader.js",
  "./vendor/three/addons/shaders/LuminosityHighPassShader.js",
  "./vendor/three/addons/shaders/OutputShader.js",
  "./vendor/three/addons/environments/RoomEnvironment.js",
  "./icons/icon-180.png",
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
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Non-atomic: a single failing asset must not kill the whole install.
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r && r.ok) await c.put(url, r);
        // non-ok responses are deliberately NOT cached (post-mortem fix)
      } catch (err) { /* offline at install time: skip, keep going */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page -> SW handshake: the "Update available" toast posts this.
self.addEventListener("message", (e) => {
  if (e && e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // streaming links etc. pass through
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r && r.ok) {
            const cp = r.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", cp)).catch(() => {});
          }
          return r;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      // Never cache error responses (post-mortem fix: no 404s in the cache).
      if (r && r.ok) {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(e.request)))
  );
});
