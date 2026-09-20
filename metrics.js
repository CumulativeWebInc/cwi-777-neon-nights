/* 777 Neon Nights — owner metrics (v8.2).
   Anonymous structured event log persisted in localStorage under "nn777-metrics"
   (capped ring buffer). No PII: only a random per-device id (unique players).
   Pure storage-adapter design: every function takes a `store` with
   getItem/setItem, so node tests pass a fake and the browser passes
   localStorage. Nothing here touches the DOM or the network. */
(function () {
  "use strict";
  const LS_LOG = "nn777-metrics";
  const LS_DEVICE = "nn777-device";
  const CAP = 500;

  // Event names. Contract: exactly one record() call per user action —
  // each game handler records its event once; tests assert no dupes.
  const EVENTS = [
    "song_play",      // audio actually started playing
    "song_replay",    // full song loop completed -> +25
    "like_tap",       // a like deep-link was tapped
    "like_award",     // +25 like credit granted (once ever)
    "share_tap",      // share button tapped
    "share_award",    // +25 share credit granted (once ever)
    "share_cancel",   // native share dismissed without completing
    "follow_tap",     // a follow deep-link was tapped
    "follow_award",   // +25 follow credit granted (once ever)
    "game_over",      // spins hit 0 -> GAME OVER entered
    "spin",           // a spin was pulled
    "spin_buy",       // 10 spins bought for 25 credits
    "credit_earn",    // any Neon Credit award (data.amount)
    "credit_spend",   // any Neon Credit deduction (data.amount)
    // Extended vocabulary for the rest of the game (dashboard counts them too):
    "song_silence",   // game-over + 0 credits: song stopped
    "game_start", "stage_unlock", "jackpot_win", "encore_play",
    "prize_claim", "credit_cashin_open", "credit_save",
    "listen_minute", "score_submit",
    "cabinet_error",  // a 3D-cabinet call threw; caught by cabSafe (data.what, data.error)
  ];

  function _read(store, key, fallback) {
    try {
      const raw = store.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function _write(store, key, val) {
    try { store.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /** Stable per-device id for "unique players" (persisted, random, anonymous). */
  function deviceId(store) {
    let id = _read(store, LS_DEVICE, null);
    if (typeof id !== "string" || !id) {
      id = "d-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      _write(store, LS_DEVICE, id);
    }
    return id;
  }

  /** Record one event. Exactly one entry per call — no batching, no dedupe. */
  function record(store, name, data) {
    if (EVENTS.indexOf(name) < 0) throw new Error("unknown metric event: " + name);
    const evs = _read(store, LS_LOG, []);
    const list = Array.isArray(evs) ? evs : [];
    list.push(Object.assign({ t: Date.now(), name: name }, data || {}));
    while (list.length > CAP) list.shift(); // capped: oldest dropped first
    _write(store, LS_LOG, list);
    return list.length;
  }

  function events(store) {
    const evs = _read(store, LS_LOG, []);
    return Array.isArray(evs) ? evs : [];
  }

  /** Aggregated owner-dashboard counts: per-event tallies + credit totals. */
  function counts(store) {
    const evs = events(store);
    const byEvent = {};
    for (const e of EVENTS) byEvent[e] = 0;
    let earned = 0, spent = 0;
    for (const e of evs) {
      if (byEvent[e.name] !== undefined) byEvent[e.name]++;
      if (e.name === "credit_earn" && typeof e.amount === "number") earned += e.amount;
      if (e.name === "credit_spend" && typeof e.amount === "number") spent += e.amount;
    }
    return {
      deviceId: deviceId(store),
      totalEvents: evs.length,
      byEvent: byEvent,
      creditsEarned: earned,
      creditsSpent: spent,
    };
  }

  function clearMetrics(store) { _write(store, LS_LOG, []); }

  const API = {
    KEY: LS_LOG, DEVICE_KEY: LS_DEVICE, CAP: CAP, EVENTS: EVENTS,
    deviceId: deviceId, record: record, events: events,
    counts: counts, clearMetrics: clearMetrics,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.NN_METRICS = API;
})();
