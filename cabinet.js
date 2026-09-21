/* 777 Neon Nights — canvas cabinet renderer + spin dynamics.
   Zero dependencies. Visual rebuild 2026-09-20 from the reference video:
   near-black casino + warm bokeh, chrome/glass cabinet, warm-orange neon tube
   edging, "NEON NIGHTS" neon marquee, red "JACKPOT!" sign with blue side panels,
   three cream reels (cherries/lemons/bells/red 7s — no leaf), 7 push buttons
   (red = SPIN), dark tray where golden tokens pour on jackpot.

   60fps strategy: everything static is pre-rendered to offscreen canvases at
   init (bg, cabinet body, sign-on overlay, reel overlay, symbol sprites, token
   sprites, button states). Per frame we only: blit layers, draw 3 reel strips,
   sign-flare overlay, meter text, tokens/sparks, watermark, camera transform.

   Pure animation helpers at the top are unit-tested in cabinet-anim.test.js
   (node). The DOM/rAF part only runs in a browser with the #cabinetCanvas. */
(function () {
"use strict";

/* ================= pure helpers (node-testable) ================= */
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function easeInOutCubic(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
function easeOutQuart(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 4); }
/* settle bounce: overshoot ~8px decaying to 0 across t in [0,1].
   (1-t)*sin(pi t) peaks at 0.57923, so normalize to make the peak exactly 8. */
const SETTLE_NORM = 1 / 0.57923;
function settleBounce(t) { t = clamp01(t); return 8 * SETTLE_NORM * (1 - t) * Math.sin(Math.PI * t); }
/* camera push-in 1.0 -> 1.18 */
function cameraScale(t) { return 1 + 0.18 * easeOutCubic(t); }
/* per-reel spin durations (ms). Near-miss anticipation: reels 1-2 middle are
   7s -> reel 3 runs longer and decelerates (easeOutQuart) before stopping. */
function reelDurations(middle) {
  const d = [1100, 1650, 2200];
  if (middle && middle[0] === "seven" && middle[1] === "seven") d[2] = Math.round(2200 * 1.8);
  return d;
}
/* motion-blur ghost alpha from normalized reel speed 0..1 */
function blurAlpha(speed01) { return Math.min(0.55, Math.max(0, speed01) * 0.55); }
/* token mound height (logical px) at x, fill 0..1 */
function tokenMound(x, fill) {
  const dx = (x - 240) / 115;
  return Math.max(0, 78 * Math.max(0, Math.min(1, fill)) * Math.exp(-dx * dx));
}

const HELPERS = { clamp01, easeInOutCubic, easeOutCubic, easeOutQuart,
  settleBounce, cameraScale, reelDurations, blurAlpha, tokenMound };
if (typeof module !== "undefined" && module.exports) module.exports = HELPERS;

/* ================= browser renderer ================= */
if (typeof window === "undefined" || typeof document === "undefined") return;

const W = 480, H = 880;                 // logical canvas size (portrait, like ref frames)
const CELL = 84;                        // reel cell height (logical px)
const TRAY_FLOOR = 700;                 // tray glass floor (logical px)

const LAYOUT = {
  body:   { x: 14, y: 10, w: 452, h: 860, r: 30 },
  tube:   { x: 26, y: 22, w: 428, h: 836, r: 24 },   // warm-orange neon edging
  marquee:{ x: 46, y: 38, w: 388, h: 96, r: 12 },
  sign:   { x: 66, y: 150, w: 348, h: 56, r: 8 },
  blueL:  { x: 46, y: 156, w: 20, h: 44 },
  blueR:  { x: 414, y: 156, w: 20, h: 44 },
  reels:  { x: 46, y: 224, w: 388, h: 262 },
  btnRow: { y: 502, h: 46, x0: 40, w: 52, gap: 6 },
  tray:   { x: 46, y: 568, w: 388, h: 150, r: 10 },
  base:   { x: 14, y: 734, w: 452, h: 136 },
};
const BTN_COLORS = ["#d61c2c", "#efe9da", "#facc2a", "#f5e9dc", "#efe9da", "#6a3ec8", "#facc2a"];
const BTN_NAMES  = ["spin", null, null, null, null, null, null]; // only red is wired; rest are machine dressing

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function neonText(ctx, text, x, y, font, core, halo, haloW) {
  ctx.save();
  ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // halo passes
  ctx.strokeStyle = halo; ctx.globalAlpha = 0.35; ctx.lineWidth = haloW * 2.6;
  ctx.strokeText(text, x, y);
  ctx.globalAlpha = 0.75; ctx.lineWidth = haloW * 1.4;
  ctx.strokeText(text, x, y);
  // bright core
  ctx.globalAlpha = 1; ctx.fillStyle = core;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const CAB = {
  canvas: null, ctx: null, dpr: 1,
  layers: {}, sprites: {},
  reels: [],            // {cells:[ids], offset, target, state, t0, dur, ease, settled, settleT0}
  rest: [["lemon","cherry","bell"],["bell","cherry","bell"],["cherry","seven","lemon"]],
  camS: 1, camT0: 0, camMode: "rest",   // rest | push | relax
  flare: 0, flareMode: "off",           // off | spin | jackpot
  celebrating: false, celebT0: 0,
  tokens: [], settled: [], sparks: [],
  spinsLeft: 30, canSpin: true,
  redPressed: false, focused: false,
  spinCb: null,
  deltas: [], lastT: 0,
  raf: 0, running: false,
};

/* ---------- symbol sprites (2x of CELL) ---------- */
function makeSprite(draw) {
  const s = CELL * 2, c = document.createElement("canvas");
  c.width = s; c.height = s;
  const x = c.getContext("2d");
  x.scale(2, 2);
  draw(x, CELL);
  return c;
}
function drawSeven(x, s) {
  x.font = "900 62px 'Arial Black', Arial, sans-serif";
  x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
  x.strokeStyle = "#7a0d0d"; x.lineWidth = 7; x.strokeText("7", s / 2, s / 2 + 2);
  x.fillStyle = "#e02323"; x.fillText("7", s / 2, s / 2 + 2);
  x.fillStyle = "rgba(255,255,255,.35)";
  x.font = "900 62px 'Arial Black', Arial, sans-serif";
  x.fillText("7", s / 2 - 1.5, s / 2);
}
function drawCherry(x, s) {
  x.lineWidth = 4; x.strokeStyle = "#2ea050"; x.lineCap = "round";
  x.beginPath(); x.moveTo(s * 0.42, s * 0.30); x.quadraticCurveTo(s * 0.52, s * 0.14, s * 0.68, s * 0.12); x.stroke();
  x.beginPath(); x.moveTo(s * 0.42, s * 0.30); x.quadraticCurveTo(s * 0.32, s * 0.16, s * 0.22, s * 0.16); x.stroke();
  const cherry = (cx, cy) => {
    x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.fillStyle = "#d61c2c"; x.fill();
    x.lineWidth = 2.5; x.strokeStyle = "#8c0e18"; x.stroke();
    x.beginPath(); x.ellipse(cx - 6, cy - 6, 4.5, 6, -0.5, 0, 7);
    x.fillStyle = "rgba(255,170,180,.85)"; x.fill();
  };
  cherry(s * 0.34, s * 0.62); cherry(s * 0.62, s * 0.66);
}
function drawLemon(x, s) {
  x.save(); x.translate(s / 2, s / 2);
  x.beginPath(); x.ellipse(0, 0, 27, 19, -0.15, 0, 7);
  x.fillStyle = "#facc2a"; x.fill();
  x.lineWidth = 3; x.strokeStyle = "#be8c0a"; x.stroke();
  x.beginPath(); x.ellipse(-8, -6, 8, 4.5, -0.4, 0, 7);
  x.fillStyle = "rgba(255,240,180,.9)"; x.fill();
  x.beginPath(); x.moveTo(26, -3); x.lineTo(36, 1); x.lineTo(26, 6); x.closePath();
  x.fillStyle = "#facc2a"; x.fill(); x.stroke();
  x.restore();
}
function drawBell(x, s) {
  x.fillStyle = "#96700f";
  x.fillRect(s / 2 - 5, s * 0.14, 10, 14);
  x.beginPath();
  x.moveTo(s * 0.26, s * 0.72); x.lineTo(s * 0.35, s * 0.30);
  x.quadraticCurveTo(s / 2, s * 0.24, s * 0.65, s * 0.30);
  x.lineTo(s * 0.74, s * 0.72); x.closePath();
  x.fillStyle = "#e8b22e"; x.fill();
  x.lineWidth = 3; x.strokeStyle = "#96700f"; x.stroke();
  x.beginPath(); x.arc(s / 2, s * 0.78, 9, 0, 7);
  x.fillStyle = "#ffdc78"; x.fill(); x.stroke();
  x.fillStyle = "rgba(255,240,190,.85)";
  x.fillRect(s * 0.40, s * 0.40, 7, 26);
}
const SYM_DRAW = { seven: drawSeven, cherry: drawCherry, lemon: drawLemon, bell: drawBell };

/* ---------- static layer pre-renders ---------- */
function buildBackground() {
  const c = document.createElement("canvas");
  c.width = W * CAB.dpr; c.height = H * CAB.dpr;
  const x = c.getContext("2d"); x.scale(CAB.dpr, CAB.dpr);
  x.fillStyle = "#060304"; x.fillRect(0, 0, W, H);
  // warm bokeh dots: draw small, upscale-blur via second pass
  const low = document.createElement("canvas"); low.width = 120; low.height = 220;
  const lx = low.getContext("2d");
  const cols = ["255,140,40", "255,90,30", "255,200,90", "200,60,30"];
  for (let i = 0; i < 70; i++) {
    const px = Math.random() * 120, py = Math.random() * 220, r = 2 + Math.random() * 7;
    const col = cols[(Math.random() * cols.length) | 0];
    const g = lx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${col},${0.25 + Math.random() * 0.4})`);
    g.addColorStop(1, `rgba(${col},0)`);
    lx.fillStyle = g; lx.beginPath(); lx.arc(px, py, r, 0, 7); lx.fill();
  }
  x.imageSmoothingEnabled = true;
  x.drawImage(low, 0, 0, W, H);   // upscale => soft blur, cheap bokeh
  // vignette
  const vg = x.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.45, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  return c;
}

function buildCabinet() {
  const c = document.createElement("canvas");
  c.width = W * CAB.dpr; c.height = H * CAB.dpr;
  const x = c.getContext("2d"); x.scale(CAB.dpr, CAB.dpr);
  const L = LAYOUT;
  // chrome/glass body
  rr(x, L.body.x, L.body.y, L.body.w, L.body.h, L.body.r);
  x.fillStyle = vgrad(x, L.body.y, L.body.y + L.body.h,
    [[0, "#2b2226"], [0.12, "#171114"], [0.5, "#0e090b"], [1, "#060304"]]);
  x.fill();
  x.lineWidth = 2; x.strokeStyle = "rgba(220,200,190,.28)"; x.stroke();
  // glass edge highlight (left)
  x.save(); rr(x, L.body.x, L.body.y, L.body.w, L.body.h, L.body.r); x.clip();
  x.fillStyle = "rgba(255,255,255,.05)";
  x.fillRect(L.body.x, L.body.y, 26, L.body.h);
  x.fillStyle = "rgba(255,255,255,.03)";
  x.fillRect(L.body.x + 30, L.body.y, 8, L.body.h);
  x.restore();
  // warm-orange neon tube edging: layered strokes + glow (pre-rendered once)
  x.save();
  x.shadowColor = "#ff7a1a"; x.shadowBlur = 26;
  rr(x, L.tube.x, L.tube.y, L.tube.w, L.tube.h, L.tube.r);
  x.lineWidth = 9; x.strokeStyle = "rgba(255,110,20,.55)"; x.stroke();
  x.shadowBlur = 12;
  x.lineWidth = 5; x.strokeStyle = "rgba(255,150,50,.9)"; x.stroke();
  x.shadowBlur = 0;
  x.lineWidth = 2.4; x.strokeStyle = "#ffe3b8"; x.stroke();   // hot core
  x.restore();
  // marquee: dark red panel + neon tube letters
  rr(x, L.marquee.x, L.marquee.y, L.marquee.w, L.marquee.h, L.marquee.r);
  x.fillStyle = vgrad(x, L.marquee.y, L.marquee.y + L.marquee.h, [[0, "#4a1214"], [1, "#200607"]]);
  x.fill();
  x.lineWidth = 2; x.strokeStyle = "rgba(255,150,60,.5)"; x.stroke();
  x.save();
  x.shadowColor = "#ff9a2a"; x.shadowBlur = 18;
  neonText(x, "NEON NIGHTS", W / 2, L.marquee.y + L.marquee.h / 2 + 2,
    "900 40px 'Arial Black', Arial, sans-serif", "#fff3d6", "#ff9a2a", 5);
  x.restore();
  // jackpot sign panel (off state baked here; bright overlay is separate)
  rr(x, L.sign.x, L.sign.y, L.sign.w, L.sign.h, L.sign.r);
  x.fillStyle = "#0a0505"; x.fill();
  x.lineWidth = 1.5; x.strokeStyle = "rgba(255,60,60,.4)"; x.stroke();
  x.save();
  x.globalAlpha = 0.5;
  neonText(x, "JACKPOT!", W / 2, L.sign.y + L.sign.h / 2 + 1,
    "900 34px 'Arial Black', Arial, sans-serif", "#5a1a1a", "#7a2020", 3);
  x.restore();
  // small blue-lit side panels (like the reference's horizontal blue strips)
  for (const bx of [L.blueL, L.blueR]) {
    x.fillStyle = "#0c0f22"; x.fillRect(bx.x, bx.y, bx.w, bx.h);
    x.save(); x.shadowColor = "#3a5aff"; x.shadowBlur = 10;
    x.fillStyle = "#5a78ff";
    for (let i = 0; i < 4; i++) x.fillRect(bx.x + 2, bx.y + 4 + i * 10, bx.w - 4, 4);
    x.restore();
  }
  // reel window frame
  rr(x, L.reels.x, L.reels.y, L.reels.w, L.reels.h, 10);
  x.fillStyle = "#080405"; x.fill();
  x.lineWidth = 3; x.strokeStyle = "rgba(220,200,190,.35)"; x.stroke();
  // push buttons row (static, unpressed)
  drawButtons(x, false);
  // tray: dark bezel + glass
  rr(x, L.tray.x, L.tray.y, L.tray.w, L.tray.h, L.tray.r);
  x.fillStyle = vgrad(x, L.tray.y, L.tray.y + L.tray.h, [[0, "#0d0708"], [1, "#050304"]]);
  x.fill();
  x.lineWidth = 2; x.strokeStyle = "rgba(220,200,190,.22)"; x.stroke();
  // tray glass sheen
  x.save(); rr(x, L.tray.x, L.tray.y, L.tray.w, L.tray.h, L.tray.r); x.clip();
  const sheen = x.createLinearGradient(L.tray.x, L.tray.y, L.tray.x + L.tray.w, L.tray.y + L.tray.h);
  sheen.addColorStop(0, "rgba(255,255,255,.06)"); sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  x.fillStyle = sheen; x.fillRect(L.tray.x, L.tray.y, L.tray.w, L.tray.h);
  x.restore();
  // base: chrome trim
  x.fillStyle = vgrad(x, L.base.y, L.base.y + L.base.h, [[0, "#241c1e"], [1, "#0a0708"]]);
  x.fillRect(L.base.x, L.base.y + 40, L.base.w, L.base.h - 40);
  x.fillStyle = "rgba(220,200,190,.18)";
  x.fillRect(L.base.x, L.base.y + 40, L.base.w, 3);
  return c;
}

function buildSignOn() {
  // bright JACKPOT! overlay, drawn per-frame with globalAlpha = flare
  const L = LAYOUT, c = document.createElement("canvas");
  c.width = W * CAB.dpr; c.height = H * CAB.dpr;
  const x = c.getContext("2d"); x.scale(CAB.dpr, CAB.dpr);
  x.save();
  x.shadowColor = "#ff2e2e"; x.shadowBlur = 22;
  neonText(x, "JACKPOT!", W / 2, L.sign.y + L.sign.h / 2 + 1,
    "900 34px 'Arial Black', Arial, sans-serif", "#ffe9e9", "#ff2e2e", 5);
  x.restore();
  return c;
}

function buildReelOverlay() {
  // drawn over the strips each frame: inner shadows, glass, win-line marker
  const L = LAYOUT, c = document.createElement("canvas");
  c.width = W * CAB.dpr; c.height = H * CAB.dpr;
  const x = c.getContext("2d"); x.scale(CAB.dpr, CAB.dpr);
  const reelW = (L.reels.w - 12) / 3;
  for (let i = 0; i < 3; i++) {
    const rx = L.reels.x + 6 + i * reelW;
    // inner top/bottom shadow
    const sh = x.createLinearGradient(0, L.reels.y + 6, 0, L.reels.y + 70);
    sh.addColorStop(0, "rgba(0,0,0,.45)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = sh; x.fillRect(rx, L.reels.y + 6, reelW, 64);
    const sh2 = x.createLinearGradient(0, L.reels.y + L.reels.h - 70, 0, L.reels.y + L.reels.h - 6);
    sh2.addColorStop(0, "rgba(0,0,0,0)"); sh2.addColorStop(1, "rgba(0,0,0,.45)");
    x.fillStyle = sh2; x.fillRect(rx, L.reels.y + L.reels.h - 70, reelW, 64);
    // chrome divider between reels
    if (i < 2) {
      const dx = rx + reelW;
      x.fillStyle = vgrad(x, L.reels.y, L.reels.y + L.reels.h, [[0, "#4a4a52"], [0.5, "#17171b"], [1, "#3a3a42"]]);
      x.fillRect(dx - 2, L.reels.y + 6, 5, L.reels.h - 12);
    }
  }
  // win-line marker across the middle row
  const my = L.reels.y + 6 + CELL * 1.5;
  x.save(); x.shadowColor = "#ff3c3c"; x.shadowBlur = 8;
  x.fillStyle = "rgba(255,60,60,.85)";
  x.fillRect(L.reels.x + 8, my - 2, L.reels.w - 16, 3);
  x.restore();
  // glass reflection
  x.save();
  x.beginPath(); x.rect(L.reels.x + 6, L.reels.y + 6, L.reels.w - 12, L.reels.h - 12); x.clip();
  const gl = x.createLinearGradient(L.reels.x, L.reels.y, L.reels.x + L.reels.w, L.reels.y + L.reels.h);
  gl.addColorStop(0, "rgba(255,255,255,.10)"); gl.addColorStop(0.35, "rgba(255,255,255,0)");
  x.fillStyle = gl; x.fillRect(L.reels.x + 6, L.reels.y + 6, L.reels.w - 12, L.reels.h - 12);
  x.restore();
  return c;
}

function buildReelBg() {
  const L = LAYOUT, reelW = (L.reels.w - 12) / 3;
  const c = document.createElement("canvas");
  const s = 2;
  c.width = reelW * s; c.height = (L.reels.h - 12) * s;
  const x = c.getContext("2d"); x.scale(s, s);
  const g = x.createLinearGradient(0, 0, 0, L.reels.h - 12);
  g.addColorStop(0, "#fbf6ea"); g.addColorStop(0.5, "#f3ecdb"); g.addColorStop(1, "#e9dfc9");
  x.fillStyle = g; x.fillRect(0, 0, reelW, L.reels.h - 12);
  return c;
}

function drawButtons(x, pressedRed) {
  const B = LAYOUT.btnRow;
  for (let i = 0; i < 7; i++) {
    const bx = B.x0 + i * (B.w + B.gap), by = B.y, bw = B.w, bh = B.h;
    const pressed = pressedRed && i === 0;
    const col = BTN_COLORS[i];
    // bezel
    rr(x, bx - 3, by - 3, bw + 6, bh + 8, 10);
    x.fillStyle = "#0c0a0b"; x.fill();
    // button body
    const yy = pressed ? by + 4 : by;
    rr(x, bx, yy, bw, bh - (pressed ? 4 : 0), 8);
    x.fillStyle = vgrad(x, yy, yy + bh, [[0, lighten(col)], [0.5, col], [1, darken(col)]]);
    x.fill();
    if (i === 0 && !pressed) { x.save(); x.shadowColor = "#ff2e2e"; x.shadowBlur = 12; rr(x, bx, yy, bw, bh, 8); x.strokeStyle = "rgba(255,80,80,.8)"; x.lineWidth = 2; x.stroke(); x.restore(); }
    // top highlight
    rr(x, bx + 5, yy + 3, bw - 10, 8, 4);
    x.fillStyle = "rgba(255,255,255,.35)"; x.fill();
  }
}
function lighten(hex) { return shade(hex, 38); }
function darken(hex) { return shade(hex, -34); }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function buildTokenSprites() {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const c = document.createElement("canvas"); c.width = c.height = 44;
    const x = c.getContext("2d"); x.scale(2, 2);
    const g = x.createRadialGradient(8, 8, 1, 11, 11, 11);
    g.addColorStop(0, "#ffe9a0"); g.addColorStop(0.6, "#f5b81e"); g.addColorStop(1, "#a86e08");
    x.fillStyle = g; x.beginPath(); x.arc(11, 11, 10, 0, 7); x.fill();
    x.lineWidth = 2; x.strokeStyle = "#7a5205"; x.stroke();
    x.fillStyle = "rgba(122,82,5,.9)";
    x.font = "900 11px Arial"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(v === 2 ? "★" : "7", 11, 11.5);
    out.push(c);
  }
  return out;
}

/* ---------- reel strip state ---------- */
function reelX(i) {
  const L = LAYOUT, reelW = (L.reels.w - 12) / 3;
  return { x: L.reels.x + 6 + i * reelW, y: L.reels.y + 6, w: reelW, h: L.reels.h - 12 };
}
function randId() {
  const syms = (window.NN_CONFIG && window.NN_CONFIG.symbols) || [{ id: "seven", weight: 1 }];
  let tot = 0; for (const s of syms) tot += s.weight;
  let r = Math.random() * tot;
  for (const s of syms) { r -= s.weight; if (r < 0) return s.id; }
  return syms[0].id;
}

CAB.init = function () {
  CAB.canvas = document.getElementById("cabinetCanvas");
  if (!CAB.canvas) return false;
  CAB.dpr = Math.min(2, window.devicePixelRatio || 1);
  CAB.canvas.width = W * CAB.dpr; CAB.canvas.height = H * CAB.dpr;
  CAB.ctx = CAB.canvas.getContext("2d");
  CAB.ctx.scale(CAB.dpr, CAB.dpr);
  CAB.layers.bg = buildBackground();
  CAB.layers.cabinet = buildCabinet();
  CAB.layers.signOn = buildSignOn();
  CAB.layers.reelOverlay = buildReelOverlay();
  CAB.layers.reelBg = buildReelBg();
  CAB.sprites = {
    seven: makeSprite(drawSeven), cherry: makeSprite(drawCherry),
    lemon: makeSprite(drawLemon), bell: makeSprite(drawBell),
  };
  // red pressed button overlay
  const bp = document.createElement("canvas");
  bp.width = W * CAB.dpr; bp.height = H * CAB.dpr;
  const bx = bp.getContext("2d"); bx.scale(CAB.dpr, CAB.dpr);
  drawButtons(bx, true);
  CAB.layers.buttonsPressed = bp;
  CAB.sprites.tokens = buildTokenSprites();
  CAB.reels = [0, 1, 2].map(() => ({ cells: [], offset: 0, target: 0, state: "idle", t0: 0, dur: 0, ease: easeInOutCubic, settleT0: 0 }));
  CAB.setRest(CAB.rest);
  bindInput();
  if (!CAB.running) { CAB.running = true; CAB.lastT = performance.now(); requestAnimationFrame(tick); }
  return true;
};

CAB.setRest = function (rows) {
  CAB.rest = rows;
  for (let i = 0; i < 3; i++) {
    CAB.reels[i].cells = rows[i].slice();
    CAB.reels[i].offset = 0; CAB.reels[i].target = 0;
    CAB.reels[i].state = "idle";
  }
};

/* Spin the reels to the final 3x3 (rows[reel] = 3 visible symbols).
   Returns a promise that resolves when all reels have stopped + settled. */
CAB.spin = function (rows) {
  return new Promise((resolve) => {
    try {
      const middle = [rows[0][1], rows[1][1], rows[2][1]];
      const durs = reelDurations(middle);
      const now = performance.now();
      for (let i = 0; i < 3; i++) {
        const R = CAB.reels[i];
        const filler = [];
        const n = 12 + i * 5;
        for (let k = 0; k < n; k++) filler.push(randId());
        R.cells = filler.concat(rows[i].slice());
        R.offset = 0;
        R.target = (R.cells.length - 3) * CELL;
        R.state = "spinning";
        R.t0 = now;
        R.dur = durs[i];
        R.ease = (i === 2 && durs[2] > 2200) ? easeOutQuart : easeInOutCubic;
      }
      CAB.camMode = "push"; CAB.camT0 = now;
      CAB.flareMode = "spin";
      CAB._resolveSpin = resolve;
      CAB._spinStart = now;
    } catch (e) { resolve(); }
  });
};

CAB.setSignFlare = function (v) {
  CAB.flare = v ? 1 : 0;
  if (!v) CAB.flareMode = "off";
};
CAB.setSpins = function (n, ok) {
  CAB.spinsLeft = n; CAB.canSpin = !!ok;
  if (CAB.canvas) CAB.canvas.setAttribute("aria-label",
    "777 Neon Nights slot cabinet. " + n + " spins left. Press Enter on the red button to spin.");
};
CAB.onSpinRequest = function (cb) { CAB.spinCb = cb; };

CAB.celebrate = function () {
  CAB.celebrating = true; CAB.celebT0 = performance.now();
  CAB.tokens = []; CAB.settled = []; CAB.sparks = [];
  CAB.flareMode = "jackpot";
  CAB.camMode = "celebrate";
};
CAB.endCelebrate = function () {
  CAB.celebrating = false; CAB.flareMode = "off"; CAB.flare = 0;
  CAB.camMode = "relax"; CAB.camT0 = performance.now();
};

/* ---------- input: canvas hit-test on the red button ---------- */
function canvasPos(e) {
  const r = CAB.canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
function redRect() {
  const B = LAYOUT.btnRow;
  return { x: B.x0 - 6, y: B.y - 8, w: B.w + 12, h: B.h + 16 };
}
function inRed(p) {
  const q = redRect();
  return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h;
}
function bindInput() {
  const cv = CAB.canvas;
  cv.addEventListener("pointerdown", (e) => {
    const p = canvasPos(e);
    if (inRed(p)) { CAB.redPressed = true; }
  });
  const up = (e) => {
    if (CAB.redPressed) {
      CAB.redPressed = false;
      if (e && inRed(canvasPos(e)) && CAB.spinCb) CAB.spinCb();
    }
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", () => { CAB.redPressed = false; });
  cv.addEventListener("pointerleave", () => { CAB.redPressed = false; });
  cv.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      CAB.redPressed = true;
      setTimeout(() => { CAB.redPressed = false; if (CAB.spinCb) CAB.spinCb(); }, 120);
    }
  });
  cv.addEventListener("focus", () => { CAB.focused = true; });
  cv.addEventListener("blur", () => { CAB.focused = false; });
}

/* ---------- tokens / sparks ---------- */
function spawnToken(now) {
  CAB.tokens.push({
    x: 120 + Math.random() * 240, y: 500,
    vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 220,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10,
    v: (Math.random() * 3) | 0,
  });
}
function updateTokens(dt, now) {
  const fill = Math.min(1, CAB.settled.length / 150);
  for (let i = CAB.tokens.length - 1; i >= 0; i--) {
    const t = CAB.tokens[i];
    t.vy += 1500 * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.rot += t.vr * dt;
    const floor = TRAY_FLOOR - tokenMound(t.x, fill) - 8;
    if (t.y >= floor) {
      CAB.settled.push({ x: t.x, y: floor - 4, rot: t.rot, v: t.v });
      CAB.tokens.splice(i, 1);
    }
  }
  // sparks rise off the mound
  if (CAB.sparks.length < 42 && Math.random() < 0.6) {
    CAB.sparks.push({
      x: 140 + Math.random() * 200, y: TRAY_FLOOR - tokenMound(240, fill) - 10,
      vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 120,
      life: 0.7 + Math.random() * 0.5, age: 0,
    });
  }
  for (let i = CAB.sparks.length - 1; i >= 0; i--) {
    const s = CAB.sparks[i];
    s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.age >= s.life) CAB.sparks.splice(i, 1);
  }
}

/* ---------- per-frame draw ---------- */
function drawSymbol(id, cx, cy, alpha) {
  const sp = CAB.sprites[id];
  if (!sp) return;
  const ctx = CAB.ctx, s = CELL * 0.92;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sp, cx - s / 2, cy - s / 2, s, s);
  ctx.restore();
}
function drawReels(now) {
  const ctx = CAB.ctx;
  for (let i = 0; i < 3; i++) {
    const R = CAB.reels[i], g = reelX(i);
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
    ctx.drawImage(CAB.layers.reelBg, g.x, g.y, g.w, g.h);
    // reel speed (for motion blur): derivative of offset
    let speed01 = 0;
    if (R.state === "spinning") {
      const t = clamp01((now - R.t0) / R.dur);
      // numeric derivative of the ease curve
      const e1 = R.ease(Math.min(1, t + 0.02)), e0 = R.ease(Math.max(0, t - 0.02));
      speed01 = Math.min(1, ((e1 - e0) / 0.04) * (R.dur / 2600));
    }
    const ba = blurAlpha(speed01);
    for (let k = 0; k < R.cells.length; k++) {
      const cy = g.y + k * CELL - R.offset + CELL / 2;
      if (cy < g.y - CELL * 1.5 || cy > g.y + g.h + CELL * 1.5) continue;
      const id = R.cells[k], cx = g.x + g.w / 2;
      if (ba > 0.03) {
        // vertical motion-blur ghosts: stretched + offset copies
        ctx.save(); ctx.globalAlpha = ba * 0.55;
        const sp = CAB.sprites[id], s = CELL * 0.92;
        if (sp) ctx.drawImage(sp, cx - s / 2, cy - s * 0.72, s, s * 1.44);
        ctx.restore();
        drawSymbol(id, cx, cy - 16, ba * 0.5);
        drawSymbol(id, cx, cy + 16, ba * 0.5);
      }
      drawSymbol(id, cx, cy, 1);
    }
    ctx.restore();
  }
  // static overlay: shadows, dividers, win-line, glass
  ctx.drawImage(CAB.layers.reelOverlay, 0, 0, W, H);
}

function drawMeter() {
  const ctx = CAB.ctx, L = LAYOUT;
  ctx.save();
  ctx.font = "700 13px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,200,120,.55)";
  ctx.fillText("SPINS", L.tray.x + 14, L.tray.y + 24);
  ctx.font = "900 26px 'Courier New', monospace";
  ctx.fillStyle = CAB.canSpin ? "#ffd34d" : "#8a6a4a";
  ctx.shadowColor = "#ff9a2a"; ctx.shadowBlur = CAB.canSpin ? 10 : 0;
  ctx.fillText(String(CAB.spinsLeft).padStart(2, "0"), L.tray.x + 14, L.tray.y + 50);
  ctx.restore();
}

function drawTokens() {
  const ctx = CAB.ctx;
  for (const t of CAB.settled) {
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.rot);
    ctx.drawImage(CAB.sprites.tokens[t.v], -11, -11, 22, 22);
    ctx.restore();
  }
  for (const t of CAB.tokens) {
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.rot);
    ctx.drawImage(CAB.sprites.tokens[t.v], -11, -11, 22, 22);
    ctx.restore();
  }
  // sparks (additive)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const s of CAB.sparks) {
    const a = 1 - s.age / s.life;
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = "#ffcf5a";
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.4 * a + 0.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawWatermark(now) {
  if (!CAB.celebrating) return;
  const ctx = CAB.ctx;
  const a = 0.45 + 0.25 * Math.sin((now - CAB.celebT0) / 1000 * Math.PI * 3);
  ctx.save();
  ctx.globalAlpha = Math.max(0.2, a);
  ctx.font = "800 17px Arial"; ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
  ctx.fillText("@CUMULATIVEWEB", W / 2, LAYOUT.tray.y - 12);
  ctx.restore();
}

function tick(now) {
  const dt = Math.min(0.05, (now - CAB.lastT) / 1000);
  CAB.lastT = now;
  CAB.deltas.push(now - (CAB._prevT || now)); CAB._prevT = now;
  if (CAB.deltas.length > 600) CAB.deltas.shift();

  const ctx = CAB.ctx;
  // advance reel animations
  let allStopped = true;
  for (let i = 0; i < 3; i++) {
    const R = CAB.reels[i];
    if (R.state === "spinning") {
      const t = clamp01((now - R.t0) / R.dur);
      R.offset = R.target * R.ease(t);
      if (t >= 1) { R.state = "settling"; R.settleT0 = now; }
      else allStopped = false;
    } else if (R.state === "settling") {
      const st = clamp01((now - R.settleT0) / 240);
      R.offset = R.target + settleBounce(st);
      if (st >= 1) { R.offset = R.target; R.state = "idle"; }
      else allStopped = false;
    }
  }
  if (CAB._resolveSpin && allStopped && CAB.reels.every(r => r.state === "idle")) {
    const res = CAB._resolveSpin; CAB._resolveSpin = null;
    CAB.camMode = "relax"; CAB.camT0 = now;
    if (CAB.flareMode === "spin") { CAB.flareMode = "off"; CAB.flare = 0; }
    res();
  }

  // camera
  if (CAB.camMode === "push") CAB.camS = cameraScale(clamp01((now - CAB.camT0) / 600));
  else if (CAB.camMode === "celebrate") CAB.camS += (1.06 - CAB.camS) * Math.min(1, dt * 4);
  else if (CAB.camMode === "relax") CAB.camS = 1.18 - 0.18 * easeInOutCubic(clamp01((now - CAB.camT0) / 900));
  else CAB.camS = 1;

  // celebration particles
  if (CAB.celebrating) {
    if (now - CAB.celebT0 < 1400 && CAB.settled.length < 150) {
      for (let k = 0; k < 3; k++) spawnToken(now);
    }
    updateTokens(dt, now);
  }

  // sign flare pulse
  let flareA = 0;
  if (CAB.flareMode === "spin") flareA = 0.65 + 0.35 * Math.abs(Math.sin(now / 90));
  else if (CAB.flareMode === "jackpot") flareA = 0.75 + 0.25 * Math.sin(now / 210);

  // ---- draw ----
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(CAB.layers.bg, 0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.42); ctx.scale(CAB.camS, CAB.camS); ctx.translate(-W / 2, -H * 0.42);
  ctx.drawImage(CAB.layers.cabinet, 0, 0, W, H);
  if (flareA > 0.01) { ctx.save(); ctx.globalAlpha = flareA; ctx.drawImage(CAB.layers.signOn, 0, 0, W, H); ctx.restore(); }
  drawReels(now);
  if (CAB.redPressed) ctx.drawImage(CAB.layers.buttonsPressed, 0, 0, W, H);
  if (CAB.focused) {
    const q = redRect();
    ctx.save(); ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 3;
    ctx.shadowColor = "#ffd34d"; ctx.shadowBlur = 10;
    rr(ctx, q.x - 4, q.y - 4, q.w + 8, q.h + 8, 12); ctx.stroke(); ctx.restore();
  }
  drawMeter();
  drawTokens();
  drawWatermark(now);
  ctx.restore();

  CAB.raf = requestAnimationFrame(tick);
}

CAB.fpsStats = function () {
  const d = CAB.deltas.filter(v => v > 0 && v < 250);
  if (!d.length) return { frames: 0, avg: 0, p95: 0 };
  const sorted = d.slice().sort((a, b) => a - b);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { frames: d.length, avg: +(1000 / mean).toFixed(1), p95: +(1000 / p95).toFixed(1) };
};

window.NN_CABINET = CAB;
})();
