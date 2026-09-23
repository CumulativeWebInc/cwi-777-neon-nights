/* 777 Neon Nights — prize-provider test.
   Asserts the §5 abstraction: v1 = promo prizes only; money mode REFUSES with
   all compliance gates listed; awards/value/redeem math is honest.
   Run: node prize-providers.test.js */
"use strict";
const PP = require("./prize-providers.js");
const CONFIG = require("./config.js");

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log("FAIL:", name); } }

// --- v1 is promo, always ---
ok(CONFIG.prize && CONFIG.prize.mode === "promo", "config.prize.mode defaults to promo");
const P = PP.getPrizeProvider(CONFIG);
ok(P.mode === "promo", "getPrizeProvider returns promo provider for v1");

// --- award() routes every win kind to its credit award ---
for (const [kind, expected] of [["jackpot", 1000], ["triple", 50], ["prize", 25]]) {
  const prize = P.award({ kind });
  ok(prize.mode === "promo" && prize.kind === kind, `award(${kind}) returns promo prize`);
  ok(prize.creditAward === expected, `award(${kind}).creditAward === ${expected}`);
  ok(prize.cashValue === 0, `award(${kind}).cashValue === 0 (honest: no cash value)`);
}
let threw = false;
try { P.award({ kind: "lottery" }); } catch (e) { threw = true; }
ok(threw, "award() throws on unknown win kind");

// --- valueOf() is telemetry-grade and never upgrades the data-truth label ---
const v = P.valueOf(P.award({ kind: "jackpot" }));
ok(v.type === "promo" && v.cashValue === 0 && v.amount === 1000 && v.unit === "neon-credits",
   "valueOf(jackpot) = promo/1000 neon-credits/0 cash");

// --- redeem(): receipt math, refusal below price ---
const actor = {
  credits: 1000,
  spendCredits(n) { if (this.credits < n) return false; this.credits -= n; return true; },
  issued: null,
  issueLink(url, label) { this.issued = { url, label }; },
  metrics: [],
  metric(name, payload) { this.metrics.push({ name, payload }); },
  selection: { url: "https://open.spotify.com/track/4XP56LZjeS0TJUd30kpGSK", label: "Spotify" },
};
const r = P.redeem(P.award({ kind: "jackpot" }), actor);
ok(r.ok === true, "redeem: ok receipt");
ok(r.creditsSpent === 1000 && r.balance === 0, "redeem: 1000 spent, balance 0");
ok(actor.issued && actor.issued.url === actor.selection.url, "redeem: link issued to actor");
ok(actor.metrics.length === 1 && actor.metrics[0].name === "prize_claim", "redeem: prize_claim metric emitted");
ok(actor.metrics[0].payload.value.type === "promo" && actor.metrics[0].payload.value.cashValue === 0,
   "redeem: metric carries honest promo value label");

const poor = { credits: 10, spendCredits(n) { if (this.credits < n) return false; this.credits -= n; return true; },
               selection: { url: "https://example.com", label: "X" }, issued: null,
               issueLink(u, l) { this.issued = u; } };
const r2 = P.redeem(P.award({ kind: "triple" }), poor);
ok(r2.ok === false && r2.reason === "insufficient-credits" && r2.need === 990, "redeem: below price refuses without issuing");
ok(poor.issued === null, "redeem: refusal issues no link");

const nolink = { credits: 2000, spendCredits() { return true; }, selection: null };
ok(P.redeem(P.award({ kind: "triple" }), nolink).ok === false, "redeem: no selection refuses");

// --- money mode: HARD REFUSAL, never a path ---
const moneyCfg = Object.assign({}, CONFIG, { prize: { mode: "money" } });
let moneyThrew = false, moneyMsg = "";
try { PP.getPrizeProvider(moneyCfg); } catch (e) { moneyThrew = true; moneyMsg = e.message; }
ok(moneyThrew, "getPrizeProvider('money') throws — no money path exists");
const gates = PP.checkMoneyModeGates();
ok(Array.isArray(gates) && gates.length === 7, "7 compliance gates listed");
ok(gates.every(g => g.status === "unmet"), "all 7 money-mode gates are unmet in v1");
ok(/gambling/i.test(moneyMsg) && /counsel/i.test(moneyMsg) && /KYC/i.test(moneyMsg) &&
   /age/i.test(moneyMsg) && /geo/i.test(moneyMsg) && /RNG/i.test(moneyMsg) &&
   /Black/i.test(moneyMsg), "refusal names every gate + Black's approval");
let enableThrew = false;
try { PP.enableMoneyMode(); } catch (e) { enableThrew = true; }
ok(enableThrew, "enableMoneyMode() refuses — no runtime switch exists");
let unknownThrew = false;
try { PP.getPrizeProvider({ prize: { mode: "casino" } }); } catch (e) { unknownThrew = true; }
ok(unknownThrew, "unknown prize mode throws");

console.log(`prize-providers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
