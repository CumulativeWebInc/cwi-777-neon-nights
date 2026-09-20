/* Node tests: 777 Neon Nights cabinet animation helpers (cabinet.js pure fns).
   Run: node cabinet-anim.test.js */
"use strict";
const H = require("./cabinet.js");

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }
function approx(a, b, eps, name) { ok(Math.abs(a - b) <= eps, `${name} (got ${a}, want ~${b})`); }

/* --- easings --- */
(function () {
  ok(H.easeInOutCubic(0) === 0 && H.easeInOutCubic(1) === 1, "easeInOutCubic endpoints");
  approx(H.easeInOutCubic(0.5), 0.5, 1e-9, "easeInOutCubic midpoint");
  ok(H.easeOutCubic(0) === 0 && H.easeOutCubic(1) === 1, "easeOutCubic endpoints");
  ok(H.easeOutQuart(0) === 0 && H.easeOutQuart(1) === 1, "easeOutQuart endpoints");
  // clamped outside [0,1]
  ok(H.easeInOutCubic(-2) === 0 && H.easeInOutCubic(5) === 1, "easings clamp");
  // easeInOut is slow-fast-slow: quarter point below linear
  ok(H.easeInOutCubic(0.25) < 0.25, "easeInOutCubic slow start");
  // easeOutQuart decelerates harder than easeInOut late in the curve
  ok(H.easeOutQuart(0.8) > H.easeInOutCubic(0.8), "easeOutQuart stronger late decel");
})();

/* --- settle bounce: ~8px overshoot, decays to 0 --- */
(function () {
  ok(H.settleBounce(0) === 0, "settleBounce starts at 0");
  ok(H.settleBounce(1) === 0, "settleBounce ends at 0");
  let mx = 0, mn = 0;
  for (let i = 0; i <= 200; i++) {
    const v = H.settleBounce(i / 200);
    if (v > mx) mx = v;
    if (v < mn) mn = v;
  }
  ok(mx >= 7.5 && mx <= 8.5, `settleBounce peak overshoot ~8px (got ${mx.toFixed(2)})`);
  ok(mn >= -0.01, "settleBounce never goes negative (no undershoot below rest)");
  ok(H.settleBounce(0.9) < H.settleBounce(0.35), "settleBounce decays after the peak");
})();

/* --- camera push-in: 1.0 -> 1.18 --- */
(function () {
  approx(H.cameraScale(0), 1.0, 1e-9, "cameraScale rest = 1.0");
  approx(H.cameraScale(1), 1.18, 1e-9, "cameraScale pushed = 1.18");
  const mid = H.cameraScale(0.5);
  ok(mid > 1.0 && mid < 1.18, `cameraScale mid in (1.0, 1.18) (got ${mid.toFixed(3)})`);
  ok(H.cameraScale(0.25) < H.cameraScale(0.75), "cameraScale monotonic");
})();

/* --- reel durations + near-miss anticipation --- */
(function () {
  const d = H.reelDurations(["cherry", "lemon", "bell"]);
  ok(JSON.stringify(d) === JSON.stringify([1100, 1650, 2200]), "normal durations [1100,1650,2200] (left-to-right stops)");
  ok(d[0] < d[1] && d[1] < d[2], "reels stop left-to-right");
  const a = H.reelDurations(["seven", "seven", "lemon"]);
  ok(a[0] === 1100 && a[1] === 1650, "anticipation keeps reels 1-2 timing");
  ok(a[2] > 2200, `anticipation extends reel 3 (got ${a[2]})`);
  approx(a[2] / 2200, 1.8, 0.01, "reel 3 ~1.8x longer on near-miss");
  const j = H.reelDurations(["seven", "seven", "seven"]);
  ok(j[2] > 2200, "jackpot landing also gets the slow reel-3 decel");
  const b = H.reelDurations(["seven", "lemon", "seven"]);
  ok(b[2] === 2200, "no anticipation when only reels 1+3 are 7s");
})();

/* --- motion-blur alpha --- */
(function () {
  ok(H.blurAlpha(0) === 0, "blurAlpha 0 at rest");
  approx(H.blurAlpha(1), 0.55, 1e-9, "blurAlpha 0.55 at full speed");
  ok(H.blurAlpha(5) === 0.55, "blurAlpha clamps at max");
  ok(H.blurAlpha(-1) === 0, "blurAlpha clamps at 0");
  ok(H.blurAlpha(0.5) > H.blurAlpha(0.1), "blurAlpha grows with speed");
})();

/* --- token mound shape --- */
(function () {
  approx(H.tokenMound(240, 1), 78, 0.01, "mound peak 78px at center when full");
  ok(H.tokenMound(240, 0) === 0, "mound flat when empty");
  ok(H.tokenMound(60, 1) < H.tokenMound(240, 1), "mound falls off from center");
  ok(H.tokenMound(240, 0.5) < H.tokenMound(240, 1), "mound grows with fill");
  let neg = false;
  for (let x = 0; x <= 480; x += 10) if (H.tokenMound(x, 1) < 0) neg = true;
  ok(!neg, "mound never negative");
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
