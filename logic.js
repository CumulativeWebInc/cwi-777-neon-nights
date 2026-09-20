/* 777 Neon Nights — pure game logic (no DOM). Testable with node.
   All randomness injectable via rng() for tests. */
"use strict";
const NN_CONFIG = (typeof require !== "undefined")
  ? require("./config.js")
  : (typeof window !== "undefined" ? window.NN_CONFIG : null);

function totalWeight(symbols, sevenMult = 1) {
  return symbols.reduce((a, s) => a + s.weight * (s.id === "seven" ? sevenMult : 1), 0);
}

function pickSymbol(rng, sevenMult = 1) {
  const total = totalWeight(NN_CONFIG.symbols, sevenMult);
  let r = rng() * total;
  for (const s of NN_CONFIG.symbols) {
    r -= s.weight * (s.id === "seven" ? sevenMult : 1);
    if (r < 0) return s.id;
  }
  return NN_CONFIG.symbols[NN_CONFIG.symbols.length - 1].id;
}

/** One spin: returns { rows: [ [3 symbols per reel] x3 ], middle: [s,s,s],
    jackpot: bool, triple: false|string }.
    state.spinsSinceJackpot drives the pity guarantee. */
function spin(state, rng = Math.random) {
  const sevenMult = state.goldenSpinsLeft > 0 ? NN_CONFIG.goldenSevenMult : 1;
  const rows = [];
  for (let reel = 0; reel < 3; reel++) {
    const col = [];
    for (let row = 0; row < 3; row++) col.push(pickSymbol(rng, sevenMult));
    rows.push(col);
  }
  const middle = [rows[0][1], rows[1][1], rows[2][1]];
  let jackpot = middle[0] === "seven" && middle[1] === "seven" && middle[2] === "seven";
  // Pity: force 777 when the drought hits the cap
  if (!jackpot && state.spinsSinceJackpot + 1 >= NN_CONFIG.pitySpins) {
    for (let reel = 0; reel < 3; reel++) rows[reel][1] = "seven";
    middle[0] = middle[1] = middle[2] = "seven";
    jackpot = true;
  }
  const triple = !jackpot && middle[0] === middle[1] && middle[1] === middle[2] ? middle[0] : null;
  return { rows, middle, jackpot, triple };
}

function newState() {
  return {
    spins: NN_CONFIG.spinsStart,
    totalSpins: 0,
    spinsSinceJackpot: 0,
    jackpots: 0,
    triples: 0,
    listeningSec: 0,
    lastRegen: Date.now(),
    stageIdx: 0,
    roundIdx: 0,
    roundsDone: [],
    prizesClaimed: [],
    goldenSpinsLeft: 0,
    bonusLastPlayed: 0,
    bonusWins: 0,
    muted: false,
    version: 1,
  };
}

/** Regen free spins based on elapsed wall time. Pure-ish: pass nowMs.
    Fast-forwards the regen clock by the FULL elapsed periods (keeping the
    sub-period remainder), whether or not spins were granted. The old ratchet
    (advancing only by granted spins) left lastRegen stale at the cap, so
    every spin was instantly refunded and the counter never visibly moved. */
function regenSpins(state, nowMs = Date.now()) {
  const elapsed = Math.floor((nowMs - state.lastRegen) / 1000);
  if (elapsed < NN_CONFIG.spinRegenSec) return state;
  const periods = Math.floor(elapsed / NN_CONFIG.spinRegenSec);
  const add = Math.min(periods, NN_CONFIG.spinCap - state.spins);
  if (add > 0) state.spins += add;
  state.lastRegen += periods * NN_CONFIG.spinRegenSec * 1000;
  return state;
}

function canSpin(state) { return state.spins > 0; }

function currentRound(state) {
  const st = NN_CONFIG.stages[state.stageIdx];
  if (!st) return null;
  return st.rounds[state.roundIdx] || null;
}

function roundProgress(state) {
  const r = currentRound(state);
  if (!r) return { done: true, text: "All rounds complete" };
  const o = r.objective;
  if (o.type === "spins")   return { done: state.totalSpins >= o.count, have: state.totalSpins, need: o.count, unit: "spins" };
  if (o.type === "listen")  return { done: state.listeningSec >= o.seconds, have: state.listeningSec, need: o.seconds, unit: "listening" };
  if (o.type === "triples") return { done: state.triples >= o.count, have: state.triples, need: o.count, unit: "triples" };
  return { done: false };
}

/** Advance stage/round while objectives are met. Returns list of completed round ids. */
function advanceRounds(state) {
  const done = [];
  for (;;) {
    const r = currentRound(state);
    if (!r) break;
    if (!roundProgress(state).done) break;
    done.push(r.id);
    state.roundsDone.push(r.id);
    state.roundIdx++;
    const st = NN_CONFIG.stages[state.stageIdx];
    if (state.roundIdx >= st.rounds.length) {
      state.roundIdx = 0;
      state.stageIdx++;
      if (state.stageIdx >= NN_CONFIG.stages.length) { state.stageIdx = NN_CONFIG.stages.length - 1; state.roundIdx = st.rounds.length; break; }
    }
  }
  return done;
}

function applySpinResult(state, result) {
  state.spins--;
  state.totalSpins++;
  if (state.goldenSpinsLeft > 0) state.goldenSpinsLeft--;
  if (result.jackpot) { state.jackpots++; state.spinsSinceJackpot = 0; }
  else state.spinsSinceJackpot++;
  if (result.triple) state.triples++;
}

/** Listening tick: +1s only when audible. Returns gained seconds (0/1). */
function listenTick(state, audible) {
  if (audible) { state.listeningSec++; return 1; }
  return 0;
}

/** Newly unlocked listening prizes (not yet claimed). */
function unlockedPrizes(state) {
  return NN_CONFIG.listenPrizes.filter(p => state.listeningSec >= p.at && !state.prizesClaimed.includes(p.id));
}

function claimPrize(state, id) {
  const p = NN_CONFIG.listenPrizes.find(x => x.id === id);
  if (!p || state.listeningSec < p.at || state.prizesClaimed.includes(id)) return null;
  state.prizesClaimed.push(id);
  if (id === "golden") state.goldenSpinsLeft += NN_CONFIG.goldenSpins;
  return p;
}

function roundCompleted(state, roundId) {
  return state.roundsDone.includes(roundId);
}

function bonusUnlocked(state) {
  return roundCompleted(state, NN_CONFIG.bonus.unlockAfterRound) &&
         state.listeningSec >= NN_CONFIG.bonus.unlockListenSec;
}
function bonusAvailable(state, nowMs = Date.now()) {
  if (!bonusUnlocked(state)) return false;
  return nowMs - state.bonusLastPlayed >= NN_CONFIG.bonus.cooldownHours * 3600 * 1000;
}

const NN_LOGIC_API = { CONFIG: NN_CONFIG, pickSymbol, spin, newState, regenSpins, canSpin,
  currentRound, roundProgress, advanceRounds, applySpinResult, listenTick,
  unlockedPrizes, claimPrize, bonusUnlocked, bonusAvailable, totalWeight };
if (typeof module !== "undefined") {
  module.exports = NN_LOGIC_API;
}
if (typeof window !== "undefined") {
  window.NN_LOGIC = NN_LOGIC_API;
}
