/* 777 Neon Nights — cabinet-error hardening test.
   Regression for the 2026-09-20 iPhone post-mortem: a throwing CAB.showPrize
   (3D cabinet) must NEVER swallow the DOM win banner + triple payout modal.
   Loads the real game.js in a vm sandbox with a fake DOM, installs an
   NN_CABINET whose showPrize throws, forces a triple-bell spin, clicks Spin,
   and asserts:
     1. the payout modal still opens (payoutModal no longer .hidden)
     2. the DOM win banner text was set
     3. a cabinet_error metric was recorded with what="showPrize"
     4. the spin metric carries the spin RESULT (middle symbols, triple id)
   Run: node cabinet-error.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const GAME = __dirname;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log("FAIL:", name); } }

/* ---------- fake DOM ---------- */
const elements = {};
function makeEl(id) {
  const listeners = {};
  const classSet = new Set(["hidden"]);
  const target = {
    _id: id,
    textContent: "", innerHTML: "", value: "", disabled: false,
    href: "", target: "", rel: "", className: "", download: "",
    style: {}, dataset: {},
    classList: {
      add(c) { classSet.add(c); }, remove(c) { classSet.delete(c); },
      toggle(c, f) { if (f === undefined) { classSet.has(c) ? classSet.delete(c) : classSet.add(c); } else if (f) classSet.add(c); else classSet.delete(c); },
      contains(c) { return classSet.has(c); },
    },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {},
    appendChild() {}, insertBefore() {}, removeChild() {},
    click() { (listeners.click || []).forEach((f) => f({})); },
    querySelector(sel) { return makeEl("q:" + sel); },
    querySelectorAll() { return []; },
    getContext() { return null; },
    setAttribute() {}, removeAttribute() {}, hasAttribute() { return false; },
    _listeners: listeners,
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === "string") return (...a) => undefined; // absorb unknown DOM methods
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const timers = [];
const sandbox = {
  console,
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms: ms || 0 }); return timers.length; },
  clearTimeout: () => {},
  setInterval: (fn) => { timers.push({ fn, ms: 999999999, interval: true }); return timers.length; },
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
  localStorage: {
    _s: {},
    getItem(k) { return k in this._s ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
  navigator: { language: "en-US" },
  location: { search: "" },
  document: {
    getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
    createElement(tag) { return makeEl("created:" + tag + ":" + Math.random()); },
    querySelector(sel) { return makeEl("q:" + sel); }, querySelectorAll() { return []; },
    addEventListener() {},
    body: makeEl("body"),
  },
  Audio: function Audio() {
    return {
      currentTime: 0, duration: 210, paused: true, volume: 1, src: "",
      play() { this.paused = false; return Promise.resolve(); },
      pause() { this.paused = true; },
      addEventListener() {}, removeEventListener() {},
    };
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(file, stripImport) {
  let src = fs.readFileSync(path.join(GAME, file), "utf8");
  if (stripImport) src = src.replace(/^import[^\n]*\n/m, "const spinLabelFor = () => 'Spin!';\n");
  vm.runInContext(src, sandbox, { filename: file });
}
load("config.js");
load("logic.js");
load("i18n.js");
load("metrics.js");
load("scores.js");

// Force every spin to be triple-bell (the +50 case from the post-mortem).
const L = sandbox.window.NN_LOGIC;
L.spin = () => ({
  rows: [["bell", "bell", "bell"], ["bell", "bell", "bell"], ["bell", "bell", "bell"]],
  middle: ["bell", "bell", "bell"], jackpot: false, triple: "bell",
});

// The 3D cabinet: showPrize throws (the reported failure mode).
sandbox.window.NN_CABINET = {
  init() { return true; },
  setRest() {}, onSpinRequest() {}, clearPrize() {}, setSignFlare() {},
  setSpins() {}, celebrate() {}, endCelebrate() {},
  spin() { return Promise.resolve(); },
  showPrize() { throw new Error("3D renderer boom"); },
};

load("game.js", true);

(async () => {
  const $ = (id) => elements[id] || sandbox.document.getElementById(id);
  const spinBtn = $("spinBtn");
  ok(!!spinBtn._listeners.click && spinBtn._listeners.click.length > 0, "spin button has a click handler");

  // Preconditions: credits start at 0, no cabinet_error yet.
  const M = sandbox.window.NN_METRICS;
  const before = M.events(sandbox.localStorage);
  ok(before.filter((e) => e.name === "cabinet_error").length === 0, "no cabinet_error before spin");

  spinBtn.click(); // doSpin -> CAB.spin resolves -> finishSpin(triple bell)
  await new Promise((r) => setImmediate(r)); // flush promise microtasks
  await new Promise((r) => setImmediate(r));

  // Run the finishSpin setTimeout(openTriplePayout, 1200).
  const due = timers.filter((t) => !t.interval && t.ms === 1200);
  ok(due.length >= 1, "openTriplePayout was scheduled despite the CAB throw");
  for (const t of due) t.fn();

  const payoutModal = $("payoutModal");
  ok(!payoutModal.classList.contains("hidden"), "payout modal OPENED despite throwing CAB.showPrize");
  const banner = $("winBanner").textContent;
  ok(typeof banner === "string" && banner.length > 0, `DOM win banner was set ("${banner.slice(0, 40)}")`);

  const evs = M.events(sandbox.localStorage);
  const cabErrs = evs.filter((e) => e.name === "cabinet_error");
  ok(cabErrs.length >= 1, "cabinet_error metric recorded");
  ok(cabErrs.some((e) => e.what === "showPrize" && /3D renderer boom/.test(e.error || "")),
    "cabinet_error carries what=showPrize and the original error");
  const spins = evs.filter((e) => e.name === "spin");
  ok(spins.length === 1, `exactly one spin metric (got ${spins.length})`);
  ok(spins[0] && spins[0].middle === "bell,bell,bell", `spin metric carries middle symbols ("${spins[0] && spins[0].middle}")`);
  ok(spins[0] && spins[0].triple === "bell", `spin metric carries triple id ("${spins[0] && spins[0].triple}")`);

  console.log(`cabinet-error: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("FATAL:", e); process.exit(1); });
