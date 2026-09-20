/* 777 Neon Nights — 3D cabinet renderer (Three.js 0.160.0, vendored).
   Full 3D rebuild 2026-09-20 from the reference video: dark casino + warm bokeh,
   chrome/glass cabinet (PBR + RoomEnvironment reflections), warm-orange neon tube
   edging, NEON NIGHTS marquee, red JACKPOT! sign with blue side panels, three
   reel wheels (cherries/lemons/bells/red 7s — no leaf), one large centered
   glossy-green SPIN button (translated label, blue/purple glowing rim,
   raycast tap — no auto-spin), dark tray with golden token pour +
   @CUMULATIVEWEB watermark.

   API surface (identical to the old 2D cabinet so game.js is untouched):
     window.NN_CABINET = { init()->bool, setRest(rows), spin(rows)->Promise,
       celebrate(), endCelebrate(), setSpins(n,ok), setSignFlare(v),
       onSpinRequest(cb), fpsStats()->{frames,avg,p95} }
   rows[reel] = [top, middle, bottom] symbol ids.

   Reliability (the iPhone post-mortem): if WebGL is unavailable the module
   installs a VISIBLE DOM-reel implementation of the same API — never a blank
   dead page. Module-load failure is surfaced by index.html's boot watchdog.

   Bloom config (evidence-backed, see vendor/three/README.md — do not improvise):
   DPR <= 1.5 on mobile / 2 desktop; UnrealBloomPass(half-res, 0.9, 0.45, 1.0);
   only emissives with intensity 2-10 + toneMapped:false bloom; chain
   RenderPass -> Bloom -> OutputPass. Runtime FPS kill-switch: rolling 2s FPS
   < 50 -> bypass composer (direct render) + additive glow sprites. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  clamp01, easeInOutCubic, easeOutCubic, easeOutQuart, settleBounce, cameraScale,
  reelDurations, blurAlpha, reelSpinPlan, planOffsetAt, planSpeed01, planSettleOffset,
  tokenMound, spinLabelFor, SPIN_BUTTON,
  REEL_CELLS, REEL_RADIUS, REEL_WIDTH, REEL_PX_PER_UNIT,
} from './cabinet-anim.js';

const SYMS = ['seven', 'cherry', 'lemon', 'bell']; // reel symbols only — no leaf
const NEON_ORANGE = 0xff7a1a;
const isMobile = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
  || Math.min(window.innerWidth, window.innerHeight) < 820;

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

/* ================= procedural canvas textures ================= */
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function drawSymbol2D(x, id, cx, cy, s) {
  // draws one symbol centered at (cx,cy), size s — shared by reel strips
  x.save(); x.translate(cx, cy);
  if (id === 'seven') {
    x.font = `900 ${s * 0.92}px "Arial Black", Arial, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = s * 0.09; x.strokeStyle = '#ffffff'; x.lineJoin = 'round';
    x.strokeText('7', 0, s * 0.04);
    x.fillStyle = '#e21a1a'; x.fillText('7', 0, s * 0.04);
  } else if (id === 'cherry') {
    x.strokeStyle = '#2ea050'; x.lineWidth = s * 0.06; x.lineCap = 'round';
    x.beginPath(); x.moveTo(0, -s * 0.34); x.quadraticCurveTo(s * 0.18, -s * 0.44, s * 0.3, -s * 0.46); x.stroke();
    x.beginPath(); x.moveTo(0, -s * 0.34); x.quadraticCurveTo(-s * 0.16, -s * 0.42, -s * 0.28, -s * 0.42); x.stroke();
    for (const dx of [-s * 0.16, s * 0.16]) {
      const g = x.createRadialGradient(dx - s * 0.05, s * 0.1, s * 0.02, dx, s * 0.12, s * 0.2);
      g.addColorStop(0, '#ff6b74'); g.addColorStop(1, '#c01424');
      x.fillStyle = g; x.beginPath(); x.arc(dx, s * 0.14, s * 0.2, 0, 7); x.fill();
      x.strokeStyle = '#8c0e18'; x.lineWidth = s * 0.03; x.stroke();
    }
  } else if (id === 'lemon') {
    x.fillStyle = '#facc2a'; x.strokeStyle = '#be8c0a'; x.lineWidth = s * 0.045;
    x.beginPath(); x.ellipse(0, 0, s * 0.36, s * 0.26, 0, 0, 7); x.fill(); x.stroke();
    x.fillStyle = '#ffeaa8';
    x.beginPath(); x.ellipse(-s * 0.12, -s * 0.07, s * 0.1, s * 0.06, -0.3, 0, 7); x.fill();
  } else { // bell
    x.fillStyle = '#96700f';
    x.fillRect(-s * 0.06, -s * 0.42, s * 0.12, s * 0.16);
    const g = x.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
    g.addColorStop(0, '#b98a1e'); g.addColorStop(0.5, '#ffdc78'); g.addColorStop(1, '#b98a1e');
    x.fillStyle = g; x.strokeStyle = '#96700f'; x.lineWidth = s * 0.04;
    x.beginPath();
    x.moveTo(-s * 0.28, s * 0.3); x.lineTo(-s * 0.16, -s * 0.24);
    x.quadraticCurveTo(0, -s * 0.32, s * 0.16, -s * 0.24);
    x.lineTo(s * 0.28, s * 0.3); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#ffdc78';
    x.beginPath(); x.arc(0, s * 0.36, s * 0.1, 0, 7); x.fill(); x.stroke();
  }
  x.restore();
}

/* Reel strip: N cells laid along u (canvas x = around the wheel = screen
   vertical on the front face). Symbols are drawn rotated +90deg in canvas
   space so they read upright on screen (canvas +x == screen up after the
   cylinder's rotation.z = PI/2). Cell canvas size follows the anim module's
   REEL_* contract so px/unit is uniform (no stretch). */
function reelStripTexture(cells) {
  const N = cells.length;
  const cw = Math.round((2 * Math.PI * REEL_RADIUS / N) * REEL_PX_PER_UNIT);
  const chh = Math.round(REEL_WIDTH * REEL_PX_PER_UNIT);
  const c = cnv(N * cw, chh), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, chh);
  g.addColorStop(0, '#efe9db'); g.addColorStop(0.5, '#fbf7ec'); g.addColorStop(1, '#ddd5c2');
  x.fillStyle = g; x.fillRect(0, 0, N * cw, chh);
  for (let i = 0; i < N; i++) {
    x.save();
    x.translate(i * cw + cw / 2, chh / 2);
    x.rotate(Math.PI / 2); // symbol-up -> canvas +x -> screen up
    drawSymbol2D(x, cells[i], 0, 0, Math.min(cw, chh) * 0.8);
    x.restore();
    x.fillStyle = 'rgba(60,50,40,0.25)'; x.fillRect(i * cw, 0, 2, chh);
  }
  const t = toTex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* Dark-red marquee with warm tube letters. */
function marqueeTexture() {
  const c = cnv(1024, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3a0d0d'); g.addColorStop(0.5, '#2a0808'); g.addColorStop(1, '#1c0505');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = 'rgba(255,140,60,0.5)'; x.lineWidth = 6;
  x.strokeRect(14, 14, 996, 228);
  x.font = '900 118px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const label = 'NEON NIGHTS';
  x.shadowColor = '#ff6a00'; x.shadowBlur = 42;
  x.strokeStyle = '#ff7a1a'; x.lineWidth = 10; x.strokeText(label, 512, 134);
  x.shadowBlur = 18;
  x.strokeStyle = '#ffc46b'; x.lineWidth = 5; x.strokeText(label, 512, 134);
  x.shadowBlur = 0;
  x.fillStyle = '#ffd9a0'; x.fillText(label, 512, 134);
  return toTex(c);
}

/* Red JACKPOT! sign face. */
function jackpotTexture() {
  const c = cnv(1024, 168), x = c.getContext('2d');
  x.fillStyle = '#160404'; x.fillRect(0, 0, 1024, 168);
  x.font = '900 104px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.shadowColor = '#ff2211'; x.shadowBlur = 36;
  x.strokeStyle = '#ff2a1a'; x.lineWidth = 9; x.strokeText('JACKPOT!', 512, 88);
  x.shadowBlur = 14;
  x.strokeStyle = '#ff9a8a'; x.lineWidth = 4; x.strokeText('JACKPOT!', 512, 88);
  x.shadowBlur = 0;
  x.fillStyle = '#ffe3de'; x.fillText('JACKPOT!', 512, 88);
  return toTex(c);
}

/* Spins meter plate on the tray. */
function meterTexture(n) {
  const c = cnv(512, 128), x = c.getContext('2d');
  x.fillStyle = '#0b0b0e'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#3d3d4a'; x.lineWidth = 4; x.strokeRect(6, 6, 500, 116);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 44px Arial, sans-serif'; x.fillStyle = '#8f8fa0';
  x.fillText('SPINS', 256, 34);
  x.font = '900 64px "Arial Black", Arial, sans-serif'; x.fillStyle = '#ffd34d';
  x.fillText(String(n).padStart(2, '0'), 256, 86);
  return toTex(c);
}

/* Dark casino backdrop with warm bokeh. */
function backdropTexture() {
  const c = cnv(1024, 1024), x = c.getContext('2d');
  const g = x.createRadialGradient(512, 420, 60, 512, 512, 720);
  g.addColorStop(0, '#241419'); g.addColorStop(0.55, '#120a10'); g.addColorStop(1, '#050306');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
  const cols = ['#ff9a3c', '#ff6a2a', '#ffc46b', '#ff4d6a', '#7a4dff'];
  let seed = 777;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const r = 6 + rnd() * 46, bx = rnd() * 1024, by = rnd() * 1024;
    const col = cols[(rnd() * cols.length) | 0];
    const rg = x.createRadialGradient(bx, by, 0, bx, by, r);
    rg.addColorStop(0, col + 'cc'); rg.addColorStop(0.6, col + '44'); rg.addColorStop(1, col + '00');
    x.fillStyle = rg; x.beginPath(); x.arc(bx, by, r, 0, 7); x.fill();
  }
  // vignette
  const v = x.createRadialGradient(512, 512, 300, 512, 512, 760);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = v; x.fillRect(0, 0, 1024, 1024);
  return toTex(c);
}

/* Soft radial glow sprite (fallback glow + token sprite base). */
function glowTexture(inner, outer) {
  const c = cnv(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, inner); g.addColorStop(0.4, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return toTex(c);
}

function watermarkTexture() {
  const c = cnv(1024, 128), x = c.getContext('2d');
  x.clearRect(0, 0, 1024, 128);
  x.font = '700 64px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,220,150,0.95)';
  x.fillText('@CUMULATIVEWEB', 512, 64);
  return toTex(c);
}

/* ================= WebGL cabinet ================= */
function roundedRectPoints(w, h, r, seg) {
  const pts = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0], [-(w / 2 - r), h / 2 - r, Math.PI / 2],
    [-(w / 2 - r), -(h / 2 - r), Math.PI], [w / 2 - r, -(h / 2 - r), Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * Math.PI / 2;
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0));
    }
  return new THREE.CatmullRomCurve3(pts, true);
}

/* Rounded-rectangle outline traced onto a Shape or Path (same API), for
   extruded button bodies and rim rings. */
function traceRoundedRect(t, w, h, r) {
  const x = -w / 2, y = -h / 2;
  t.moveTo(x + r, y);
  t.lineTo(x + w - r, y);
  t.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  t.lineTo(x + w, y + h - r);
  t.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  t.lineTo(x + r, y + h);
  t.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  t.lineTo(x, y + r);
  t.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return t;
}
function roundedRectShape(w, h, r) { return traceRoundedRect(new THREE.Shape(), w, h, r); }

function makeWebGLCabinet() {
  const S = {
    renderer: null, scene: null, camera: null, composer: null, bloomPass: null,
    useComposer: true, canvas: null, container: null,
    reels: [],            // {group, mesh, ghost, tex, plan, state, t0, settleT0, rest:[ids]}
    rest: [['lemon', 'cherry', 'bell'], ['bell', 'cherry', 'bell'], ['cherry', 'seven', 'lemon']],
    camBase: 16, camPush: 1, camT0: 0, camMode: 'rest',
    flare: 0, flareMode: 'off',
    celebrating: false, celebT0: 0,
    tokens: null, tokenData: [], settledCount: 0, mound: null, sparks: null, sparkData: [],
    spinsLeft: 30, canSpin: true, spinCb: null,
    deltas: [], lastT: 0, frames2s: 0, t2s: -1,
    spinBtn: null, spinPress: null, spinLabel: null, spinLabelMat: null,
    spinLabelTex: null, spinLabelText: '', btnMeshes: [], spinPressed: false,
    signMat: null, tubeMat: null, marqueeMat: null, meterTex: null, meterMat: null,
    wmMat: null, glowSprites: [],
    _resolveSpin: null, raf: 0, running: false,
    settled: [], // compat
  };

  const FOV = 35, CAB_W = 4.9, CAB_H = 9.4;

  /* Spin-button label i18n: the cabinet reads the game's language key and
     listens for game.js's nn777-lang event so the 3D label follows the
     selected language without touching the CAB public API. */
  function currentLang() {
    try { return localStorage.getItem('nn777-lang-v1') || 'en'; } catch (e) { return 'en'; }
  }
  function spinLabelTexture(text) {
    const rtl = (() => { try { return !!(window.NN_I18N && window.NN_I18N[currentLang()] && window.NN_I18N[currentLang()].rtl); } catch (e) { return false; } })();
    const c = cnv(1024, 384), x = c.getContext('2d');
    x.clearRect(0, 0, 1024, 384);
    try { x.direction = rtl ? 'rtl' : 'ltr'; } catch (e) {}
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.lineJoin = 'round';
    let size = 230;
    const setF = (s) => { x.font = `900 ${s}px "Arial Black", Arial, sans-serif`; };
    setF(size);
    while (x.measureText(text).width > 960 && size > 60) { size -= 10; setF(size); }
    x.lineWidth = Math.max(4, size * 0.045); x.strokeStyle = 'rgba(0,60,20,0.55)';
    x.strokeText(text, 512, 196);
    x.fillText(text, 512, 196);
    return toTex(c);
  }
  function refreshSpinLabel() {
    if (!S.spinLabelMat) return; // scene not built (DOM fallback) — nothing to do
    const text = spinLabelFor(currentLang(), window.NN_I18N || {});
    if (text === S.spinLabelText) return;
    S.spinLabelText = text;
    const old = S.spinLabelTex;
    S.spinLabelTex = spinLabelTexture(text);
    S.spinLabelMat.map = S.spinLabelTex; S.spinLabelMat.needsUpdate = true;
    if (old) old.dispose();
  }
  try { window.addEventListener('nn777-lang', refreshSpinLabel); } catch (e) {}

  function neonMat(hex, intensity) {
    // Unlit, HDR color -> blooms through the threshold-1.0 pass. toneMapped:false.
    const m = new THREE.MeshBasicMaterial({ toneMapped: false });
    const c = new THREE.Color(hex).multiplyScalar(intensity);
    m.color.copy(c);
    return m;
  }

  function buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050306);

    // environment reflections for the chrome (procedural — no external HDR)
    const pmrem = new THREE.PMREMGenerator(S.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0x604038, 0.38));
    const key = new THREE.PointLight(0xffc080, 28, 40); key.position.set(3, 6, 8); scene.add(key);
    const rim = new THREE.PointLight(0x4d6aff, 14, 40); rim.position.set(-5, 3, -2); scene.add(rim);
    const warm = new THREE.PointLight(0xff7a1a, 9, 20); warm.position.set(0, 1.5, 5); scene.add(warm);

    // backdrop
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 22),
      new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: true })
    );
    bg.position.set(0, 1, -7); scene.add(bg);
    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 14),
      new THREE.MeshStandardMaterial({ color: 0x0a0808, metalness: 0.7, roughness: 0.4, envMapIntensity: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -4.72, 2); scene.add(floor);

    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9d9de, metalness: 1.0, roughness: 0.45, envMapIntensity: 0.35 });
    const chromeDark = new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 1.0, roughness: 0.5, envMapIntensity: 0.3 });
    const darkPanel = new THREE.MeshStandardMaterial({ color: 0x171114, metalness: 0.5, roughness: 0.5, envMapIntensity: 0.25 });
    const cab = new THREE.Group(); scene.add(cab);

    // main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 8.8, 1.5), darkPanel);
    body.position.set(0, 0, 0); cab.add(body);
    // chrome side columns
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 8.8, 1.62), chrome);
      col.position.set(sx * 2.36, 0, 0); cab.add(col);
    }
    // chrome top/bottom caps
    for (const sy of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.24, 1.66), chrome);
      cap.position.set(0, sy * 4.5, 0); cab.add(cap);
    }

    // warm-orange neon tube edging (rounded rect around the face)
    const tubeCurve = roundedRectPoints(4.66, 8.66, 0.5, 10);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 140, 0.038, 10, true), neonMat(NEON_ORANGE, 3.2));
    tube.position.set(0, 0, 0.78); cab.add(tube); S.tubeMat = tube.material;
    // fallback glow sprites (only visible when the composer is bypassed)
    const glowTex = glowTexture('rgba(255,150,60,1)', 'rgba(255,110,20,0.55)');
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      const a = (i / 10) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 2.33, Math.sin(a) * 4.33, 0.8);
      sp.scale.set(0.9, 0.9, 1); sp.visible = false; cab.add(sp); S.glowSprites.push(sp);
    }

    // marquee: dark red panel + tube letters
    const mq = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.02, 0.3), darkPanel);
    mq.position.set(0, 3.72, 0.62); mq.rotation.x = -0.06; cab.add(mq);
    const mqFace = new THREE.Mesh(new THREE.PlaneGeometry(3.86, 0.96),
      new THREE.MeshBasicMaterial({ map: marqueeTexture(), toneMapped: false }));
    // no HDR push on the whole face: only the neon tubes bloom, the dark-red
    // panel stays dark (a full-face multiplier was washing the cabinet out)
    mqFace.position.set(0, 3.72, 0.78); mqFace.rotation.x = -0.06; cab.add(mqFace);
    S.marqueeMat = mqFace.material;
    const mqTubeCurve = roundedRectPoints(3.94, 1.0, 0.14, 6);
    const mqTube = new THREE.Mesh(new THREE.TubeGeometry(mqTubeCurve, 80, 0.022, 8, true), neonMat(NEON_ORANGE, 2.6));
    mqTube.position.set(0, 3.72, 0.79); mqTube.rotation.x = -0.06; cab.add(mqTube);

    // JACKPOT! sign + blue side panels
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.56, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x1c0505, metalness: 0.3, roughness: 0.6, envMapIntensity: 0.25 }));
    sign.position.set(0, 2.94, 0.66); cab.add(sign);
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.52),
      new THREE.MeshBasicMaterial({ map: jackpotTexture(), toneMapped: false }));
    signFace.position.set(0, 2.94, 0.78); cab.add(signFace);
    S.signMat = signFace.material;
    for (const sx of [-1, 1]) {
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), neonMat(0x3a5aff, 2.4));
      blue.position.set(sx * 1.95, 2.94, 0.66); cab.add(blue);
      // white pinstripes on the blue panels (like the reference)
      for (let k = -2; k <= 2; k++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.035),
          new THREE.MeshBasicMaterial({ color: 0xdde4ff, toneMapped: false }));
        stripe.position.set(sx * 1.95, 2.94 + k * 0.09, 0.765); cab.add(stripe);
      }
    }

    // reel window: dark recess + chrome frame
    const recess = new THREE.Mesh(new THREE.BoxGeometry(4.06, 2.0, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.2, roughness: 0.8, envMapIntensity: 0.2 }));
    recess.position.set(0, 1.62, 0.35); cab.add(recess);
    const frameMats = chrome;
    const fz = 0.72;
    for (const [w, h, px, py] of [[4.3, 0.14, 0, 2.68], [4.3, 0.14, 0, 0.56], [0.14, 2.26, -2.08, 1.62], [0.14, 2.26, 2.08, 1.62]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), frameMats);
      f.position.set(px, py, fz); cab.add(f);
    }
    // reel separators
    for (const sx of [-0.66, 0.66]) {
      const sep = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.98, 0.14), chromeDark);
      sep.position.set(sx, 1.62, fz); cab.add(sep);
    }
    // red win line across the middle
    const winline = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.035, 0.02), neonMat(0xff2222, 2.2));
    winline.position.set(0, 1.62, 0.86); cab.add(winline);

    // the three reel wheels
    const reelXs = [-1.32, 0, 1.32];
    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      group.position.set(reelXs[i], 1.62, 0.42);
      const restCells = [];
      for (let k = 0; k < REEL_CELLS; k++) restCells.push(S.rest[i][k % 3]);
      const tex = reelStripTexture(restCells);
      tex.offset.x = 10 + 1.5 / REEL_CELLS;
      const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.05, roughness: 0.55, envMapIntensity: 0.25 });
      const geo = new THREE.CylinderGeometry(REEL_RADIUS, REEL_RADIUS, REEL_WIDTH, 48, 1, true);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.z = Math.PI / 2; // axis along X -> symbols scroll vertically
      group.add(mesh);
      // motion-blur ghost layer (visible only at speed)
      const ghost = new THREE.Mesh(geo.clone(),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      ghost.rotation.z = Math.PI / 2; ghost.scale.setScalar(1.012);
      group.add(ghost);
      cab.add(group);
      S.reels.push({ group, mesh, ghost, tex, plan: null, state: 'idle', t0: 0, settleT0: 0, rest: S.rest[i].slice() });
    }
    // masks above/below the window so the wheels read as seen-through-glass
    for (const [py, h] of [[2.78, 0.5], [0.46, 0.5]]) {
      const mask = new THREE.Mesh(new THREE.BoxGeometry(4.3, h, 0.5), darkPanel);
      mask.position.set(0, py, 0.55); cab.add(mask);
    }

    // ONE large centered SPIN button — glossy green, blue/purple glowing rim.
    // Replaced the 7-button row 2026-09-20 (~2x the old button diameter,
    // single generous raycast target, translated label, no auto-spin).
    const BTN = SPIN_BUTTON;
    const spinGroup = new THREE.Group();
    spinGroup.position.set(0, -0.28, 0.95);
    spinGroup.rotation.x = -0.35; // face tipped up toward the player
    cab.add(spinGroup);
    // dark chrome housing the button sits in
    const housing = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRectShape(BTN.w + 0.36, BTN.h + 0.36, BTN.corner + 0.15),
        { depth: 0.10, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 16 }),
      chromeDark);
    housing.position.z = -0.10;
    spinGroup.add(housing);
    // blue/purple illuminated rim (emissive over the 1.0 bloom threshold)
    const rimShape = roundedRectShape(BTN.w + 0.24, BTN.h + 0.24, BTN.corner + 0.10);
    rimShape.holes.push(traceRoundedRect(new THREE.Path(), BTN.w + 0.08, BTN.h + 0.08, BTN.corner + 0.03));
    const rimRing = new THREE.Mesh(
      new THREE.ExtrudeGeometry(rimShape, { depth: 0.12, bevelEnabled: false, curveSegments: 16 }),
      new THREE.MeshStandardMaterial({
        color: 0x14142a, emissive: 0x5a5cff, emissiveIntensity: 2.2,
        roughness: 0.4, metalness: 0.2,
      }));
    rimRing.position.z = -0.04;
    spinGroup.add(rimRing);
    // the green button itself (presses into the housing)
    const press = new THREE.Group();
    spinGroup.add(press);
    const btn = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRectShape(BTN.w, BTN.h, BTN.corner),
        { depth: BTN.depth, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 3, curveSegments: 16 }),
      new THREE.MeshPhysicalMaterial({
        // vivid glossy green: keep envMapIntensity low so the RoomEnvironment
        // clearcoat reflection can't wash the face white (caught in QA
        // 2026-09-20 — the face rendered pale instead of green).
        color: 0x1fae4b, roughness: 0.3, metalness: 0.05,
        clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 0.15,
        emissive: 0x0f8a38, emissiveIntensity: 0.65,
      }));
    btn.position.z = 0.02;
    press.add(btn);
    // translated white label, redrawn whenever the game language changes
    S.spinLabelText = spinLabelFor(currentLang(), window.NN_I18N || {});
    S.spinLabelTex = spinLabelTexture(S.spinLabelText);
    S.spinLabelMat = new THREE.MeshBasicMaterial({ map: S.spinLabelTex, transparent: true, toneMapped: false });
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(BTN.w * 0.94, BTN.w * 0.94 * 0.375), // same 1024x384 aspect — no distortion
      S.spinLabelMat);
    label.position.z = 0.02 + BTN.depth + 0.045 + 0.006;
    press.add(label);
    S.spinBtn = btn; S.spinLabel = label; S.spinPress = press;
    S.btnMeshes.push(btn); // exactly one physical button (taps on the label plane raycast through to the button behind it)

    // dark tray with glass front + spins meter
    const tray = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.15, 1.1), darkPanel);
    tray.position.set(0, -1.55, 0.35); cab.add(tray);
    const trayGlass = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.6, envMapIntensity: 0.35 }));
    trayGlass.position.set(0, -1.5, 0.92); cab.add(trayGlass);
    S.meterTex = meterTexture(S.spinsLeft);
    S.meterMat = new THREE.MeshBasicMaterial({ map: S.meterTex, toneMapped: false });
    const meter = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), S.meterMat);
    meter.position.set(-1.25, -1.5, 0.93); cab.add(meter);
    // tray floor (tokens land here)
    const trayFloor = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.6, roughness: 0.4 }));
    trayFloor.position.set(0, -2.06, 0.4); cab.add(trayFloor);

    // golden token mound (grows during celebrate)
    S.mound = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9a821, metalness: 0.95, roughness: 0.3, envMapIntensity: 0.7 }));
    S.mound.scale.set(0.001, 0.001, 0.001); S.mound.position.set(0.3, -2.0, 0.4);
    cab.add(S.mound);

    // token pour particles
    const TN = 240;
    const tGeo = new THREE.BufferGeometry();
    const tPos = new Float32Array(TN * 3);
    for (let i = 0; i < TN; i++) { tPos[i * 3 + 1] = -999; }
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    S.tokens = new THREE.Points(tGeo, new THREE.PointsMaterial({
      size: 0.11, map: glowTexture('rgba(255,215,110,1)', 'rgba(200,140,30,0.6)'),
      transparent: true, depthWrite: false, color: 0xffd76e, sizeAttenuation: true,
    }));
    S.tokens.frustumCulled = false; cab.add(S.tokens);
    for (let i = 0; i < TN; i++) S.tokenData.push({ x: 0, y: -999, z: 0, v: 0, live: false });

    // sparks
    const SN = 70;
    const sGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) sPos[i * 3 + 1] = -999;
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    S.sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 0.07, map: glowTexture('rgba(255,240,200,1)', 'rgba(255,150,60,0.5)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0a0,
    }));
    S.sparks.frustumCulled = false; cab.add(S.sparks);
    for (let i = 0; i < SN; i++) S.sparkData.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });

    // @CUMULATIVEWEB watermark (visual only — real prize is the payout screen)
    S.wmMat = new THREE.MeshBasicMaterial({ map: watermarkTexture(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.325), S.wmMat);
    wm.position.set(0, -0.78, 0.95); cab.add(wm);

    // base
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.7, 1.5, 1.7), darkPanel);
    base.position.set(0, -3.6, 0); cab.add(base);
    const kick = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.3, 0.06), chrome);
    kick.position.set(0, -4.15, 0.86); cab.add(kick);

    return scene;
  }

  /* ---------- spin / settle ---------- */
  function startSpin(rows) {
    return new Promise((resolve) => {
      try {
        const middle = [rows[0][1], rows[1][1], rows[2][1]];
        const anticipate = middle[0] === 'seven' && middle[1] === 'seven';
        const now = performance.now();
        for (let i = 0; i < 3; i++) {
          const R = S.reels[i];
          const plan = reelSpinPlan(R.rest, rows[i].slice(), i, anticipate);
          R.plan = plan;
          R.tex.image = reelStripTexture(plan.cells).image;
          R.tex.needsUpdate = true;
          R.tex.offset.x = plan.oStart;
          R.state = 'spinning'; R.t0 = now;
        }
        S.camMode = 'push'; S.camT0 = now;
        S.flareMode = 'spin';
        S._resolveSpin = resolve;
      } catch (e) { resolve(); }
    });
  }

  function updateReels(now) {
    let allStopped = true;
    for (let i = 0; i < 3; i++) {
      const R = S.reels[i];
      if (R.state === 'spinning' && R.plan) {
        const t = now - R.t0;
        R.tex.offset.x = planOffsetAt(R.plan, t);
        R.ghost.material.opacity = blurAlpha(planSpeed01(R.plan, t));
        if (t >= R.plan.dur) { R.state = 'settling'; R.settleT0 = now; }
        else allStopped = false;
      } else if (R.state === 'settling' && R.plan) {
        const st = clamp01((now - R.settleT0) / 240);
        R.tex.offset.x = planSettleOffset(R.plan, st);
        R.ghost.material.opacity = blurAlpha(1 - st) * 0.5;
        if (st >= 1) {
          R.tex.offset.x = R.plan.oEnd;
          R.ghost.material.opacity = 0;
          R.state = 'idle'; R.rest = R.plan.cells.slice(R.plan.N - 3);
        } else allStopped = false;
      }
    }
    if (S._resolveSpin && allStopped && S.reels.every(r => r.state === 'idle')) {
      const res = S._resolveSpin; S._resolveSpin = null;
      S.camMode = 'relax'; S.camT0 = performance.now();
      if (S.flareMode === 'spin') S.flareMode = 'off';
      res();
    }
  }

  /* ---------- tokens / sparks ---------- */
  function spawnToken() {
    const d = S.tokenData.find(t => !t.live);
    if (!d) return;
    d.live = true;
    d.x = (Math.random() - 0.5) * 3.0; d.z = 0.15 + Math.random() * 0.55;
    d.y = 1.6 + Math.random() * 1.4; d.v = 0.4 + Math.random() * 0.8;
    S.settled.push(1);
  }
  function spawnSpark() {
    const d = S.sparkData.find(t => t.life <= 0);
    if (!d) return;
    const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
    d.x = (Math.random() - 0.5) * 2; d.z = 0.4; d.y = -1.9;
    d.vx = Math.cos(a) * sp; d.vz = Math.sin(a) * sp * 0.5; d.vy = 2.5 + Math.random() * 3;
    d.life = 0.7 + Math.random() * 0.5;
  }
  function updateTokens(dt) {
    const pos = S.tokens.geometry.attributes.position.array;
    for (let i = 0; i < S.tokenData.length; i++) {
      const d = S.tokenData[i];
      if (!d.live) { pos[i * 3 + 1] = -999; continue; }
      d.v += 9.5 * dt; d.y -= d.v * dt;
      const floorY = -2.02 + tokenMound(d.x * 51 + 240, Math.min(1, S.settledCount / 150)) / 84 * 0.9;
      if (d.y <= floorY) {
        d.live = false; S.settledCount++;
        pos[i * 3 + 1] = -999;
      } else { pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z; }
    }
    S.tokens.geometry.attributes.position.needsUpdate = true;
    const ms = Math.min(1, S.settledCount / 150);
    S.mound.scale.set(1.5 * ms + 0.001, 0.5 * ms + 0.001, 1.0 * ms + 0.001);
    const sp = S.sparks.geometry.attributes.position.array;
    for (let i = 0; i < S.sparkData.length; i++) {
      const d = S.sparkData[i];
      if (d.life <= 0) { sp[i * 3 + 1] = -999; continue; }
      d.life -= dt; d.vy -= 7 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      sp[i * 3] = d.x; sp[i * 3 + 1] = d.y; sp[i * 3 + 2] = d.z;
    }
    S.sparks.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- per-frame ---------- */
  function tick(now) {
    const rawDt = (now - (S.lastT || now)) / 1000; S.lastT = now;
    const dt = Math.min(0.1, rawDt);
    // deltas keep RAW frame times (unclamped) so _debugPerf reports true fps;
    // the dt clamp above is only for stable animation math.
    S.deltas.push(rawDt * 1000); if (S.deltas.length > 600) S.deltas.shift();
    // FPS kill-switch: every 2s window, compare the measured fps. Any full 2s
    // sample is meaningful — even a single frame in 2s (0.5fps) is
    // definitively below 50. (An earlier floor of >=3 frames/2s accidentally
    // prevented the switch from EVER engaging on ultra-slow software
    // renderers, where a 2s window holds 1-2 frames.)
    if (S.t2s < 0) S.t2s = now;
    S.frames2s++;
    if (now - S.t2s >= 2000) {
      const fps = S.frames2s / ((now - S.t2s) / 1000);
      if (S.useComposer && fps < 50) {
        S.useComposer = false;
        for (const sp of S.glowSprites) sp.visible = true;
      }
      S.frames2s = 0; S.t2s = now;
    }

    updateReels(now);

    // camera: push-in 1.0->1.18 on spin, relax after, celebrate eases to 1.06
    if (S.camMode === 'push') S.camPush = cameraScale(clamp01((now - S.camT0) / 600));
    else if (S.camMode === 'celebrate') S.camPush += (1.06 - S.camPush) * Math.min(1, dt * 4);
    else if (S.camMode === 'relax') S.camPush = 1.18 - 0.18 * easeInOutCubic(clamp01((now - S.camT0) / 900));
    else S.camPush = 1;
    S.camera.position.z = S.camBase / S.camPush;
    S.camera.position.y = 0.2 + (S.camPush - 1) * 0.35;
    S.camera.lookAt(0, 0.1, 0);

    // celebration particles
    if (S.celebrating) {
      if (now - S.celebT0 < 1500 && S.settledCount < 220) {
        for (let k = 0; k < 4; k++) spawnToken();
        if (Math.random() < 0.6) spawnSpark();
      }
      updateTokens(dt);
    }

    // sign flare (modest: the sign texture is already bright, flare just breathes)
    let flareA = 0;
    if (S.flareMode === 'spin') flareA = 0.65 + 0.35 * Math.abs(Math.sin(now / 90));
    else if (S.flareMode === 'jackpot') flareA = 0.75 + 0.25 * Math.sin(now / 210);
    const base = 1.0, amp = 0.55;
    S.signMat.color.setRGB(base + amp * flareA, base + amp * flareA, base + amp * flareA);
    if (S.bloomPass) S.bloomPass.strength = 0.9 + 0.5 * flareA;
    // watermark fade
    const wmTarget = S.celebrating ? 0.9 : 0;
    S.wmMat.opacity += (wmTarget - S.wmMat.opacity) * Math.min(1, dt * 5);

    if (S.useComposer) S.composer.render();
    else S.renderer.render(S.scene, S.camera);
    S.raf = requestAnimationFrame(tick);
  }

  function fitCamera() {
    const w = S.container.clientWidth || 390, h = S.container.clientHeight || 700;
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    S.camBase = Math.max((CAB_H / 2) / t, (CAB_W / 2) / (t * S.camera.aspect)) * 1.1;
    S.renderer.setSize(w, h);
    if (S.composer) S.composer.setSize(w, h);
  }

  /* ---------- input: raycast the SPIN button ---------- */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function castButton(e) {
    const r = S.canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, S.camera);
    const hits = ray.intersectObjects(S.btnMeshes, false);
    return hits.length ? hits[0].object : null;
  }
  function pressSpin(down) {
    if (!S.spinBtn) return;
    S.spinPress.position.z += down ? -0.055 : 0.055;
    S.spinBtn.material.emissiveIntensity = down ? 1.3 : 0.4;
  }
  function bindInput() {
    const cv = S.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (castButton(e)) { S.spinPressed = true; pressSpin(true); }
    });
    const up = (e) => {
      if (S.spinPressed) {
        S.spinPressed = false; pressSpin(false);
        if (e && S.spinCb && castButton(e)) S.spinCb();
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { if (S.spinPressed) { S.spinPressed = false; pressSpin(false); } });
    cv.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && S.spinCb) { e.preventDefault(); S.spinCb(); }
    });
  }

  /* ---------- public API ---------- */
  const CAB = {
    init() {
      S.canvas = document.getElementById('cabinetCanvas');
      S.container = document.getElementById('cabinet');
      if (!S.canvas || !S.container) return false;
      try {
        S.renderer = new THREE.WebGLRenderer({ canvas: S.canvas, antialias: false, powerPreference: 'high-performance' });
      } catch (e) { return false; }
      if (!S.renderer.getContext()) return false;
      S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      S.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
      S.camera.position.set(0, 0.2, 16);
      S.scene = buildScene();
      fitCamera();
      // post: RenderPass -> Bloom -> OutputPass
      S.composer = new EffectComposer(S.renderer);
      S.composer.addPass(new RenderPass(S.scene, S.camera));
      S.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(S.container.clientWidth / 2 || 195, S.container.clientHeight / 2 || 350),
        0.9, 0.45, 1.0);
      S.composer.addPass(S.bloomPass);
      S.composer.addPass(new OutputPass());
      window.addEventListener('resize', fitCamera);
      bindInput();
      S.lastT = performance.now(); S.t2s = S.lastT;
      if (!S.running) { S.running = true; S.raf = requestAnimationFrame(tick); }
      return true;
    },
    setRest(rows) {
      S.rest = rows.map(r => r.slice());
      for (let i = 0; i < 3; i++) {
        const R = S.reels[i];
        if (!R) continue;
        R.rest = rows[i].slice();
        if (R.state === 'idle') {
          const cells = [];
          for (let k = 0; k < REEL_CELLS; k++) cells.push(rows[i][k % 3]);
          R.tex.image = reelStripTexture(cells).image;
          R.tex.needsUpdate = true;
          R.tex.offset.x = 10 + 1.5 / REEL_CELLS;
        }
      }
    },
    spin(rows) { return startSpin(rows); },
    celebrate() {
      S.celebrating = true; S.celebT0 = performance.now();
      S.settled.length = 0; S.settledCount = 0;
      for (const d of S.tokenData) { d.live = false; }
      for (const d of S.sparkData) { d.life = 0; }
      S.flareMode = 'jackpot';
      S.camMode = 'celebrate'; S.camT0 = performance.now();
    },
    endCelebrate() {
      S.celebrating = false;
      S.flareMode = 'off';
      S.camMode = 'relax'; S.camT0 = performance.now();
    },
    setSignFlare(v) { S.flareMode = v ? 'spin' : 'off'; },
    setSpins(n, ok) {
      S.spinsLeft = n; S.canSpin = !!ok;
      if (S.meterTex) {
        const old = S.meterTex;
        S.meterTex = meterTexture(n);
        S.meterMat.map = S.meterTex; S.meterMat.needsUpdate = true;
        old.dispose();
      }
      if (S.canvas) S.canvas.setAttribute('aria-label',
        `777 Neon Nights slot cabinet. ${n} spins left. Tap the Spin button to spin.`);
    },
    onSpinRequest(cb) { S.spinCb = cb; },
    fpsStats() {
      const d = S.deltas.filter(v => v > 0 && v < 250);
      if (!d.length) return { frames: 0, avg: 0, p95: 0 };
      const sorted = d.slice().sort((a, b) => a - b);
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      return { frames: d.length, avg: +(1000 / mean).toFixed(1), p95: +(1000 / p95).toFixed(1) };
    },
    // QA hook: SPIN button center in CSS px (for touch-tap tests) — non-enumerable
    _debugSpinCenter() {
      if (!S.spinBtn || !S.canvas) return null;
      const v = new THREE.Vector3();
      S.spinBtn.getWorldPosition(v); v.project(S.camera);
      const r = S.canvas.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    },
    // QA hook: last spins value the cabinet received via setSpins (iPhone
    // spin-count regression: proves the 3D meter path carried the decrement)
    _debugMeterValue() {
      return typeof S.spinsLeft === "number" ? S.spinsLeft : null;
    },
    // QA hook: single-button spec proof (count/centering/size/label) — non-enumerable
    _debugSpinInfo() {
      if (!S.spinBtn || !S.camera) return null;
      const v = new THREE.Vector3();
      S.spinBtn.getWorldPosition(v); v.project(S.camera);
      return {
        count: S.btnMeshes.length,
        ndcX: +v.x.toFixed(4),
        width: SPIN_BUTTON.w,
        height: SPIN_BUTTON.h,
        label: S.spinLabelText || '',
      };
    },
    // QA hook: perf path state (kill-switch verification) — non-enumerable
    _debugPerf() {
      const d = S.deltas.filter(v => v > 0 && v < 60000);
      const mean = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
      return { useComposer: S.useComposer, fps: mean ? +(1000 / mean).toFixed(1) : 0 };
    },
  };
  // QA hooks are non-enumerable: hidden from Object.keys() so the public API
  // surface stays exactly the documented set, but still callable by the harness.
  for (const k of ["_debugSpinCenter", "_debugSpinInfo", "_debugPerf", "_debugMeterValue"]) {
    const desc = Object.getOwnPropertyDescriptor(CAB, k);
    if (desc) Object.defineProperty(CAB, k, { ...desc, enumerable: false });
  }
  return CAB;
}

/* ================= DOM fallback (no WebGL): VISIBLE reels, still playable =================
   Same API surface. The fallback container in index.html is unhidden and the
   DOM strips animate with staggered CSS transitions. This path exists so a
   device without WebGL never sees a blank dead page (the iPhone post-mortem). */
function makeDOMCabinet() {
  const $ = (id) => document.getElementById(id);
  const S = {
    rest: [['lemon', 'cherry', 'bell'], ['bell', 'cherry', 'bell'], ['cherry', 'seven', 'lemon']],
    spinsLeft: 30, canSpin: true, spinCb: null,
    deltas: [], lastT: 0, raf: 0, running: false,
    flare: 0, celebrating: false, settled: [],
  };
  const CELL = 72;

  function symCell(id) {
    return `<div class="cell"><svg class="sym"><use href="#sym-${id === 'seven' ? 'seven' : id}"/></svg></div>`;
  }
  function strips() { return [0, 1, 2].map(i => document.querySelector(`.reel[data-reel="${i}"] .strip`)); }

  function paintRest() {
    strips().forEach((el, i) => {
      if (!el) return;
      el.style.transition = 'none';
      el.innerHTML = S.rest[i].map(symCell).join('');
      el.style.transform = 'translateY(0px)';
    });
  }

  function tick(now) {
    const dt = now - (S.lastT || now); S.lastT = now;
    if (dt > 0 && dt < 250) { S.deltas.push(dt); if (S.deltas.length > 600) S.deltas.shift(); }
    S.raf = requestAnimationFrame(tick);
  }

  const CAB = {
    init() {
      const fb = document.querySelector('.cabinet-fallback');
      const cv = $('cabinetCanvas');
      if (!fb) return false;
      if (cv) cv.style.display = 'none';
      fb.classList.remove('sr-only');
      fb.classList.add('dom-visible');
      const cab = $('cabinet');
      if (cab) cab.classList.add('dom-fallback-active');
      paintRest();
      const btn = $('spinBtn');
      if (btn) btn.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && S.spinCb) { e.preventDefault(); S.spinCb(); }
      });
      if (!S.running) { S.running = true; S.lastT = performance.now(); S.raf = requestAnimationFrame(tick); }
      return true;
    },
    setRest(rows) { S.rest = rows.map(r => r.slice()); paintRest(); },
    spin(rows) {
      return new Promise((resolve) => {
        try {
          const els = strips();
          const durs = [1100, 1650, 2200];
          const middle = [rows[0][1], rows[1][1], rows[2][1]];
          if (middle[0] === 'seven' && middle[1] === 'seven') durs[2] = Math.round(2200 * 1.8);
          let done = 0;
          els.forEach((el, i) => {
            if (!el) { if (++done === 3) resolve(); return; }
            const ids = ['seven', 'cherry', 'lemon', 'bell'];
            const filler = [];
            const n = 14 + i * 6;
            for (let k = 0; k < n; k++) filler.push(ids[(Math.random() * 4) | 0]);
            const seq = filler.concat(rows[i]);
            el.style.transition = 'none';
            el.innerHTML = seq.map(symCell).join('');
            el.style.transform = 'translateY(0px)';
            void el.offsetHeight;
            el.style.transition = `transform ${durs[i]}ms cubic-bezier(.12,.8,.24,1)`;
            el.style.transform = `translateY(-${(seq.length - 3) * CELL}px)`;
            setTimeout(() => { if (++done === 3) { S.rest = rows.map(r => r.slice()); resolve(); } }, durs[i] + 60);
          });
        } catch (e) { resolve(); }
      });
    },
    celebrate() {
      S.celebrating = true;
      const fb = document.querySelector('.cabinet-fallback');
      if (fb && !fb.querySelector('.dom-tokens')) {
        const t = document.createElement('div');
        t.className = 'dom-tokens';
        t.innerHTML = Array.from({ length: 40 }, () =>
          `<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s"></i>`).join('');
        fb.appendChild(t);
        setTimeout(() => t.remove(), 4000);
      }
      const sign = $('jackpotSign');
      if (sign) sign.classList.add('flaring');
    },
    endCelebrate() {
      S.celebrating = false;
      const sign = $('jackpotSign');
      if (sign) sign.classList.remove('flaring');
    },
    setSignFlare(v) {
      const sign = $('jackpotSign');
      if (sign) sign.classList.toggle('flaring', !!v);
    },
    setSpins(n, ok) {
      S.spinsLeft = n; S.canSpin = !!ok;
      const el = $('spinsLeft'); if (el) el.textContent = n;
    },
    onSpinRequest(cb) { S.spinCb = cb; },
    fpsStats() {
      const d = S.deltas.filter(v => v > 0 && v < 250);
      if (!d.length) return { frames: 0, avg: 0, p95: 0 };
      const sorted = d.slice().sort((a, b) => a - b);
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      return { frames: d.length, avg: +(1000 / mean).toFixed(1), p95: +(1000 / p95).toFixed(1) };
    },
  };
  return CAB;
}

/* ================= install ================= */
// Module eval runs after document parsing (deferred), so the DOM is ready.
// Probe WebGL once; install the matching implementation under the same name
// game.js already reads: window.NN_CABINET.
try {
  window.NN_CABINET = webglOK() ? makeWebGLCabinet() : makeDOMCabinet();
} catch (e) {
  try { window.NN_CABINET = makeDOMCabinet(); } catch (e2) { /* last resort: game.js no-CAB path */ }
}
