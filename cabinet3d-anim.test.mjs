/* Node tests: 777 Neon Nights 3D cabinet animation helpers (cabinet-anim.js).
   Run: node cabinet3d-anim.test.mjs */
import * as H from "./cabinet-anim.js";

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }
function approx(a, b, eps, name) { ok(Math.abs(a - b) <= eps, `${name} (got ${a}, want ~${b})`); }

/* --- easings --- */
ok(H.easeInOutCubic(0) === 0 && H.easeInOutCubic(1) === 1, "easeInOutCubic endpoints");
approx(H.easeInOutCubic(0.5), 0.5, 1e-9, "easeInOutCubic midpoint");
ok(H.easeOutCubic(0) === 0 && H.easeOutCubic(1) === 1, "easeOutCubic endpoints");
ok(H.easeOutQuart(0) === 0 && H.easeOutQuart(1) === 1, "easeOutQuart endpoints");
ok(H.easeInOutCubic(-2) === 0 && H.easeInOutCubic(5) === 1, "easings clamp");
ok(H.easeInOutCubic(0.25) < 0.25, "easeInOutCubic slow start");
ok(H.easeOutQuart(0.8) > H.easeInOutCubic(0.8), "easeOutQuart stronger late decel");

/* --- settle bounce: ~8px overshoot, decays to 0 --- */
ok(H.settleBounce(0) === 0, "settleBounce starts at 0");
ok(H.settleBounce(1) === 0, "settleBounce ends at 0");
{
  let mx = 0, mn = 0;
  for (let i = 0; i <= 200; i++) {
    const v = H.settleBounce(i / 200);
    if (v > mx) mx = v;
    if (v < mn) mn = v;
  }
  ok(mx >= 7.5 && mx <= 8.5, `settleBounce peak ~8px (got ${mx.toFixed(2)})`);
  ok(mn >= -0.01, "settleBounce never undershoots below rest");
  ok(H.settleBounce(0.9) < H.settleBounce(0.35), "settleBounce decays after peak");
}

/* --- camera push-in 1.0 -> 1.18 --- */
approx(H.cameraScale(0), 1, 1e-9, "cameraScale rest");
approx(H.cameraScale(1), 1.18, 1e-9, "cameraScale pushed");
ok(H.cameraScale(0.5) > 1 && H.cameraScale(0.5) < 1.18, "cameraScale mid-flight");

/* --- reel durations --- */
{
  const d = H.reelDurations(["lemon", "cherry", "bell"]);
  ok(JSON.stringify(d) === "[1100,1650,2200]", `reelDurations plain (got ${d})`);
  const a = H.reelDurations(["seven", "seven", "lemon"]);
  ok(a[2] === Math.round(2200 * 1.8), `reelDurations anticipation x1.8 (got ${a[2]})`);
  ok(a[0] === 1100 && a[1] === 1650, "reelDurations anticipation keeps 1-2");
}

/* --- blur alpha --- */
ok(H.blurAlpha(0) === 0, "blurAlpha still");
approx(H.blurAlpha(1), 0.55, 1e-9, "blurAlpha full speed");
ok(H.blurAlpha(2) === 0.55 && H.blurAlpha(-1) === 0, "blurAlpha clamped");

/* --- token mound --- */
ok(H.tokenMound(240, 0) === 0, "tokenMound empty fill");
ok(H.tokenMound(240, 1) === 78, "tokenMound center full");
ok(H.tokenMound(240, 1) > H.tokenMound(355, 1), "tokenMound falls off at edges");
ok(H.tokenMound(-999, 1) >= 0, "tokenMound never negative");

/* --- spin plan layout --- */
function detRng() { let s = 0.12345; return () => { s = (s * 16807) % 1; return s; }; }
{
  const oldT = ["lemon", "cherry", "bell"], newT = ["seven", "seven", "seven"];
  const p = H.reelSpinPlan(oldT, newT, 0, false, detRng());
  ok(p.N === H.REEL_CELLS, "plan uses REEL_CELLS");
  ok(p.cells.length === p.N, "plan cells length == N");
  ok(p.cells[0] === "lemon" && p.cells[1] === "cherry" && p.cells[2] === "bell", "plan starts with old triple");
  ok(p.cells[p.N - 3] === "seven" && p.cells[p.N - 2] === "seven" && p.cells[p.N - 1] === "seven", "plan ends with new triple");
  ok(p.cells.every(c => ["seven", "cherry", "lemon", "bell"].includes(c)), "plan cells are reel symbols only (no leaf)");
  ok(p.dur === 1100, "plan reel-0 duration 1100ms");
  ok(p.easeName === "easeInOutCubic", "plan reel-0 ease");
  const pa = H.reelSpinPlan(oldT, newT, 2, true, detRng());
  ok(pa.dur === Math.round(2200 * 1.8), "plan reel-3 anticipation duration");
  ok(pa.easeName === "easeOutQuart", "plan reel-3 anticipation ease");
  // start offset shows old middle cell at front-center; end shows new middle cell
  ok(H.frontCellIndex(p, p.oStart) === 1, `plan start lands on old mid (got ${H.frontCellIndex(p, p.oStart)})`);
  ok(H.frontCellIndex(p, p.oEnd) === p.N - 2, `plan end lands on new mid (got ${H.frontCellIndex(p, p.oEnd)})`);
  ok(p.oEnd > p.oStart, "plan scrolls forward");
  // later reels spin more turns
  const p2 = H.reelSpinPlan(oldT, newT, 2, false, detRng());
  ok(p2.oEnd - p2.oStart > p.oEnd - p.oStart, "reel 2 spins more turns than reel 0");
}

/* --- plan offset over time --- */
{
  const p = H.reelSpinPlan(["lemon", "cherry", "bell"], ["bell", "bell", "bell"], 1, false, detRng());
  approx(H.planOffsetAt(p, 0), p.oStart, 1e-9, "offset at t=0");
  approx(H.planOffsetAt(p, p.dur), p.oEnd, 1e-9, "offset at t=dur");
  let prev = -Infinity, mono = true;
  for (let i = 0; i <= 40; i++) {
    const v = H.planOffsetAt(p, (i / 40) * p.dur);
    if (v < prev - 1e-12) mono = false;
    prev = v;
  }
  ok(mono, "offset monotonic during spin");
  const s01 = H.planSpeed01(p, 0);
  ok(s01 >= 0 && s01 <= 1, "speed01 in range");
  ok(H.planSpeed01(p, p.dur * 0.5) > 0.05, "speed01 positive mid-spin");
}

/* --- settle offset --- */
{
  const p = H.reelSpinPlan(["lemon", "cherry", "bell"], ["seven", "seven", "seven"], 0, false, detRng());
  approx(H.planSettleOffset(p, 0), p.oEnd, 1e-9, "settle starts at end");
  approx(H.planSettleOffset(p, 1), p.oEnd, 1e-9, "settle ends at end");
  ok(H.planSettleOffset(p, 0.35) > p.oEnd, "settle overshoots mid-way");
  ok(Math.abs(H.planSettleOffset(p, 0.35) - p.oEnd) < 0.5 / p.N, "settle overshoot under half a cell");
  ok(H.frontCellIndex(p, H.planSettleOffset(p, 1)) === p.N - 2, "settle ends on new mid");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
