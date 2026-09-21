# 777 Neon Nights — Production Log

**Product:** 777 Neon Nights — free promo slot game for "Neon Nights Pt. 777" by That Boy Hi Hat (Cumulative Web Inc).
**Shipped:** 2026-09-20. **Version:** 1.0.0. **Build cost:** $0.

## v8.3 — real player telemetry (2026-09-21, Black's order)

Black posted the game on X and asked: do we have real player data? Answer was
no — metrics.js was localStorage-only. Shipped the same morning:

- **Game beacon** (`game/telemetry.js`): every `metric()` call mirrors into a
  batched anonymous delta (random device id, per-event counts, credit sums,
  issued-link URL on every prize claim / like tap / follow tap). Flush 60s +
  pagehide/hidden + immediate on jackpot_win and prize_claim. sendBeacon →
  fetch(keepalive) fallback. Silent failure; gameplay never blocks.
- **Sink**: `https://ntfy.envs.net/nn777-tele-cwi-YdFlqrKbnqYD` (community ntfy
  server, $0, no account; verified POST→poll roundtrip from the VM on
  2026-09-21; ntfy.sh itself is proxy-blocked from the VM). Anonymous
  aggregates only — no PII. 12h message retention → 2h collector cadence.
- **Collector** (`telemetry/collect.js`, zero deps): polls sink, appends
  `telemetry/raw/YYYY-MM-DD.jsonl`, regenerates `telemetry/summary.json`
  (unique devices, spins, wins by type, prizes claimed by type, links issued
  url→count, credits earned/spent, song plays/replays, engagement, per-day),
  idempotent via watermark, pushes changes to the live site. End-to-end
  verified 2026-09-21 with 3 test beacons (3 devices, 21 spins, 6 prize claims,
  url→count exact) — test state reset afterwards, zero invented data retained.
- **Owner dashboard**: https://cumulativewebinc.github.io/cwi-777-neon-nights/telemetry/dashboard.html
  (Black's iPhone; reads pushed summary.json; export-JSON button; honest empty
  state until the first real player beacons).
- **Cron** `nn777-telemetry-collect` (every 2h, goal:cwi-agent-company).

Unit tests: 7810 passed, 0 failed (incl. new telemetry.test.js 38/38).

## What shipped

- **Live game (PWA):** https://cumulativewebinc.github.io/cwi-777-neon-nights/
- **Repo:** https://github.com/CumulativeWebInc/cwi-777-neon-nights (public, `main`, 21 files)
- **Promo video:** `~/workspace/your_files/777-neon-nights-promo.mp4` (30s, 540×960, H.264+AAC, real track audio, game URL on end card)
- Installable on iOS (Add to Home Screen), Android, desktop via PWA manifest + service worker.
- 3 stages / 9 rounds, listening-time-gated prizes (3/7/15 min), Encore bonus round (24h cooldown, always awards a free catalog link), 200-spin jackpot pity cap, jackpot pays streaming-link choice.
- 41-language how-to-play with browser-locale detection + English fallback.
- Local top-10 high scores with portable tamper-evident score codes.
- Anonymous local-only metrics + per-link issuance ledger with JSON export.

## QA results (nn777-v8 — jackpot showmanship + Neon Credits, 2026-09-20)

| Suite | Result |
|---|---|
| CDP regression `qa/jackpot-show.js` (3D + DOM fallback) | **44/44 pass** |
| CDP regression `qa/winfix.js` (v6 iPhone defects) | **21/21 pass** |
| Node unit tests (`game-logic.test.js`) | **56/56 pass** |
| Node unit tests (`install-i18n.test.js`) | **3768/3768 pass** |
| Node unit tests (`payout-metrics.test.js`) | **37/37 pass** |
| Node unit tests (`cabinet-anim.test.js`) | **33/33 pass** |
| Console/page errors | **0** |

**v8 highlights:** prize name + credit score render ON THE MACHINE (3D marquee
face / DOM LED readout); jackpot lights the background (3D gold-magenta wash +
bloom kick, DOM CSS light sweep); Neon Credits economy (jackpot +1000, triple
+50, listening unlock +25 once-ever, 1000-credit link redemption from 10
allowlisted platforms); credits persist across reload; listening-prize award
pays once ever (no reload farming).

## QA results (v6 baseline)

| Suite | Result |
|---|---|
| Node unit tests (`game-logic.test.js`) | **43/43 pass** |
| Node unit tests (`payout-metrics.test.js`) | **33/33 pass** |
| Headless browser sweep (22 checks) | **22/22 pass** (17 first-pass; 5 initial failures proven to be harness artifacts via focused re-tests — tampered-code UI toast, metrics-download timing, non-DOM Audio query, mute-button targeting, headless media-preload aborts) |
| 150-spin browser session (real `NN_LOGIC` path) | **PASS** — 150 spins, 2 natural jackpots, 4 triples, spin balance never negative, pity counter never exceeded 200, 0 errors |
| Console/page errors on live build | **0** |
| Live deploy verification | HTTP 200; all 20 deployed files byte-identical to the QA'd local build |

## Prize-link verification (all byte-match `config.js`, all resolve)

| Service | URL | HTTP |
|---|---|---|
| Spotify — Neon Nights Pt. 777 | https://open.spotify.com/track/4XP56LZjeS0TJUd30kpGSK | 200 |
| Apple Music — Neon Nights Pt. 777 | https://music.apple.com/us/album/neon-nights-pt-777/1660915130?i=1660915131 | 200 |
| Amazon Music — Neon Nights Pt. 777 | https://music.amazon.com/albums/B0BQRC5NY5?marketplaceId=ATVPDKIKX0DER&musicTerritory=US | 200 |
| Deezer — Neon Nights Pt. 777 | https://www.deezer.com/album/388911647 | 301 → resolves to regional album URL |
| All platforms (HyperFollow) | https://distrokid.com/hyperfollow/thatboyhihat/neon-nights-pt-777 | 200 |
| Spotify — Zooted Zone (bonus) | https://open.spotify.com/track/0emH8ktA8x4DkOFLsG5xkW | 200 |
| Spotify — Diabolique (bonus) | https://open.spotify.com/track/2eSyWmIdPzEMyWejLb2LBj | 200 |

Every issued link is recorded in the issuance ledger with service, URL, timestamp, and context (verified in headless test).

## Known caveats

- **Pandora omitted:** no verified direct Pandora track URL found — not invented, not shipped. Jackpot service choices are Spotify / Apple Music / Amazon Music / Deezer / All-platforms.
- **Translations:** 41 languages render 5 bullets each (verified). Amharic, Hausa, Yoruba machine-translated — native review recommended before marketing to those locales.
- **Metrics:** anonymous session-id only, local-only. No remote endpoint configured — remote metrics require Black's approval of a $0 endpoint.
- **PWA, not native store:** iOS = Add to Home Screen, Android/desktop = install prompt. App Store / Play Store listing would require paid developer accounts — out of the $0 lane.

## No-gambling statement

Free promotional game. No wagering, no cash payouts, no purchases. Jackpot and bonus rewards are free streaming-service/catalog links only. Listening-time gates exist so players hear the music before unlocking prizes.

## 30-day kill/rework metrics (review 2026-10-20)

| Metric | Source | Kill / rework threshold |
|---|---|---|
| Plays (game_start events) | local metrics export | < 100 plays → rework promo distribution (video, posts); < 25 → kill the lane |
| Jackpots hit | metrics | 0 jackpots across all sessions → inspect RNG/pity (bug); expected ≥1 per ~200-spin session |
| Link issuances | issuance ledger | 0 issuances with ≥50 jackpots → payout UX is broken, fix |
| Stream click-through | player taps payout link (metric event) | < 20% of issuances → rework payout screen copy/design |

**Intervention checkpoints (50% / 75% of the 30-day window):** 2026-10-05 and 2026-10-13 — diagnose gap vs. thresholds, change the promo actions, re-execute. Loops close by results, not by expiry.

## Test/lesson notes

- Empty GitHub repos 409 on the git-blob API ("Git Repository is empty") — seed the first commit via the Contents API, then use git-data for the rest.
- Commit POSTs need explicit `parents` or the ref PATCH fails (non-fast-forward 422).
- Git Data API ref paths are asymmetric: GET singular `/git/ref/heads/main`, PATCH plural `/git/refs/heads/main`.
- Headless Chromium aborts speculative media preloads (`ERR_ABORTED`) even on a bare `<audio>` tag — benign; full file still loads and `play()` works. Do not count as a defect without proof playback fails.

## Visual redo (2026-09-20)

Full visual rebuild of the cabinet on a zero-dependency canvas renderer (`game/cabinet.js`), matched to the reference frames. Same repo, same URL — no new repo.

**What changed visually**
- Warm near-black casino background with warm bokeh glow; chrome/glass cabinet body.
- Rounded layered warm-orange neon tube edging around the cabinet.
- Dark-red "NEON NIGHTS" marquee with neon-glow text; separate dark "JACKPOT!" sign that flares bright red during spins and pulses during celebration.
- Three cream reels with glass overlay, dividers, and a red win line; blue-lit side panels.
- Seven push buttons left→right: red, white, yellow, cream, white, purple, yellow. The red button is the canvas hit-tested spin control (pointer + keyboard Enter/Space, focus ring); it shows a pressed state during spins.
- Camera push 1.0 → 1.18 over ~600 ms when the red button fires; reel stop timings left→right [1100, 1650, 2200] ms; near-miss/reel-three anticipation (first two center symbols 7s → third reel extends to 3960 ms with easeOutQuart); vertical motion-blur ghosts + stretched trails; settle bounce normalized to ~8 px.
- Jackpot celebration: golden token/spark pour from the top into the tray, forming a mound (~210 tokens), with the `@CUMULATIVEWEB` watermark during the pour. Payout modal opens after the 2400 ms celebration.
- The old DOM reel presentation is now a visually-hidden screen-reader fallback; mute/Encore/language controls moved into a visible cabinet toolbar.

**Reference-frame mapping**
- Rest frame → `game/art/redo-rest.png` (cabinet at rest, neon edging, dim JACKPOT! sign, cream reels).
- Mid-spin frame → `game/art/redo-spin.png` (motion-blur trails, JACKPOT! sign flaring).
- Jackpot frame → `game/art/redo-jackpot.png` (triple 7s on the win line, flaring sign, token mound, watermark). Captured from the live canvas bitmap — this sandbox's headless Chromium composites stale frames into `Page.captureScreenshot`, so the canvas `toDataURL()` is the authoritative frame.

**Leaf removal**
- The leaf symbol is retired: no leaf on reels, in the symbol set, in `randSym` results, in initial rest positions, in reel art, or in teaser behavior (triple-leaf teaser replaced with a triple-bell Encore teaser). Leaf's weight moved to bell (bell 3→6); weights still sum to 18. Bonus-round disc symbols unchanged. Remaining "leaf" mentions in source are retirement comments/tests only.

**QA (2026-09-20)**
- Node unit tests: **116/116 pass** — `game-logic.test.js` 50/50 (incl. 20k-draw and 2k-spin no-leaf proofs), `payout-metrics.test.js` 33/33, `cabinet-anim.test.js` 33/33 (easing, 8 px settle, 1.0→1.18 camera, reel timings, near-miss extension, blur alpha, token mound).
- `node --check`: all JS files pass (config, logic, cabinet, game, i18n, metrics, scores, sw, 3 test files).
- Headless Chromium 152 sweep (CDP, `file://` — this sandbox's Chromium has no working network stack, so `http://localhost` is unreachable; SW install verified statically instead): **33/33 checks pass** — canvas boot, reel sprites exactly {bell, cherry, lemon, seven}, `sym-leaf` SVG removed, canvas red-button hit-test spin, keyboard Enter spin, 55 spins through the real UI path (spin balance never negative, pity counter never exceeded 200), 5 languages (es/ar/ja/fr/zh) with RTL `dir=rtl`, Encore bonus flow → payout, forced-pity jackpot → token celebration (207+ tokens) → payout modal, payout links byte-match `config.js` for both jackpot and bonus lists, win banner, issuance-ledger link-click recording, metrics export, score save + code import, SW cache bumped to `nn777-v2` with `cabinet.js` + all 3 screenshots precached and present on disk.
- Console/page errors: **0 real errors** (2 `manifest.webmanifest` CORS entries are `file://`-harness artifacts — manifest loads fine over https).
- FPS during scripted spin (headless software rendering): **avg 60.0, p95 59.9** — meets the 60 fps target with no glow reduction needed.
- QA notes: one bulk-spin count (52 vs 53) was a harness race (next spin fired while the keyboard-test spin was still in flight) — re-proven 10/10 with proper idle waits; the jackpot `captureScreenshot` frame was stale-compositor output — re-captured authoritatively from the canvas bitmap.

**Prize-link verification (2026-09-20 — all byte-match `config.js`, none 404)**

| # | List | URL | HTTP |
|---|---|---|---|
| 1 | jackpot | https://open.spotify.com/track/4XP56LZjeS0TJUd30kpGSK | 200 |
| 2 | jackpot | https://music.apple.com/us/album/neon-nights-pt-777/1660915130?i=1660915131 | 200 |
| 3 | jackpot | https://music.amazon.com/albums/B0BQRC5NY5?marketplaceId=ATVPDKIKX0DER&musicTerritory=US | 200 (non-JS clients see a browserWarning interstitial; album URL resolves) |
| 4 | jackpot | https://www.deezer.com/album/388911647 | 301 → https://www.deezer.com/us/album/388911647 (regional redirect; full fetch then hits Deezer's datacenter bot-wall — no 404) |
| 5 | jackpot | https://distrokid.com/hyperfollow/thatboyhihat/neon-nights-pt-777 | 200 (retry; first attempt transient connection fail) |
| 6 | bonus | https://distrokid.com/hyperfollow/thatboyhihat/neon-nights-pt-777 | 200 (same URL as #5, listed in both config lists) |
| 7 | bonus | https://open.spotify.com/track/0emH8ktA8x4DkOFLsG5xkW | 200 |
| 8 | bonus | https://open.spotify.com/track/2eSyWmIdPzEMyWejLb2LBj | 200 |

In-browser link check confirmed the rendered payout anchors are byte-identical to `config.js` for both the jackpot and bonus lists.

**Files added/changed**
- Added: `game/cabinet.js` (canvas renderer), `game/cabinet-anim.test.js`, `game/art/redo-rest.png`, `game/art/redo-spin.png`, `game/art/redo-jackpot.png`.
- Changed: `game/config.js` (leaf retired, bell 3→6), `game/game.js` (canvas spin wiring, no-leaf rests/teaser, NN_GAME handle), `game/index.html` (canvas element, toolbar, sr-only fallback), `game/styles.css` (cabinet/canvas presentation), `game/sw.js` (`nn777-v2`, precaches `cabinet.js` + 3 screenshots), `game/game-logic.test.js` (leaf-retirement proofs).
- Behavior preserved: 3 stages/9 rounds, Encore round, 41-language how-to, metrics/issuance ledger, score formula/codes, payout screen, listening gates/prizes, mute-pauses-accrual, 200-spin pity cap, all no-gambling/no-cash language.

---

## nn777-v4 — Install UI (all 41 languages), YouTube payout, audio hardening (2026-09-20)

Black's add: "fine as long as it's instructions and a translation for this info too."

**Install UI**
- New `installModal` in `index.html`: title + steps + PWA honesty note, all rendered from `NN_I18N[<lang>].install` via `applyLang` (English fallback for any locale missing strings).
- New 📲 Install button in the cabinet toolbar. On iOS (no `beforeinstallprompt`) it is always visible and opens the guided walkthrough (Share → Add to Home Screen → open from home screen); on Android/desktop Chrome/Edge it appears when `beforeinstallprompt` fires and the INSTALL button fires the native prompt; `appinstalled` hides the button.
- iOS detection: iPhone/iPad/iPod UA or MacIntel+touch. Steps differ by platform: iOS shows the 3-step walkthrough; elsewhere shows the native-prompt hint + "open from home screen" line.
- Never claims App Store/Play Store availability. The note honestly says PWA — "no app-store download needed."
- `game.js` exposes `window.NN_INSTALL_TEST = { isIOS, openInstall }` as a QA wiring hook.

**i18n (41/41 locales, 6 keys each)**
- Added `install: { title, android, ios1, ios2, ios3, note }` to every locale in `game/i18n.js` (40 translated by a dedicated agent into `/tmp/nn777-install-strings.json`, zh-TW added with Taiwan iOS wording "加入主畫面"; en written directly).
- All 5 how-to bullets per locale preserved (verified: no locale has !=5 bullets).

**Payout**
- `config.js` `jackpotLinks`: added YouTube `https://www.youtube.com/watch?v=3L5eUDui-00` (verified 2026-09-20: oEmbed "Neon Nights pt. 777" — That Boy Hi Hat - Topic; watch page 200).
- Tidal: NO URL added. No verified direct Tidal track URL exists anywhere checked (search engines, DistroKid HyperFollow wall, Tidal unauthenticated API 401, Songlink). Guessing a Tidal ID is explicitly forbidden — pending browser-capable verification.

**Audio hardening**
- Added explicit `touchstart` listener alongside `pointerdown` for first-gesture unlock (some iOS webviews report pointerdown late).
- `visibilitychange` resume now retries `tryPlay()` up to 5× at 1s intervals after returning from background (covers iOS call/alarm interruptions).
- Playback-state diagnostics on `window.__nnAudioState` (ready/gestured/unlocked/muted/paused/readyState/error — no PII).

**PWA**
- New `game/icons/icon-180.png` (resized from icon-192); `apple-touch-icon` now points at it.
- `manifest.webmanifest`: 180/192/512 normal entries + separate maskable 192/512 (previous `"purpose":"any maskable"` was a single invalid purpose value — split).
- `game/VERSION.json` (build `nn777-v4`) + `game/CHANGELOG.md` added; `index.html` NN_BUILD and `sw.js` cache tag bumped to `nn777-v4`; `icon-180.png` added to the SW precache list.

**Tests**
- New `game/install-i18n.test.js`: 1540/1540 pass — 41 locales × 6 non-empty keys, no gambling/store-availability claims, YouTube present, no invented Tidal, manifest icon coverage, VERSION/CHANGELOG/build-tag sync, apple-touch-icon check.
- Regression: `game-logic.test.js` 50/50, `payout-metrics.test.js` 33/33, `node --check` green on i18n.js + game.js.

**Still owed (not pushed)**: mobile-emulation touch test, Lighthouse PWA audit, 150-spin soak, Tidal verification, Pages deploy + poll, Black's actual-iPhone gate.

### Tidal payout added (2026-09-20)
- Black himself verified the official That Boy Hi Hat Tidal artist page: `https://tidal.com/artist/28839612` (live HTTP 200, title "That Boy Hi Hat on TIDAL"). Added as the Tidal jackpot option in `game/config.js`; test now asserts the verified artist URL and forbids any guessed `tidal.com/track/` or `/album/` URL.
- Exact track page for "Neon Nights pt. 777" still pending from a browser hunt; if found, it will replace the artist page.

### Tidal track page verified (2026-09-20)
- Browser hunt via TIDAL's own search confirmed the exact track page: `https://tidal.com/track/267845274` — "Neon Nights pt. 777" by That Boy Hi Hat, 1-track single, released 2022-12-23, 3:47, Explicit, label CUMULATIVE WEB INC. Replaced the artist page as the Tidal jackpot option in `game/config.js`. Test now requires exactly this URL as the only Tidal URL present.
- The resolver's Tidal gap for this track is closed.

### YouTube Music payout added (2026-09-20)
- Black supplied the official YouTube Music artist channel, fetched live and title-confirmed "That Boy Hi Hat": `https://music.youtube.com/channel/UCdlSWhZXKKNPhjXDknHzzpQ` (canonical form, no `?si=` share token). Added as "YouTube Music" alongside the existing YouTube track-video option in `game/config.js`. Test asserts the URL and rejects any share-token URLs. YouTube discovery gap closed.

### Amazon Music artist page (2026-09-20)
- Black supplied from his own Amazon Music app share: `https://music.amazon.com/artists/B09JFCWZYG` (canonical, no `?ref=` token). Fetch hit Amazon's bot wall, so this is treated as his verified link per his standing rule (his material is ground truth). Replaced the album URL as the Amazon Music jackpot option; old URL recorded in the config comment. Test asserts it is the single Amazon URL present.

### Payout lineup refresh (2026-09-20)
- Spotify: added artist page `https://open.spotify.com/artist/2f9j460EwjfvjYp3trBcb7` (Black-supplied, canonical, no ?si=/?utm_source=; artist ID matches the verified artist ID). Kept alongside the existing track link.
- Apple Music: option is now the Black-supplied artist page `https://music.apple.com/us/artist/that-boy-hi-hat/1590210881` (old album URL recorded in comment).
- Deezer: option is now `https://www.deezer.com/us/artist/148421152` — resolved from Black's short link, verified live as the That Boy Hi Hat artist page (artist ID 148421152 matches the known seed; discography shows Idol or Icon, The Alternative Theory, Post Trap Futurism: The Logo Effect). Canonical, no utm params.
- Pandora: ADDED — Black's short link `https://pandora.app.link/OIHcaPZYA6b` resolves via its own deep-link metadata to canonical artist page `https://www.pandora.com/artist/that-boy-hi-hat/ARd7j9fggX32x6q` (direct fetch hits Pandora's datacenter bot wall → /restricted, expected). This closes the long-standing Pandora omission (verified direct URL now found).
- YouTube: Black re-sent the channel in youtube.com/channel form with a ?si= token — same channel ID; the canonical `https://music.youtube.com/channel/UCdlSWhZXKKNPhjXDknHzzpQ` stays on the payout screen. No change.
- Test hardened: payout-URL checks now scope to the jackpotLinks array (bonus links share domains) and assert each option is the single canonical verified URL, no share tokens.

---

## 3D rebuild (2026-09-20) — Three.js cabinet

### Why rebuilt
Black rejected the Canvas-2D version: it failed on his iPhone and did not resemble the reference video. The 3D rebuild targets "a product Black would release."

### Root causes (2D failure)
1. **iPhone WebGL context failure** — the 2D canvas path assumed WebGL availability; on Black's iPhone the context creation failed and the page went blank with no fallback.
2. **No visible fallback** — when the 3D/WebGL path failed, users saw a dead page instead of a playable DOM fallback.
3. **Reference mismatch** — flat 2D rendering could not reproduce the chrome-cabinet, neon-marquee, cylindrical-reel look of the reference video.

### What the 3D build does
- **Three.js 0.160.0 vendored locally** (`game/vendor/three/`) — zero runtime CDN dependencies; import map pins `three` and `three/addons/`.
- **PBR chrome cabinet** with RoomEnvironment/PMREM reflections for true metallic surfaces.
- **Dark casino setting** with bokeh sprites; orange TubeGeometry edge lights tracing the cabinet.
- **NEON NIGHTS marquee** (emissive text) + **JACKPOT sign** with flare modes.
- **Three cylindrical 10-cell reels** — symbols drawn in texture space, always upright; only cherries, lemons, bells, red 7s (no leaf, per spec).
- **Seven physical buttons**; red-button raycasting + CDP touch-tap support.
- **Spin choreography**: staggered start, anticipation slowdown, settle bounce, motion-blur ghosts, camera push-in/relax.
- **Celebration**: token pour (220 pooled), spark particles, token mound, @CUMULATIVEWEB watermark.
- **Post**: EffectComposer → RenderPass → UnrealBloomPass → OutputPass; mobile DPR cap 1.5, desktop 2.
- **Low-FPS kill-switch**: honest 2-second raw-delta sampling; composer disengages below 50 FPS (verified engaging at ~0.4 FPS under SwiftShader).
- **DOM fallback**: when WebGL is unavailable, a visible (never sr-only) DOM reel cabinet boots and plays; verified 4/4.
- **Boot watchdog**: 9s timer — if the module graph fails, a visible "Tap to retry" UI appears (verified via network-blocked cabinet3d.js).
- **Public API** (`window.NN_CABINET`): exactly `init, setRest, spin, celebrate, endCelebrate, setSpins, setSignFlare, onSpinRequest, fpsStats` (enumerable). QA hooks `_debugRedCenter`/`_debugPerf` are non-enumerable; `_debugExposure`, `celebrating`, `settled`, `domFallback` removed.

### Service worker
- Cache `nn777-v4` (bumped from v3 to force refresh of the 3D assets).
- Installs on window load; `controllerchange` → reload; `updatefound` → `installed` → update toast with SKIP_WAITING.
- Cache hygiene: only OK responses cached; 404s never cached (verified with bogus asset).
- **Real update verified**: deployed byte-different sw.js to staging, `r.update()` → new SW installed → toast surfaced → restored.

### QA receipts (2026-09-20, staging https://cumulativewebinc.github.io/nn777-qa-stage/)
| Suite | Result |
|---|---|
| Standard | **13/13 pass** — boot, WebGL (SwiftShader), zero errors, red-button touch → spin → settle (totalSpins 0→1), kill-switch honest (0.4 FPS, composer off), 41 i18n × 5 bullets, SW v4 active, cache hygiene, 404 not cached, update toast + SKIP_WAITING |
| Resilience | **6/6 pass** — config.js byte-identical (6,588B, 16 links all resolve), module-failure → retry UI, clean boot, WebGL with non-same-origin blocked, real SW update → toast |
| Fallback (no WebGL) | **4/4 pass** — boots, WebGL truly absent, DOM fallback visible, spin settles |
| game-logic.test.js | 50 passed |
| payout-metrics.test.js | 33 passed |
| cabinet3d-anim.test.mjs | 48 passed |
| sw.js | syntax OK |

### Honest limitations
- **Host has no GPU** (/dev/dri absent, no NVIDIA) — Chromium runs SwiftShader (~0.3–0.6 FPS). This host **cannot prove real-iPhone FPS or ≥55 FPS**. The valid host-side proof is honest low-FPS detection and composer disengagement, both verified.
- **First-gesture audio**: verified unlocked synchronously in `pointerdown` to the extent Chromium permits; real iOS Safari behavior needs on-device confirmation.
- **150-spin soak**: deferred to production verification (staging suite covers single-spin settle; soak is a production gate).

### Files
- `game/cabinet3d.js` (WebGL + DOM cabinets, exact 9-method API)
- `game/cabinet-anim.js`, `game/cabinet3d-anim.test.mjs`
- `game/vendor/three/**` (0.160.0, local)
- `game/.nojekyll`, `game/sw.js` (v4), `game/index.html`
- `qa/qa3d.js` (standard + resilience), `qa/qa3d-fallback.js`, `qa/deploy.js`, `qa/deploy3d.js`
