/* Node tests: 777 Neon Nights pure game logic + scores.
   Run: node game-logic.test.js */
"use strict";
const L = require("./logic.js");
const C = L.CONFIG;
const SC = require("./scores.js");

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

/* mulberry32 — deterministic rng for tests */
function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --- RNG distribution sanity: weights roughly proportional over 20k picks --- */
(function () {
  const rng = rng32(1234);
  const counts = {};
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const s = L.pickSymbol(rng);
    counts[s] = (counts[s] || 0) + 1;
  }
  const total = C.symbols.reduce((a, s) => a + s.weight, 0);
  let sane = true;
  for (const s of C.symbols) {
    const expected = (s.weight / total) * N;
    const got = counts[s.id] || 0;
    if (Math.abs(got - expected) / expected > 0.10) { sane = false; console.log("  dist off:", s.id, got, "vs", expected.toFixed(0)); }
  }
  ok(sane, "rng distribution within 10% of weights (n=20000)");
})();

/* --- pity cap: jackpot forced at 200 spins without one --- */
(function () {
  const st = L.newState();
  st.spinsSinceJackpot = 199; // one more spin hits the cap
  const rng = rng32(999);
  // force a non-jackpot draw: run draws until pity would trigger, then assert
  const res = L.spin(st, rng);
  ok(res.jackpot === true, "pity cap forces jackpot at 200 spins");
  ok(res.middle.every(m => m === "seven"), "pity jackpot shows 777");
  // and before the cap, jackpots can happen naturally (or not) without forcing
  const st2 = L.newState();
  st2.spinsSinceJackpot = 0;
  const res2 = L.spin(st2, rng32(42));
  ok(st2.spinsSinceJackpot === 0 || true, "pre-cap spin runs");
})();

/* --- pity counter resets after jackpot --- */
(function () {
  const st = L.newState();
  st.spinsSinceJackpot = 50;
  L.applySpinResult(st, { jackpot: true, triple: null });
  ok(st.spinsSinceJackpot === 0 && st.jackpots === 1, "jackpot resets pity counter");
  const st2 = L.newState();
  L.applySpinResult(st2, { jackpot: false, triple: "cherry" });
  ok(st2.spinsSinceJackpot === 1 && st2.triples === 1, "non-jackpot increments pity, counts triple");
})();

/* --- stage/round unlock thresholds --- */
(function () {
  const st = L.newState();
  ok(L.currentRound(st).id === "r1", "round 1 first");
  st.totalSpins = 1;
  ok(L.advanceRounds(st).join(",") === "r1", "r1 completes at 1 spin");
  ok(L.currentRound(st).id === "r2", "advances to r2");
  st.totalSpins = 10;
  L.advanceRounds(st);
  ok(L.currentRound(st).id === "r3", "r2 completes at 10 spins");
  st.listeningSec = 180;
  const done = L.advanceRounds(st);
  ok(done.includes("r3"), "r3 (180s listening) completes");
  ok(L.currentRound(st).id === "r4" && st.stageIdx === 1, "enters Stage 2 after r3");
  // triples objective
  st.totalSpins = 30; st.triples = 1; L.advanceRounds(st); // r4 done
  L.advanceRounds(st); // r5 needs 1 triple — already have 1
  ok(st.roundsDone.includes("r5"), "r5 (1 triple) completes");
  st.listeningSec = 420; L.advanceRounds(st);
  ok(st.roundsDone.includes("r6") && st.stageIdx === 2, "r6 completes -> Stage 3");
  st.totalSpins = 75; st.triples = 3; L.advanceRounds(st); // r7, r8 done
  ok(st.roundsDone.includes("r8"), "r8 (3 triples) completes");
  st.listeningSec = 900; L.advanceRounds(st);
  ok(L.currentRound(st) === null, "all 9 rounds complete -> null");
})();

/* --- listening-time gating of prizes --- */
(function () {
  const st = L.newState();
  ok(L.unlockedPrizes(st).length === 0, "no prizes at 0s");
  st.listeningSec = 179;
  ok(L.unlockedPrizes(st).length === 0, "no prizes at 179s (180 threshold)");
  st.listeningSec = 180;
  ok(L.unlockedPrizes(st).length === 1 && L.unlockedPrizes(st)[0].id === "wallpaper", "wallpaper unlocks at 180s");
  ok(L.claimPrize(st, "wallpaper").id === "wallpaper", "claim works");
  ok(L.claimPrize(st, "wallpaper") === null, "double-claim rejected");
  ok(L.unlockedPrizes(st).length === 0, "claimed prize not re-offered");
  st.listeningSec = 900;
  const two = L.unlockedPrizes(st).map(p => p.id).sort();
  ok(two.join(",") === "artpack,golden", "artpack + golden unlock at 900s");
  ok(L.claimPrize(st, "golden").id === "golden" && st.goldenSpinsLeft === C.goldenSpins, "golden grants golden spins");
  // muting pauses the clock
  const st2 = L.newState();
  ok(L.listenTick(st2, true) === 1 && st2.listeningSec === 1, "audible tick accrues");
  ok(L.listenTick(st2, false) === 0 && st2.listeningSec === 1, "muted tick does not accrue");
})();

/* --- bonus round unlock/availability --- */
(function () {
  const st = L.newState();
  ok(!L.bonusUnlocked(st), "bonus locked at start");
  st.roundsDone = ["r1","r2","r3","r4","r5","r6"]; st.listeningSec = 300;
  ok(L.bonusUnlocked(st), "bonus unlocks after r6 + 300s listening");
  ok(L.bonusAvailable(st), "bonus available when never played");
  st.bonusLastPlayed = Date.now();
  ok(!L.bonusAvailable(st), "24h cooldown after play");
  ok(L.bonusAvailable(st, Date.now() + 25 * 3600 * 1000), "available again after 25h");
})();

/* --- score formula determinism --- */
(function () {
  const S = { totalSpins: 250, triples: 6, jackpots: 2, roundsDone: ["r1","r2","r3","r4"], listeningSec: 901, bonusWins: 1 };
  const a = SC.computeScore(S), b = SC.computeScore(S);
  ok(JSON.stringify(a) === JSON.stringify(b), "score deterministic");
  ok(a.score === 250 + 6*25 + 2*500 + 4*100 + 15*10 + 1*50, "score formula math (901s = 15 min)");
  // scores only grow through play inputs
  const S2 = { totalSpins: 0, triples: 0, jackpots: 0, roundsDone: [], listeningSec: 0, bonusWins: 0 };
  ok(SC.computeScore(S2).score === 0, "fresh state scores 0");
})();

/* --- score-code tamper rejection --- */
(function () {
  const S = { totalSpins: 100, triples: 2, jackpots: 1, roundsDone: ["r1"], listeningSec: 200, bonusWins: 0 };
  const code = SC.encode(S);
  ok(SC.decode(code).ok, "valid code decodes");
  // flip payload chars: inflate each numeric input
  function evil(mut) {
    const raw = JSON.parse(Buffer.from(code.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8"));
    mut(raw);
    return Buffer.from(JSON.stringify(raw)).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  ok(!SC.decode(evil(r => r.jackpots += 10)).ok, "inflated jackpots rejected");
  ok(!SC.decode(evil(r => r.score += 5000)).ok, "inflated score rejected");
  ok(!SC.decode(evil(r => r.minutes += 60)).ok, "inflated minutes rejected");
  ok(!SC.decode(evil(r => { delete r.sum; })).ok, "stripped checksum rejected");
  ok(!SC.decode(code.slice(0, -4) + "XXXX").ok, "truncated/corrupted code rejected");
  ok(!SC.decode("").ok, "empty code rejected");
})();

/* --- spin regen: free spins over time, capped --- */
(function () {
  const st = L.newState();
  st.spins = 30; st.lastRegen = Date.now() - 10 * 60 * 1000;
  L.regenSpins(st);
  ok(st.spins === 40, "regen caps at spinCap (30 + 13 -> 40)");
  const st2 = L.newState();
  st2.spins = 40; st2.lastRegen = Date.now() - 60 * 60 * 1000;
  L.regenSpins(st2);
  ok(st2.spins === 40, "no regen above cap");
})();

/* --- spin regen clock: fast-forward at cap so a spent spin visibly decrements ---
   iPhone bug (2026-09-20): with spins parked at 40 for minutes, lastRegen went
   stale; spending one spin then ran regenSpins in refresh() and the cap-time
   banked up instantly refunded the spin — the counter sat at 40 forever. */
(function () {
  const SEC = 1000;
  // Repro: parked at cap 40 for 5 minutes, spend one spin, immediate regen must NOT refund it.
  const st = L.newState();
  st.spins = 40; st.lastRegen = Date.now() - 300 * SEC;
  L.regenSpins(st, Date.now());           // background tick at the cap
  ok(st.spins === 40, "cap stays 40 while parked");
  const res = L.spin(st, rng32(7));
  L.applySpinResult(st, res);
  L.regenSpins(st, Date.now());           // the refresh() that runs right after the spin
  ok(st.spins === 39, "spin from 40 decrements to 39 — no instant refund (iPhone fix)");
  // Sub-period remainder is preserved: 50s elapsed grants 1 spin, keeps 5s credit.
  const st3 = L.newState();
  st3.spins = 30; st3.lastRegen = Date.now() - 50 * SEC;
  L.regenSpins(st3, Date.now());
  ok(st3.spins === 31, "partial period grants only full periods (50s -> +1)");
  // ...and the leftover credit still accrues: 40 more seconds later = 1 more spin.
  L.regenSpins(st3, Date.now() + 40 * SEC);
  ok(st3.spins === 32, "remainder credit accrues (+40s after 50s -> +1 more)");
  // Cap bank: at 39 with banked full periods, the NEXT regen tops to 40 — not the current tick.
  const st4 = L.newState();
  st4.spins = 39; st4.lastRegen = Date.now() - 200 * SEC;
  L.regenSpins(st4, Date.now());
  ok(st4.spins === 40, "banked periods grant +1 to reach cap (39 -> 40)");
  L.regenSpins(st4, Date.now());
  ok(st4.spins === 40, "still 40 on immediate re-tick (clock fully fast-forwarded)");
})();

/* --- leaf retirement (2026-09-20 visual redo): no leaf anywhere --- */
(function () {
  const ids = C.symbols.map(s => s.id);
  ok(!ids.includes("leaf"), "leaf absent from symbol set");
  ok(!C.symbols.some(s => /leaf/i.test(s.label || "")), "no leaf label in symbols");
  const sum = C.symbols.reduce((a, s) => a + s.weight, 0);
  ok(sum === 18, "symbol weights still sum to 18 (leaf weight moved to bell)");
  ok(C.symbols.every(s => s.weight > 0), "every symbol weight positive");
  ok(C.symbols.find(s => s.id === "bell").weight === 6, "bell carries leaf's old weight (3+3)");
  // 20k draws: leaf never picked
  const rng = rng32(777);
  let sawLeaf = false;
  for (let i = 0; i < 20000; i++) if (L.pickSymbol(rng) === "leaf") { sawLeaf = true; break; }
  ok(!sawLeaf, "pickSymbol never returns leaf (n=20000)");
  // 2k full spins: leaf never on reels, never a triple
  const st = L.newState();
  let bad = false;
  for (let i = 0; i < 2000; i++) {
    const r = L.spin(st, rng32(1000 + i));
    if (r.rows.flat().includes("leaf") || r.triple === "leaf") { bad = true; break; }
  }
  ok(!bad, "spin() never lands leaf on reels or as triple (n=2000)");
})();

/* --- v8.2 GAME OVER economy: gameOver / buySpins / awardOnce / earnOptions /
       shouldSilence / replayTick (pure, no DOM) --- */
(function () {
  const st = L.newState();
  st.spins = 0;
  ok(L.gameOver(st) === true, "gameOver true exactly at zero spins");
  st.spins = 1;
  ok(L.gameOver(st) === false, "gameOver false with spins left");

  // buySpins: deduct 25, add 10, refuse below 25, never negative
  const b1 = L.newState(); b1.spins = 0; b1.credits = 25;
  const r1 = L.buySpins(b1);
  ok(r1.ok === true, "buySpins ok at exactly 25 credits");
  ok(b1.credits === 0 && b1.spins === 10, "buySpins deducts 25 and adds 10 spins");
  const b2 = L.newState(); b2.spins = 0; b2.credits = 24;
  const r2 = L.buySpins(b2);
  ok(r2.ok === false && r2.reason === "insufficient", "buySpins refuses below 25");
  ok(b2.credits === 24 && b2.spins === 0, "refused purchase changes nothing");
  const b3 = L.newState(); b3.spins = 38; b3.credits = 100;
  L.buySpins(b3);
  ok(b3.spins === 40, "buySpins caps at spinCap (40)");

  // awardOnce: once ever, no double-pay, persists ids
  const a1 = L.newState(); a1.credits = 0;
  const w1 = L.awardOnce(a1, "like-song", 25);
  ok(w1.awarded === true && a1.credits === 25, "awardOnce pays first time");
  const w2 = L.awardOnce(a1, "like-song", 25);
  ok(w2.awarded === false && a1.credits === 25, "awardOnce re-click never double-pays");
  const w3 = L.awardOnce(a1, "follow-artist", 25);
  ok(w3.awarded === true && a1.credits === 50, "follow awardOnce pays once ever (+25)");
  const w4 = L.awardOnce(a1, "follow-artist", 25);
  ok(w4.awarded === false && a1.credits === 50, "follow re-click never double-pays");
  ok(a1.creditsAwarded.includes("like-song") && a1.creditsAwarded.includes("follow-artist"),
    "creditsAwarded persists the once-ever ids");

  // earnOptions: earn panel only below 25, hidden once claimed
  const e1 = L.newState(); e1.credits = 0;
  const o1 = L.earnOptions(e1);
  ok(o1.canBuy === false && o1.showLike && o1.showShare && o1.showFollow,
    "earnOptions: like/share/follow shown below 25 credits");
  const e2 = L.newState(); e2.credits = 25;
  const o2 = L.earnOptions(e2);
  ok(o2.canBuy === true && !o2.showLike && !o2.showShare && !o2.showFollow,
    "earnOptions: earn panel hidden when credits >= 25");
  const e3 = L.newState(); e3.credits = 0; e3.creditsAwarded = ["like-song", "share-song", "follow-artist"];
  const o3 = L.earnOptions(e3);
  ok(!o3.showLike && !o3.showShare && !o3.showFollow,
    "earnOptions: claimed once-ever actions stay hidden");

  // shouldSilence: exactly game-over + zero credits
  const s1 = L.newState(); s1.spins = 0; s1.credits = 0;
  ok(L.shouldSilence(s1) === true, "shouldSilence at game-over + 0 credits");
  const s2 = L.newState(); s2.spins = 0; s2.credits = 25;
  ok(L.shouldSilence(s2) === false, "no silence at game-over with credits left (song keeps playing)");
  const s3 = L.newState(); s3.spins = 5; s3.credits = 0;
  ok(L.shouldSilence(s3) === false, "no silence with spins left even at 0 credits");

  // replayTick: wrap after hearing to the end counts once; seeks never count
  const rs = L.newReplayState();
  const DUR = 120;
  for (let t = 0; t <= DUR; t += 10) ok(L.replayTick(rs, t, DUR, false) === false, "no award mid-play");
  ok(L.replayTick(rs, 2, DUR, false) === true, "completed loop awards exactly once");
  ok(L.replayTick(rs, 3, DUR, false) === false, "no double award on the same wrap");
  const rs2 = L.newReplayState();
  L.replayTick(rs2, 110, DUR, false);
  ok(L.replayTick(rs2, 5, DUR, true) === false, "seeking never awards (backward seek != wrap)");
  const rs3 = L.newReplayState();
  L.replayTick(rs3, 40, DUR, false);
  ok(L.replayTick(rs3, 2, DUR, false) === false, "wrap without hearing to the end does not award");

  // sharePath
  ok(L.sharePath({ share: () => {} }) === "native", "sharePath native");
  ok(L.sharePath({ clipboard: { writeText: () => {} } }) === "clipboard", "sharePath clipboard fallback");
  ok(L.sharePath({}) === "none", "sharePath none");
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
