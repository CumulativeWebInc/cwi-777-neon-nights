/* Node tests: NN_SCORES + NN_METRICS. Run: node payout-metrics.test.js */
"use strict";
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const M = require("./metrics.js");
const SC = require("./scores.js");
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

// --- score formula: deterministic, documented ---
const S1 = { totalSpins: 100, triples: 4, jackpots: 1, roundsDone: ["r1","r2","r3"], listeningSec: 420, bonusWins: 2 };
const r1 = SC.computeScore(S1);
ok(r1.score === 100*1 + 4*25 + 1*500 + 3*100 + 7*10 + 2*50, "formula math");
ok(JSON.stringify(SC.computeScore(S1)) === JSON.stringify(r1), "deterministic repeat");
ok(SC.computeScore({totalSpins:0,triples:0,jackpots:0,roundsDone:[],listeningSec:59,bonusWins:0}).score === 0, "zero state = 0");
ok(typeof SC.FORMULA === "string" && SC.FORMULA.includes("jackpots*500"), "formula documented");

// --- score codes: roundtrip + tamper-evident ---
const code = SC.encode(S1);
ok(typeof code === "string" && code.length > 20, "code issued");
const d = SC.decode(code);
ok(d.ok && d.data.score === r1.score, "decode roundtrip valid");
const tampered = code.slice(0, -2) + (code.slice(-2) === "AA" ? "BB" : "AA");
ok(!SC.decode(tampered).ok, "tampered code rejected");
ok(!SC.decode("not-a-code!!").ok, "garbage rejected");
// hand-edited score inside payload must fail checksum
const raw = JSON.parse(Buffer.from(code.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8"));
raw.score += 9999;
const evil = Buffer.from(JSON.stringify(raw)).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const ev = SC.decode(evil);
ok(!ev.ok && (ev.reason === "score-mismatch" || ev.reason === "checksum-mismatch"), "inflated score rejected");

// --- leaderboard: top-10, sorted, verified-only ---
for (let i = 0; i < 12; i++) {
  const st = { totalSpins: i*10, triples: 0, jackpots: 0, roundsDone: [], listeningSec: 0, bonusWins: 0 };
  const res = SC.add(SC.encode(st), "P" + i);
  ok(res.ok, "board add " + i);
}
const board = SC.getBoard();
ok(board.length === 10, "board capped at 10");
ok(board[0].score >= board[9].score, "board sorted desc");
ok(SC.add("bogus", "X").ok === false, "unverified code not added");

// --- metrics: schema, anonymity, local-only (v8.2 API: store-based record/events) ---
M.clearMetrics(global.localStorage);
M.record(global.localStorage, "game_start", { lang: "en" });
const evs1 = M.events(global.localStorage);
const e1 = evs1[evs1.length - 1];
ok(e1.name === "game_start" && typeof e1.t === "number", "event schema");
ok(!("email" in e1) && !("ip" in e1) && !("phone" in e1) && !("device" in e1), "no PII fields");
M.record(global.localStorage, "spin", {}); M.record(global.localStorage, "jackpot_win", {});
ok(M.events(global.localStorage).length === 3, "log accumulates");
let threwUnknown = false;
try { M.record(global.localStorage, "link_issued", {}); } catch (e) { threwUnknown = true; }
ok(threwUnknown, "unknown event rejected, never silently logged");
ok(M.counts(global.localStorage).byEvent.spin === 1, "dashboard counts spins");

// --- listening-prize claims carry music links (iPhone 2026-09-20 fix) ---
// Source-level check: claimPrizeUI must hand the payout modal a links array
// drawn from the verified jackpotLinks allowlist (install-i18n pins the URLs).
const fs = require("fs"), path = require("path");
const gameSrc = fs.readFileSync(path.join(__dirname, "game.js"), "utf8");
const claimBody = (gameSrc.match(/function claimPrizeUI\(id\) \{([\s\S]*?)\n  \}\n/) || [null, ""])[1];
ok(claimBody.length > 0, "claimPrizeUI body found");
ok(/showPayout\(\{[\s\S]*links:/.test(claimBody), "claimPrizeUI passes links to the payout modal");
ok(claimBody.includes("C.jackpotLinks"), "claimPrizeUI music links come from the verified jackpotLinks allowlist");
ok(/title:\s*winText\("prize"/.test(claimBody), "claimPrizeUI title names the won prize (translated)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
