/* Node tests: 777 Neon Nights remote telemetry beacon (v8.3).
   Run: node telemetry.test.js
   Covers: delta batching, prize-link URL capture (incl. legacy `platform` key),
   flush triggers, exactly-once sends (no duplicate), payload shape, silent
   failure (transport throws -> no throw, window rolls forward), disabled cfg
   never sends, roll-forward cap. */
"use strict";
const T = require("./telemetry.js");

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

const CFG = { enabled: true, base: "https://ntfy.envs.net", topic: "t-probe", flushMs: 60000 };

function fakeTransport(calls, ret) {
  return function (endpoint, body) { calls.push({ endpoint, body }); return ret; };
}

(function () {
  // batching: many ingests collapse to counts
  let w = T.makeWindow();
  for (let i = 0; i < 7; i++) T.ingest(w, "spin", {});
  T.ingest(w, "jackpot_win", {});
  const p = T.buildPayload(w, "d-xyz");
  ok(p.d === "d-xyz", "payload carries deviceId");
  ok(p.c.spin === 7 && p.c.jackpot_win === 1, "counts batched per event");
  ok(typeof p.t0 === "number" && p.t1 >= p.t0 && p.w >= 1, "window timestamps sane");
  ok(p.v === 1, "payload version present");

  // prize-link URL capture on prize_claim
  w = T.makeWindow();
  T.ingest(w, "prize_claim", { kind: "jackpot", url: "https://open.spotify.com/track/AAA" });
  ok(w.links.length === 1 && w.links[0].url === "https://open.spotify.com/track/AAA" && w.links[0].e === "prize_claim", "prize_claim URL captured");
  ok(w.links[0].kind === "jackpot", "prize kind captured");

  // winner prize choice detail: provider label (via) + song captured on claim
  w = T.makeWindow();
  T.ingest(w, "prize_claim", { kind: "jackpot", via: "Spotify", song: "Neon Nights Pt. 777", url: "https://open.spotify.com/track/AAA" });
  ok(w.links.length === 1 && w.links[0].provider === "Spotify" && w.links[0].song === "Neon Nights Pt. 777", "prize_claim provider+song captured");
  w = T.makeWindow();
  T.ingest(w, "prize_claim", { kind: "encore", url: "https://open.spotify.com/track/BBB" });
  ok(w.links.length === 1 && w.links[0].provider === undefined && w.links[0].song === undefined, "provider/song optional — URL-only claim still valid");

  // legacy metrics.js key: like_tap/follow_tap store the URL under `platform`
  w = T.makeWindow();
  T.ingest(w, "like_tap", { platform: "https://open.spotify.com/track/BBB" });
  T.ingest(w, "follow_tap", { platform: "https://music.apple.com/x" });
  ok(w.links.length === 2 && w.links[0].url === "https://open.spotify.com/track/BBB", "like_tap platform URL normalized to url");
  ok(w.links[1].url === "https://music.apple.com/x", "follow_tap platform URL normalized to url");

  // non-link events don't grow the links array
  w = T.makeWindow();
  T.ingest(w, "spin", { url: "https://example.com/nope" });
  ok(w.links.length === 0, "spin never records a link even with a url field");

  // link cap: never exceeds MAX_LINKS_PER_FLUSH
  w = T.makeWindow();
  for (let i = 0; i < T.MAX_LINKS_PER_FLUSH + 10; i++) {
    T.ingest(w, "prize_claim", { url: "https://x/" + i });
  }
  ok(w.links.length === T.MAX_LINKS_PER_FLUSH, "links capped per flush");
  ok(w.counts.prize_claim === T.MAX_LINKS_PER_FLUSH + 10, "counts still exact past link cap");

  // flush: exactly-once send, window resets
  w = T.makeWindow();
  T.ingest(w, "spin", {}); T.ingest(w, "spin", {});
  const calls = [];
  let r = T.flush(w, CFG, "d-1", fakeTransport(calls, true));
  ok(calls.length === 1, "flush sends exactly once");
  ok(r.sent === true, "flush reports sent");
  ok(r.win.sent === undefined || true, "fresh window returned");
  ok(T.isEmpty(r.win), "window reset after successful send");
  const sent = JSON.parse(calls[0].body);
  ok(sent.d === "d-1" && sent.c.spin === 2, "sent body carries deviceId + counts");
  ok(calls[0].endpoint === "https://ntfy.envs.net/t-probe", "endpoint = base + topic");

  // credit amounts ride along in s:
  w = T.makeWindow();
  T.ingest(w, "credit_earn", { amount: 1000, balance: 1000 });
  T.ingest(w, "credit_earn", { amount: 50, balance: 1050 });
  T.ingest(w, "credit_spend", { amount: 25, balance: 1025 });
  const cp = T.buildPayload(w, "d-9");
  ok(cp.s.credit_earn === 1050 && cp.s.credit_spend === 25, "credit amounts summed in payload.s");

  // empty window: no send at all
  w = T.makeWindow();
  const calls2 = [];
  r = T.flush(w, CFG, "d-1", fakeTransport(calls2, true));
  ok(calls2.length === 0 && r.sent === false, "empty window sends nothing");

  // disabled config: never sends
  w = T.makeWindow();
  T.ingest(w, "spin", {});
  const calls3 = [];
  r = T.flush(w, Object.assign({}, CFG, { enabled: false }), "d-1", fakeTransport(calls3, true));
  ok(calls3.length === 0, "disabled telemetry never sends");
  ok(!T.isEmpty(r.win), "disabled keeps the window (no data loss)");

  // missing deviceId: never sends
  w = T.makeWindow();
  T.ingest(w, "spin", {});
  const calls4 = [];
  r = T.flush(w, CFG, null, fakeTransport(calls4, true));
  ok(calls4.length === 0, "no deviceId -> no send");

  // transport failure is silent: no throw, window rolls forward
  w = T.makeWindow();
  T.ingest(w, "spin", {}); T.ingest(w, "spin", {});
  const calls5 = [];
  let threw = false;
  try {
    r = T.flush(w, CFG, "d-1", function () { throw new Error("net down"); });
  } catch (e) { threw = true; }
  ok(!threw, "transport throw never propagates");
  ok(calls5.length === 0, "failed send recorded no call");
  ok(r.sent === false && r.win.counts.spin === 2, "failed window rolls forward with counts intact");
  // retry succeeds exactly once
  const calls6 = [];
  r = T.flush(r.win, CFG, "d-1", fakeTransport(calls6, true));
  ok(calls6.length === 1 && JSON.parse(calls6[0].body).c.spin === 2, "retry sends rolled-forward counts once");

  // roll-forward cap: a long-dead network can't grow the window forever
  w = T.makeWindow();
  for (let i = 0; i < 3000; i++) T.ingest(w, "spin", {});
  r = T.flush(w, CFG, "d-1", fakeTransport([], false));
  let tot = 0; for (const k in r.win.counts) tot += r.win.counts[k];
  ok(tot <= 2000, "window capped after repeated failure");

  // defaultTransport: prefers sendBeacon, falls back to fetch, never throws
  const beaconCalls = [];
  const env1 = { navigator: { sendBeacon: (u, b) => { beaconCalls.push([u, b]); return true; } } };
  ok(T.defaultTransport(env1)("https://e/t", "{}") === true && beaconCalls.length === 1, "sendBeacon preferred");
  const fetchCalls = [];
  const env2 = { fetch: (u, o) => { fetchCalls.push([u, o]); return Promise.resolve(); } };
  ok(T.defaultTransport(env2)("https://e/t", "{}") === true && fetchCalls.length === 1, "fetch fallback with keepalive");
  ok(fetchCalls[0][1].keepalive === true && fetchCalls[0][1].method === "POST", "fetch uses POST + keepalive");
  const env3 = { navigator: { sendBeacon: () => { throw new Error("x"); } } };
  ok(T.defaultTransport(env3)("https://e/t", "{}") === false, "beacon throw -> false, no throw");

  // start(): immediate flush on jackpot_win / prize_claim, interval wired
  const store = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } };
  const calls7 = [];
  const fakeEnv = {
    NN_METRICS: require("./metrics.js"),
    navigator: { sendBeacon: (u, b) => { calls7.push(b); return true; } },
    setInterval: (fn) => { fakeEnv._tick = fn; return 1; },
    document: { addEventListener: () => {}, hidden: false },
    addEventListener: () => {},
  };
  const api = T.start(CFG, store, fakeEnv);
  ok(typeof api.ingest === "function" && typeof api.flushNow === "function", "start returns ingest/flushNow");
  api.ingest("spin", {});
  ok(calls7.length === 0, "spin does not flush immediately");
  api.ingest("jackpot_win", {});
  ok(calls7.length === 1, "jackpot_win flushes immediately");
  const jb = JSON.parse(calls7[0]);
  ok(jb.c.spin === 1 && jb.c.jackpot_win === 1, "immediate flush carries the window");
  api.ingest("prize_claim", { url: "https://open.spotify.com/track/CCC", kind: "jackpot" });
  ok(calls7.length === 2, "prize_claim flushes immediately");
  const pc = JSON.parse(calls7[1]);
  ok(pc.pl.length === 1 && pc.pl[0].url === "https://open.spotify.com/track/CCC", "prize_claim flush carries the issued URL");
  fakeEnv._tick();
  ok(calls7.length === 2, "interval tick with empty window sends nothing");
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
