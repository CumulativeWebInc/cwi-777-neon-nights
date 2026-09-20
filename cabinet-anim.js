/* 777 Neon Nights — pure animation helpers for the 3D cabinet (cabinet3d.js).
   Zero dependencies, no DOM, no WebGL: safe to import from node for unit tests
   (see cabinet3d-anim.test.mjs) and from the browser module via
   `import { ... } from './cabinet-anim.js'`.

   Reel model (matches the 3D wheel texture):
   - Each reel texture is a strip of N cells laid along the cylinder's
     circumference (u axis). Cell i occupies u in [i/N, (i+1)/N].
   - CylinderGeometry u=0 sits at +Z (front, facing the camera), so the symbol
     at front-center is the cell containing frac(texture.offset.x).
   - Spin layout: cells[0..2] = old rest triple (top, mid, bot),
     cells[3..N-4] = random filler, cells[N-3..N-1] = new result triple.
     The spin starts with the old middle cell (index 1) at front-center and
     scrolls forward to the new middle cell (index N-2).
   - Symbols: "seven" | "cherry" | "lemon" | "bell" only (no leaf). */
export const REEL_CELLS = 10;
/* Renderer geometry contract (single source of truth — cabinet3d.js sizes its
   strip canvas from these so the settle-bounce px math below stays honest):
   wheel radius 0.86, width 1.2, 200 canvas px per world unit along the strip. */
export const REEL_RADIUS = 0.86;
export const REEL_WIDTH = 1.2;
export const REEL_PX_PER_UNIT = 200;
export const REEL_CELL_PX = Math.round((2 * Math.PI * REEL_RADIUS / REEL_CELLS) * REEL_PX_PER_UNIT); // 108

/* Spin button geometry contract (single source of truth — cabinet3d.js builds
   the physical button from these; the QA harness asserts them).
   Replaced the old 7-button row 2026-09-20: one large centered glossy-green
   rounded-rect SPIN button, ~2x the old button diameter. */
export const SPIN_BUTTON = { w: 1.5, h: 0.6, depth: 0.16, corner: 0.22 };
export const OLD_BUTTON_DIAMETER = 0.31; // old 7-button row: r=0.155 cylinders

/* Resolve the cabinet button label for a language code from the NN_I18N
   dict. Every locale ships its own `spin` key; English is the fallback, and
   "Spin!" is the last resort so the button is never label-less. */
export function spinLabelFor(lang, dict) {
  const d = dict || {};
  const e = d[lang], en = d.en;
  const s = (e && e.spin) || (en && en.spin) || "Spin!";
  return String(s);
}

export function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
export function easeInOutCubic(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
export function easeOutQuart(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 4); }

/* Settle bounce: overshoot ~8px (in reel-cell px units) decaying to 0 across
   t in [0,1]. (1-t)*sin(pi t) peaks at 0.57923, so normalize to peak at 8. */
const SETTLE_NORM = 1 / 0.57923;
export function settleBounce(t) { t = clamp01(t); return 8 * SETTLE_NORM * (1 - t) * Math.sin(Math.PI * t); }

/* Camera push-in 1.0 -> 1.18 on spin. */
export function cameraScale(t) { return 1 + 0.18 * easeOutCubic(t); }

/* Per-reel spin durations (ms). Near-miss anticipation: reels 1-2 middle are
   7s -> reel 3 runs longer (x1.8) and decelerates with easeOutQuart. */
export function reelDurations(middle) {
  const d = [1100, 1650, 2200];
  if (middle && middle[0] === "seven" && middle[1] === "seven") d[2] = Math.round(2200 * 1.8);
  return d;
}

/* Motion-blur ghost alpha from normalized reel speed 0..1. */
export function blurAlpha(speed01) { return Math.min(0.55, Math.max(0, speed01) * 0.55); }

/* Token mound height (logical px) at x, fill 0..1. */
export function tokenMound(x, fill) {
  const dx = (x - 240) / 115;
  return Math.max(0, 78 * Math.max(0, Math.min(1, fill)) * Math.exp(-dx * dx));
}

const EASES = { easeInOutCubic, easeOutCubic, easeOutQuart };
const SYM_IDS = ["seven", "cherry", "lemon", "bell"];

function randSym(rng) {
  const r = (rng || Math.random)();
  const i = Math.min(3, Math.floor(r * 4));
  return SYM_IDS[i];
}

/* Build one reel's spin plan. Returns everything the renderer needs:
   { N, cells, oStart, oEnd, dur, easeName, ease }.
   - oldTriple / newTriple: [top, mid, bot] symbol ids (exactly 3 each).
   - reelIndex: 0 | 1 | 2 (staggers duration + filler turns).
   - anticipate: true when reels 1-2 middles are 7s (reel 3 slows down).
   - rng: optional () => [0,1) for deterministic tests. */
export function reelSpinPlan(oldTriple, newTriple, reelIndex, anticipate, rng) {
  const N = REEL_CELLS;
  const cells = [oldTriple[0], oldTriple[1], oldTriple[2]];
  for (let k = 3; k < N - 3; k++) cells.push(randSym(rng));
  cells.push(newTriple[0], newTriple[1], newTriple[2]);

  const durs = reelDurations(anticipate ? ["seven", "seven"] : null);
  const dur = durs[reelIndex];
  const easeName = (reelIndex === 2 && anticipate) ? "easeOutQuart" : "easeInOutCubic";

  // Front-center shows cell 1 (old mid) at spin start; cell N-2 (new mid) at end.
  // Keep offsets positive and well away from 0 so fractional math is clean.
  const oStart = 10 + 1.5 / N;
  const fullTurns = 3 + reelIndex;              // more turns for later reels
  const oEnd = oStart + fullTurns + (N - 3) / N; // lands frac exactly on (N-1.5)/N

  return { N, cells, oStart, oEnd, dur, easeName, ease: EASES[easeName] };
}

/* Offset (in texture turns) at elapsed ms into the plan. */
export function planOffsetAt(plan, tMs) {
  const p = plan.ease(clamp01(tMs / plan.dur));
  return plan.oStart + (plan.oEnd - plan.oStart) * p;
}

/* Normalized speed 0..1 at elapsed ms (for the blur ghost layer). */
export function planSpeed01(plan, tMs) {
  const t = clamp01(tMs / plan.dur);
  const eps = 0.001;
  const d0 = plan.ease(Math.max(0, t - eps));
  const d1 = plan.ease(Math.min(1, t + eps));
  // Peak derivative of the easings is ~1.5-2; normalize generously.
  return clamp01(((d1 - d0) / (2 * eps)) / 2);
}

/* Settle-phase offset: snapped end + decaying bounce overshoot (in turns).
   st in [0,1]; bounceFrac converts the 8px bounce into texture turns. */
export function planSettleOffset(plan, st) {
  const cellFrac = 1 / plan.N;
  const bouncePx = settleBounce(st);
  const bounceTurns = (bouncePx / REEL_CELL_PX) * cellFrac; // px -> turns along scroll
  return plan.oEnd + bounceTurns;
}

/* Which cell index is at front-center for a given offset. */
export function frontCellIndex(plan, offset) {
  return Math.floor(((offset % 1) + 1) % 1 * plan.N) % plan.N;
}
