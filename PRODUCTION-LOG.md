# 777 Neon Nights — Production Log

**Product:** 777 Neon Nights — free promo slot game for "Neon Nights Pt. 777" by That Boy Hi Hat (Cumulative Web Inc).
**Shipped:** 2026-09-20. **Version:** 1.0.0. **Build cost:** $0.

## What shipped

- **Live game (PWA):** https://cumulativewebinc.github.io/cwi-777-neon-nights/
- **Repo:** https://github.com/CumulativeWebInc/cwi-777-neon-nights (public, `main`, 21 files)
- **Promo video:** `~/workspace/your_files/777-neon-nights-promo.mp4` (30s, 540×960, H.264+AAC, real track audio, game URL on end card)
- Installable on iOS (Add to Home Screen), Android, desktop via PWA manifest + service worker.
- 3 stages / 9 rounds, listening-time-gated prizes (3/7/15 min), Encore bonus round (24h cooldown, always awards a free catalog link), 200-spin jackpot pity cap, jackpot pays streaming-link choice.
- 41-language how-to-play with browser-locale detection + English fallback.
- Local top-10 high scores with portable tamper-evident score codes.
- Anonymous local-only metrics + per-link issuance ledger with JSON export.

## QA results

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
