/* 777 Neon Nights — prize-mode abstraction (v8.5, Black's direction 2026-09-21).
   The prize system is a swappable provider behind one interface; the game core
   never knows what a prize is "worth". v1 ships PROMO prizes only (free music
   links + Neon Credits fun points — no cash value, no gambling).

   Interface:
     award(win)            -> prize            { mode, kind, creditAward, linkCatalog, cashValue: 0 }
     valueOf(prize)        -> value            { type, amount, cashValue, unit }  (telemetry-grade, honest)
     redeem(prize, actor)  -> receipt         { ok, prizeKind, url, label, creditsSpent, balance }

   Money mode (cash, gift cards, sweepstakes entries) is architecturally
   supported but HARD-GATED: there is NO code path to a MoneyPrizeProvider.
   getPrizeProvider() REFUSES mode "money" — it throws, listing every unmet
   compliance gate. Enabling it requires: all gates met (licenses, counsel
   opinion, KYC/AML, age verification, geo-fencing, certified RNG) PLUS
   Black's explicit approval. "Build once, ship once."

   Works in the browser (window.NN_PRIZES) and node (module.exports) for tests.
*/
"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.NN_PRIZES = api;
})(typeof self !== "undefined" ? self : this, function () {

  // --- Compliance gates for money mode. All UNMET in v1. The machine must
  // hold every one of these before money mode can be considered — the law
  // decides when the door opens, not a config flag. ---
  const MONEY_MODE_GATES = [
    { id: "gambling_license",  name: "Gambling/sweepstakes licenses per jurisdiction", status: "unmet" },
    { id: "counsel_opinion",   name: "Counsel opinion letter (prize/chance/consideration analysis)", status: "unmet" },
    { id: "kyc_aml",           name: "KYC/AML identity verification", status: "unmet" },
    { id: "age_verification",  name: "18+/21+ age verification", status: "unmet" },
    { id: "geo_fencing",       name: "Geo-fencing to licensed jurisdictions", status: "unmet" },
    { id: "rng_certification", name: "Audited/certified RNG", status: "unmet" },
    { id: "owner_approval",    name: "Black's explicit approval of money-prize mode", status: "unmet" },
  ];

  function checkMoneyModeGates() {
    // Fresh copies — callers cannot mark gates met by mutating the report.
    return MONEY_MODE_GATES.map(g => ({ id: g.id, name: g.name, status: g.status }));
  }

  function moneyModeRefusal() {
    const gates = checkMoneyModeGates().map(g => ` - [${g.status}] ${g.name}`).join("\n");
    return new Error(
      "NN_PRIZES: money-prize mode is DISABLED. Every compliance gate below is UNMET, " +
      "and Black's explicit approval is absent. Money mode cannot activate.\n" + gates
    );
  }

  // --- Promo provider (v1 — the only active provider) ---
  // Prizes: free music links (allowlisted in NN_CONFIG.jackpotLinks) + Neon
  // Credits (fun points, no money value, redeemable only for free links).
  function PromoPrizeProvider(config) {
    const C = config || {};
    const awards = C.creditAwards || { jackpot: 1000, triple: 50, prize: 25 };
    const linkCatalogs = {
      jackpot: "jackpotLinks",
      triple: "jackpotLinks",
      prize: "jackpotLinks",
      encore: "bonus.prizes",
    };
    return {
      mode: "promo",
      award(win) {
        const kind = win && win.kind;
        if (!awards[kind] && kind !== "encore") throw new Error("NN_PRIZES: unknown win kind: " + kind);
        return {
          mode: "promo",
          kind,
          creditAward: awards[kind] || 0,
          linkCatalog: linkCatalogs[kind] || "jackpotLinks",
          cashValue: 0, // honestly labeled: promo prizes have no cash value
        };
      },
      valueOf(prize) {
        return {
          type: "promo", // honest data-truth label: NEVER upgraded without evidence
          amount: (prize && prize.creditAward) || 0,
          unit: "neon-credits",
          cashValue: 0,
        };
      },
      // actor = { credits, price, spendCredits(n)->bool, issueLink(url,label), metric(name,payload) }
      // Pure of DOM — testable in node.
      redeem(prize, actor) {
        const price = C.creditLinkPrice || 1000;
        if (!prize || prize.mode !== "promo") throw new Error("NN_PRIZES.redeem: not a promo prize");
        if (!actor || !actor.selection) return { ok: false, reason: "no-link-selected" };
        if (typeof actor.spendCredits !== "function") throw new Error("NN_PRIZES.redeem: actor.spendCredits missing");
        const { url, label } = actor.selection;
        if (!url) return { ok: false, reason: "no-link-selected" };
        if (!actor.spendCredits(price)) return { ok: false, reason: "insufficient-credits", need: price - (actor.credits || 0) };
        if (typeof actor.issueLink === "function") actor.issueLink(url, label);
        if (typeof actor.metric === "function") {
          actor.metric("prize_claim", { kind: prize.kind, via: label, url, credits: true, value: this.valueOf(prize) });
        }
        return {
          ok: true,
          prizeKind: prize.kind,
          url,
          label: label || "",
          creditsSpent: price,
          balance: (actor.credits != null) ? actor.credits : null, // actor.spendCredits already deducted price
        };
      },
    };
  }

  function getPrizeProvider(config) {
    const mode = (config && config.prize && config.prize.mode) || "promo";
    if (mode === "promo") return PromoPrizeProvider(config);
    if (mode === "money") throw moneyModeRefusal(); // HARD GATE: no money path exists
    throw new Error("NN_PRIZES: unknown prize mode: " + mode);
  }

  // enableMoneyMode is the ONLY named entry point for money mode, and it is a
  // refusal, not a switch. It exists so a future "just flip the flag" attempt
  // hits this wall: every gate must be met in code review + counsel + Black's
  // approval before any real provider is written.
  function enableMoneyMode() { throw moneyModeRefusal(); }

  return {
    getPrizeProvider,
    enableMoneyMode,
    checkMoneyModeGates,
    moneyModeRefusal,
    PromoPrizeProvider,
    PRIZE_MODES: ["promo", "money"],
  };
});
