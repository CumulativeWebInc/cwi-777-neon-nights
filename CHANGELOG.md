# 777 Neon Nights — CHANGELOG

## nn777-v5 (2026-09-20)
- Single large centered glossy-green SPIN button replaces the 7-button row: rounded-rect 3D button (~2x the old diameter), blue/purple illuminated rim, bold white label translated into all 41 supported languages (new `spin` i18n key), label follows the language picker live.
- No auto-spin, no hold-for-auto (Black: single spins only).
- Press animation, raycast tap target, `onSpinRequest` flow, mute/listening gates, pity cap, metrics — all unchanged.
- Cache version bumped; `skipWaiting`/`clients.claim` and the update toast unchanged.

## nn777-v4 (2026-09-20)
- Install UI: custom "Install" button (captures `beforeinstallprompt` on Android/desktop Chrome/Edge) plus an iOS guided walkthrough (Share → Add to Home Screen → open from home screen), all translated into the 41 supported languages from the player's selected language.
- Payout: TIDAL direct track URL verified via TIDAL's own search (`https://tidal.com/track/267845274` — "Neon Nights pt. 777", That Boy Hi Hat, 1-track single, 2022-12-23, 3:47, Explicit, label CUMULATIVE WEB INC.) — now the canonical Tidal option.
- Audio: explicit `touchstart` unlock in addition to `pointerdown`; interruption resume now retries play up to 5 times after returning from background; playback-state diagnostics on `window.__nnAudioState`.
- PWA: dedicated 180×180 Apple touch icon; manifest now lists normal + maskable icon coverage.
- Cache version bumped; `skipWaiting`/`clients.claim` and the update toast unchanged.

## nn777-v3 (2026-09-20)
- Three.js rebuild; hardened service worker (never caches non-ok responses, non-atomic install, version handshake, update toast); boot-retry panel; boot watchdog.
