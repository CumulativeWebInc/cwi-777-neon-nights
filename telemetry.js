/* 777 Neon Nights — remote player telemetry beacon (v8.3).
   Batched, anonymous, best-effort reporting of per-device metric deltas to the
   owner's ntfy sink. Complements metrics.js (localStorage log): that log stays
   the on-device contract; this module ships compact deltas off-device so the
   owner sees REAL player totals (unique players, spins, prizes, links issued).

   Privacy: payloads contain ONLY a random per-device id (from metrics.js),
   per-event counts for the current window, and issued-link URLs (public music
   deep links the game itself issued). No IP is stored server-side by us; the
   transport is a plain HTTPS POST. Nothing here blocks gameplay — every
   failure path is silent and the game never waits on the network.

   Design: ingest() mirrors NN_METRICS.record() calls from game.js exactly once
   per event. flush() builds one JSON body and sends it via sendBeacon when
   available (survives pagehide), else fetch with keepalive. After a successful
   send the window resets; on failure the counts roll into the next window
   (capped) so a dead network degrades to local-only, never to data loss loops.

   The transport is injectable (makeTransport) so node tests can drive the
   whole module without a DOM or network. */
(function () {
  "use strict";

  var MAX_LINKS_PER_FLUSH = 25;   // prize-link detail cap (ntfy ~4KB message cap)
  var MAX_ROLL_EVENTS = 2000;     // failure roll-forward cap (counts only)

  function defaults() {
    return {
      counts: Object.create(null),
      sums: Object.create(null), // credit_earn / credit_spend amounts
      links: [],          // [{e, url, kind?, at}]
      windowStart: Date.now(),
      sent: 0,
      failed: 0,
    };
  }

  function makeWindow() { return defaults(); }

  function ingest(win, name, data) {
    data = data || {};
    win.counts[name] = (win.counts[name] || 0) + 1;
    // Credit amounts (fun points, no money value): totals the owner wants.
    if ((name === "credit_earn" || name === "credit_spend") &&
        typeof data.amount === "number" && isFinite(data.amount)) {
      win.sums[name] = (win.sums[name] || 0) + data.amount;
    }
    // Prize-link detail: capture the exact issued URL on claim/tap events.
    // metrics.js stores like/follow tap URLs under `platform` (legacy key);
    // telemetry normalizes to `url`. The game also sends `via` (provider
    // label shown to the player, e.g. "Spotify") and `song` — both captured
    // so the owner dashboard can show which song/provider each winner chose.
    var url = data.url || data.platform || null;
    if (typeof url === "string" && url.length > 0 &&
        (name === "prize_claim" || name === "like_tap" || name === "follow_tap" ||
         name === "like_award" || name === "follow_award")) {
      if (win.links.length < MAX_LINKS_PER_FLUSH) {
        win.links.push({
          e: name,
          url: url.slice(0, 500),
          kind: typeof data.kind === "string" ? data.kind.slice(0, 80) : undefined,
          provider: typeof data.via === "string" ? data.via.slice(0, 80) : undefined,
          song: typeof data.song === "string" ? data.song.slice(0, 120) : undefined,
          at: Date.now(),
        });
      }
    }
    return win;
  }

  function isEmpty(win) {
    for (var k in win.counts) return false;
    return win.links.length === 0;
  }

  function buildPayload(win, deviceId) {
    var now = Date.now();
    return {
      v: 1,
      d: deviceId,
      w: Math.max(1, Math.round((now - win.windowStart) / 1000)),
      t0: win.windowStart,
      t1: now,
      c: win.counts,
      s: win.sums,
      pl: win.links,
    };
  }

  function serialize(payload) {
    try { return JSON.stringify(payload); } catch (e) { return null; }
  }

  // Default transport: navigator.sendBeacon if present (survives pagehide),
  // else fetch(keepalive). Returns true/false synchronously for beacon;
  // fetch failures surface via the returned promise — flush() treats them as
  // best-effort and never throws.
  function defaultTransport(env) {
    return function (endpoint, body) {
      try {
        if (env && env.navigator && typeof env.navigator.sendBeacon === "function") {
          return env.navigator.sendBeacon(endpoint, body);
        }
      } catch (e) { return false; }
      try {
        if (env && typeof env.fetch === "function") {
          env.fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
            keepalive: true,
          }).catch(function () {});
          return true;
        }
      } catch (e) { return false; }
      return false;
    };
  }

  // flush(win, cfg, deviceId, transport) -> {sent:boolean, win}
  // On success returns a fresh empty window; on failure returns the same
  // window (counts roll forward, capped) and bumps failed. Never throws.
  function flush(win, cfg, deviceId, transport) {
    if (isEmpty(win)) return { sent: false, win: win };
    if (!cfg || !cfg.enabled || !cfg.base || !cfg.topic || !deviceId) {
      return { sent: false, win: win };
    }
    var endpoint = String(cfg.base).replace(/\/+$/, "") + "/" + String(cfg.topic);
    var body = serialize(buildPayload(win, deviceId));
    if (!body) return { sent: false, win: win };
    var ok = false;
    try { ok = !!transport(endpoint, body); } catch (e) { ok = false; }
    if (ok) {
      win.sent++;
      return { sent: true, win: defaults() };
    }
    win.failed++;
    // Cap roll-forward so a long-dead network can't grow the window forever.
    var total = 0;
    for (var k in win.counts) total += win.counts[k];
    if (total > MAX_ROLL_EVENTS) {
      var fresh = defaults();
      fresh.failed = win.failed;
      fresh.sent = win.sent;
      return { sent: false, win: fresh };
    }
    return { sent: false, win: win };
  }

  // Browser wiring: start(cfg, store) attaches the 60s interval + pagehide /
  // visibilitychange flushes and returns an API {ingest, flushNow}.
  // game.js calls api.ingest(name, data) right after every metric() call.
  function start(cfg, store, env) {
    env = env || (typeof window !== "undefined" ? window : {});
    var win = defaults();
    var deviceId = null;
    try {
      var M = env.NN_METRICS;
      if (M && typeof M.deviceId === "function") deviceId = M.deviceId(store);
    } catch (e) { deviceId = null; }
    var transport = defaultTransport(env);
    var api = {
      ingest: function (name, data) {
        try { win = ingest(win, name, data); } catch (e) {}
        // Jackpots and prize claims flush immediately — Black wants prize
        // issuance visible fast; beacon is fire-and-forget.
        if (name === "jackpot_win" || name === "prize_claim") api.flushNow();
      },
      flushNow: function () {
        try {
          var r = flush(win, cfg, deviceId, transport);
          win = r.win;
          return r.sent;
        } catch (e) { return false; }
      },
    };
    try {
      var ms = (cfg && cfg.flushMs) || 60000;
      var timer = env.setInterval ? env.setInterval(function () { api.flushNow(); }, ms) : null;
      var onHide = function () { api.flushNow(); };
      if (env.document && env.document.addEventListener) {
        env.document.addEventListener("visibilitychange", function () {
          if (env.document.hidden) onHide();
        });
      }
      if (env.addEventListener) {
        env.addEventListener("pagehide", onHide);
      }
      api._timer = timer;
    } catch (e) {}
    return api;
  }

  var API = {
    makeWindow: makeWindow,
    ingest: ingest,
    isEmpty: isEmpty,
    buildPayload: buildPayload,
    flush: flush,
    defaultTransport: defaultTransport,
    start: start,
    MAX_LINKS_PER_FLUSH: MAX_LINKS_PER_FLUSH,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.NN_TELEMETRY = API;
})();
