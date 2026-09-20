/* 777 Neon Nights — deterministic scoring + portable verifiable score codes.
   FORMULA (documented, deterministic, from game state only):
     score = totalSpins*1 + triples*25 + jackpots*500 + roundsDone*100
           + listenMinutes*10 + bonusWins*50
   No randomness, no purchasable boosts, no way to inflate except playing.
   Score codes are tamper-EVIDENT (checksum), not tamper-proof: a modified code
   fails verification. Issued per device; leaderboard is per-device (localStorage). */
(function () {
  "use strict";
  const SALT = "nn777-score-v1::cumulative-web-inc";
  const LS_BOARD = "nn777-leaderboard-v1";
  const LS_SID = "nn777-sid";
  const FORMULA = "score = totalSpins*1 + triples*25 + jackpots*500 + roundsDone*100 + listenMinutes*10 + bonusWins*50";

  function computeScore(S) {
    const spins = Math.max(0, S.totalSpins | 0);
    const triples = Math.max(0, S.triples | 0);
    const jackpots = Math.max(0, S.jackpots | 0);
    const rounds = Math.max(0, (S.roundsDone || []).length);
    const minutes = Math.max(0, Math.floor((S.listeningSec | 0) / 60));
    const bonus = Math.max(0, S.bonusWins | 0);
    const breakdown = {
      spins: spins * 1, triples: triples * 25, jackpots: jackpots * 500,
      rounds: rounds * 100, minutes: minutes * 10, bonus: bonus * 50,
    };
    const score = breakdown.spins + breakdown.triples + breakdown.jackpots +
                  breakdown.rounds + breakdown.minutes + breakdown.bonus;
    return { score, breakdown, inputs: { spins, triples, jackpots, rounds, minutes, bonus } };
  }

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  function b64urlEncode(obj) {
    const s = JSON.stringify(obj);
    const b = (typeof Buffer !== "undefined")
      ? Buffer.from(s, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(s)));
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(code) {
    const b = String(code).trim().replace(/-/g, "+").replace(/_/g, "/");
    const pad = b.length % 4 ? "=".repeat(4 - (b.length % 4)) : "";
    const s = (typeof Buffer !== "undefined")
      ? Buffer.from(b + pad, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(b + pad)));
    return JSON.parse(s);
  }
  function deviceTag() {
    try { const s = localStorage.getItem(LS_SID) || "local"; return String(s).slice(-6); }
    catch (e) { return "local"; }
  }
  function canonical(p) { return [p.v, p.score, p.spins, p.triples, p.jackpots, p.rounds, p.minutes, p.bonus, p.tag].join("|"); }
  function scoreFromInputs(p) { return p.spins * 1 + p.triples * 25 + p.jackpots * 500 + p.rounds * 100 + p.minutes * 10 + p.bonus * 50; }

  function encode(S) {
    const r = computeScore(S);
    const p = { v: 1, score: r.score, spins: r.inputs.spins, triples: r.inputs.triples,
                jackpots: r.inputs.jackpots, rounds: r.inputs.rounds,
                minutes: r.inputs.minutes, bonus: r.inputs.bonus, tag: deviceTag() };
    p.sum = fnv1a(canonical(p) + SALT);
    return b64urlEncode(p);
  }
  function decode(code) {
    let p;
    try { p = b64urlDecode(code); } catch (e) { return { ok: false, reason: "bad-code" }; }
    if (!p || p.v !== 1 || typeof p.score !== "number") return { ok: false, reason: "bad-shape" };
    for (const k of ["spins", "triples", "jackpots", "rounds", "minutes", "bonus"])
      if (!Number.isInteger(p[k]) || p[k] < 0) return { ok: false, reason: "bad-inputs" };
    if (p.score !== scoreFromInputs(p)) return { ok: false, reason: "score-mismatch" };
    if (p.sum !== fnv1a(canonical(p) + SALT)) return { ok: false, reason: "checksum-mismatch" };
    return { ok: true, data: p };
  }

  function getBoard() { try { return JSON.parse(localStorage.getItem(LS_BOARD)) || []; } catch (e) { return []; } }
  function saveBoard(b) { try { localStorage.setItem(LS_BOARD, JSON.stringify(b.slice(0, 10))); } catch (e) {} }
  function add(code, name) {
    const d = decode(code);
    if (!d.ok) return d;
    const b = getBoard();
    b.push({ code, name: String(name || "Player").slice(0, 24), score: d.data.score,
             ts: new Date().toISOString(), tag: d.data.tag });
    b.sort((a, c) => c.score - a.score);
    saveBoard(b);
    return { ok: true, score: d.data.score };
  }

  const API = { FORMULA, computeScore, encode, decode, getBoard, add };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.NN_SCORES = API;
})();
