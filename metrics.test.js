/* Node tests: 777 Neon Nights owner metrics (v8.2).
   Run: node metrics.test.js
   Covers: device-id persistence, exactly-once event recording, cap,
   counts aggregation, and an end-to-end like->share->follow->replay->purchase
   simulation asserting every event lands exactly once with correct totals. */
"use strict";
const M = require("./metrics.js");
const L = require("./logic.js");

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

// Fake storage adapter (localStorage shape)
function fakeStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _raw: m,
  };
}

(function () {
  // device id: stable + persisted
  const st = fakeStore();
  const d1 = M.deviceId(st);
  const d2 = M.deviceId(st);
  ok(typeof d1 === "string" && d1.length > 4, "deviceId returns a non-trivial id");
  ok(d1 === d2, "deviceId persists across reads");

  // exactly-once recording
  M.record(st, "like_tap", { platform: "x" });
  M.record(st, "like_award", { amount: 25 });
  const evs = M.events(st);
  ok(evs.length === 2, "two record() calls -> exactly two events");
  ok(evs[0].name === "like_tap" && evs[1].name === "like_award", "event order preserved");
  ok(typeof evs[0].t === "number", "events carry timestamps");

  // unknown event names are programmer errors -> throw
  let threw = false;
  try { M.record(st, "bogus_event", {}); } catch (e) { threw = true; }
  ok(threw, "unknown metric event throws");

  // cap: oldest dropped first
  const st2 = fakeStore();
  for (let i = 0; i < M.CAP + 5; i++) M.record(st2, "spin", { i });
  const evs2 = M.events(st2);
  ok(evs2.length === M.CAP, `event log capped at ${M.CAP}`);
  ok(evs2[0].i === 5, "cap drops oldest first");

  // counts aggregation
  const st3 = fakeStore();
  M.record(st3, "credit_earn", { amount: 25 });
  M.record(st3, "credit_earn", { amount: 50 });
  M.record(st3, "credit_spend", { amount: 25 });
  M.record(st3, "song_replay", {});
  const c = M.counts(st3);
  ok(c.creditsEarned === 75, "creditsEarned sums credit_earn amounts");
  ok(c.creditsSpent === 25, "creditsSpent sums credit_spend amounts");
  ok(c.byEvent.credit_earn === 2 && c.byEvent.song_replay === 1, "byEvent tallies per event");
  ok(c.totalEvents === 4, "totalEvents counts all");
  ok(c.deviceId === M.deviceId(st3), "counts carries the device id");
})();

/* --- end-to-end: like -> share -> follow -> replay -> purchase --- */
(function () {
  const st = fakeStore();
  const S = L.newState();
  S.spins = 0; S.credits = 0;
  const rec = (name, data) => M.record(st, name, data);

  // 1. game over entered
  if (L.gameOver(S)) rec("game_over", { credits: S.credits });

  // 2. like: tap + once-ever award (+25)
  rec("like_tap", { platform: "spotify" });
  const lw = L.awardOnce(S, "like-song", 25);
  if (lw.awarded) { rec("like_award", { amount: 25 }); rec("credit_earn", { amount: 25 }); }
  // re-tap: tap fires, award does NOT
  rec("like_tap", { platform: "youtube" });
  const lw2 = L.awardOnce(S, "like-song", 25);
  if (lw2.awarded) { rec("like_award", { amount: 25 }); rec("credit_earn", { amount: 25 }); }

  // 3. share: tap + completed share (+25)
  rec("share_tap", {});
  const sw = L.awardOnce(S, "share-song", 25);
  if (sw.awarded) { rec("share_award", { amount: 25 }); rec("credit_earn", { amount: 25 }); }

  // 4. follow: tap + once-ever award (+25)
  rec("follow_tap", { platform: "spotify" });
  const fw = L.awardOnce(S, "follow-artist", 25);
  if (fw.awarded) { rec("follow_award", { amount: 25 }); rec("credit_earn", { amount: 25 }); }

  // 5. replay: completed loop (+25)
  rec("song_replay", { award: 25 });
  rec("credit_earn", { amount: 25 });
  S.credits += 25;

  // 6. purchase: 10 spins for 25
  const pr = L.buySpins(S);
  if (pr.ok) { rec("spin_buy", { price: 25, spins: 10 }); rec("credit_spend", { amount: 25 }); }

  const c = M.counts(st);
  const once = (name, n) => ok(c.byEvent[name] === n, `e2e: ${name} fired exactly ${n}x (got ${c.byEvent[name]})`);
  once("game_over", 1);
  once("like_tap", 2);      // two taps, both logged
  once("like_award", 1);    // but only one award
  once("share_tap", 1);
  once("share_award", 1);
  once("follow_tap", 1);
  once("follow_award", 1);
  once("song_replay", 1);
  once("spin_buy", 1);
  once("credit_earn", 4);   // like + share + follow + replay
  once("credit_spend", 1);
  ok(c.creditsEarned === 100, `e2e: creditsEarned = 100 (got ${c.creditsEarned})`);
  ok(c.creditsSpent === 25, `e2e: creditsSpent = 25 (got ${c.creditsSpent})`);
  ok(S.credits === 75 && S.spins === 10, `e2e: final state credits=75 spins=10 (got ${S.credits}/${S.spins})`);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
