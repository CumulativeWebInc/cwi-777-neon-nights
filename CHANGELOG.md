# 777 Neon Nights — Changelog

## nn777-v8.2.1 (2026-09-20) — double-tap spin fix (Black's bug report)
- Root cause (ATHENA, measured in code): the green `.spin-btn` had no
  `touch-action:manipulation` and the viewport was scalable, so iOS Safari
  delayed taps ~300ms waiting for a second tap (double-tap-zoom) and ate
  quick second taps. Audio-unlock was ruled out and left untouched.
- Fix: `touch-action:manipulation` on `.spin-btn` + viewport gains
  `maximum-scale=1.0, user-scalable=no` (all other viewport values kept).
  One tap = one spin, every time. Cache-bust tags bumped to
  `?v=nn777-v8.2.1` so every device fetches the fixed assets.
All prior constraints hold: single green Spin button, one spin per tap,
200-spin pity cap, 40-spin cap, 9 rounds/3 stages, persistent credits,
free/no-cash/no-gambling framing.

## nn777-v8.2 (2026-09-20) — GAME OVER loop (Black's order)
1. **GAME OVER at 0 spins**: the machine marquee shows GAME OVER on the
   cabinet (3D + DOM fallback) and a modal opens: credit balance, replay
   guidance, buy-spins and the Earn panel. 40 starting spins.
2. **Silence is the trigger**: GAME OVER + 0 Neon Credits stops the song
   (pause, not just quiet). Any way forward restores the music.
3. **Song replays earn**: every completed full loop banks +25 Neon Credits
   (seeks never award; one award per completed loop).
4. **Earn panel** (only while credits < 25, all once ever via persisted
   `creditsAwarded`): LIKE opens an allowlisted track deep link
   (Spotify/YouTube/TIDAL — every URL asserted in jackpotLinks, never
   invented) and restarts the song +25; SHARE uses the real Web Share API
   (native iOS sheet, clipboard fallback), +25 on completed share/copy;
   FOLLOW opens an allowlisted artist page (Spotify/Apple Music) +25.
   Dead-simple 3-step micro-instructions, big tap targets, all 41 languages.
5. **Refill**: 10 spins for 25 Neon Credits; refused below 25, never negative.
6. **Owner metrics**: anonymous event log in localStorage (`nn777-metrics`,
   capped 500) — song plays/replays, like/share/follow taps+awards,
   game-overs, spins, spin buys, credits earned/spent, unique players
   (persisted device id). Read-only owner dashboard at `?metrics=1`
   (never linked in the normal UI).
7. **Link-check QA**: every outbound like/follow/share URL is live-checked
   (200/30x required; 404/dead fails the build, geo-blocked/login-walled
   flagged, never shipped silently).
All prior constraints hold: single green Spin button, one spin per tap,
200-spin pity cap, 40-spin cap, 9 rounds/3 stages, persistent credits,
free/no-cash/no-gambling framing, 10 allowlisted music platforms.

## nn777-v8 (2026-09-20) — Neon Credits system (Black's order)
Fun points — **no money value, redeemable only for free music links**
(the claim modal carries the no-money-value disclaimer in all 41 languages).
1. **Credit awards**: jackpot +1000, triple +50, listening-prize unlock +25.
   A jackpot reaches the 1000-credit link price instantly; smaller wins
   accumulate toward it.
2. **Jackpot pays whatever link they want**: the jackpot claim modal's
   CASH IN opens the link-choice step listing the 10 allowlisted music
   platforms (Spotify ×2, Apple Music, YouTube, YouTube Music, TIDAL,
   Deezer, Amazon Music, Pandora, DistroKid hyperfollow) — one tap, the
   player's choice, link issuance tracked as before.
3. **Cash in or save**: after EVERY win the claim modal asks "Cash in now,
   or save as credit?" — CASH IN (enabled at ≥1000 credits) opens the
   link choice; SAVE AS CREDIT banks the award and closes. Below threshold,
   cash-in reports how many more credits are needed.
4. **Banking**: the credit score accumulates in `S.credits`, persisted in
   localStorage across sessions (survives reload). Listening-prize unlock
   awards pay **once ever** per prize (`S.creditsAwarded` persists the paid
   IDs) — the unlock announcement itself stays once-per-session, but the
   +25 never re-banks on reload (no reload-farming).
5. **Machine display**: the banked credit score rides on the cabinet's
   machine display alongside the prize name — second neon line on the 3D
   marquee (`showPrize(text, scoreLine)`), second line on the DOM LED
   readout (`#prizeDisplay`, pre-line).
6. **i18n**: `credits` blocks (ask, cashin, save, score, earned, choose,
   need, disclaimer) in all 41 languages.
- QA: `qa/jackpot-show.js` extended — credit awarding math (+1000/+50/+25),
  banking, threshold redemption (cash-in → 10 links → tap deducts 1000),
  jackpot instant-choice, localStorage persistence across reload, no page
  errors. `qa/winfix.js` updated to the claim flow (cash-in → link list →
  redemption deducts). Unit: game-logic 56/56, install-i18n 3768/3768,
  payout-metrics 37/37, cabinet-anim 33/33.
- Preserved: single large centered glossy-green Spin! button, single spins
  only, no auto-spin, 200-spin pity cap, free/no-cash/no-gambling,
  41 languages, announcedPrizes once-per-session.
- Ships together with nn777-v7 (never deployed on its own).

## nn777-v7 (2026-09-20) — jackpot showmanship (Black's order)
1. **Prize notification ON THE MACHINE itself** — the 3D cabinet's marquee
   face becomes a neon-tube prize readout: `CAB.showPrize(text)` swaps the
   NEON NIGHTS marquee for the translated prize name (jackpot, triple, and
   listening-prize unlocks, all 41 `win` i18n blocks), with an HDR push so it
   blooms through the threshold-1.0 pass; visible during the celebration
   camera push-in. `clearPrize()` restores the marquee on the next spin. The
   DOM fallback cabinet gets an LED-ticker readout on its own face
   (`#prizeDisplay`) with the same semantics.
2. **Background lights up for a jackpot** — 3D: a gold-to-magenta wash light
   plus bloom-strength kick plus scene-background pulse while `celebrate()`
   runs. The rig YIELDS under the 50 FPS kill-switch: composer bypassed →
   wash goes static-dim, bloom kick skipped, lights degrade before the
   cabinet. DOM fallback: a pure-CSS light sweep washes the page behind the
   cabinet (`body.jackpot-lights`), compositor-only and mobile-safe.
- New public CAB methods: `showPrize(text, scoreLine)`, `clearPrize()`
  (both 3D and DOM implementations; scoreLine added in v8); new QA hooks
  `_debugCelebState()` (now also reports `prizeScore`), `_debugSetComposer()`
  (non-enumerable).
- iPhone 14-emulated CDP regression `qa/jackpot-show.js` — v7+v8 combined:
  see the nn777-v8 QA counts above (the standalone 20/20 v7 run never
  completed — the harness was interrupted before finishing; v7 was never
  deployed on its own).
- Unit: game-logic 56/56, install-i18n 3768/3768, payout-metrics 37/37,
  cabinet-anim 33/33.
- Preserved: single large centered glossy-green Spin! button, single spins
  only, no auto-spin, 200-spin pity cap, free/no-cash/no-gambling,
  41 languages, announcedPrizes once-per-session.

## nn777-v6 (2026-09-20) — iPhone win-fix regression
Fixes Black's three 2026-09-20 iPhone findings:
1. **SPINS counter didn't count down** — the regen clock froze while the spin
   bank sat at cap, so time parked at 40 instantly refunded the next spent
   spin. `regenSpins()` now advances `lastRegen` by every full elapsed
   regeneration period even when capped: cap 5 min → spin → 39, stays 39.
2. **Prize didn't generate a music link** — every listening-prize claim now
   renders the verified 10 music-platform links (Spotify ×2, Apple Music,
   YouTube, YouTube Music, TIDAL, Deezer, Amazon Music, Pandora, DistroKid
   hyperfollow) from `C.jackpotLinks`; no other music URLs can render.
3. **Wins must say what was won** — jackpot, triple, and listening-prize
   unlocks announce on screen naming the prize, in all 41 languages
   (new `win` blocks: `jackpot`, `triple`, `prize`, `claim`).
Also: unlock announcements fire once per prize per session (previously the
banner/toast could re-fire every audible second until claimed).
- iPhone 14-emulated CDP regression `qa/winfix.js`: 16/16 green
  (40→39 in DOM, state, and 3D cabinet meter; unlock names the prize;
  claim shows all 10 allowlisted links; forced pity jackpot announces
  "JACKPOT! 777" and opens its payout; zero page errors).
- Unit: game-logic 56/56, install-i18n 2579/2579, payout-metrics 37/37,
  cabinet3d-anim 56/56.

## nn777-v5 (2026-09-20)
Single large centered glossy-green SPIN button (41-language label) replaces
the 7-button row; no auto-spin; no "Hold for Auto".
