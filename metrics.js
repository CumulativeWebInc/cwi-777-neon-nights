/* 777 Neon Nights — anonymous metrics event log + link-issuance ledger.
   No PII: only a random per-device session id (sid). No names, emails, IPs.
   No endpoint configured  =>  local-only ring buffer (1000 events) + manual JSON export.
   Set window.NN_METRICS_ENDPOINT (or config.metricsEndpoint) to a $0 endpoint
   Black approves (e.g. Cloudflare Worker / Apps Script / Pipedream) to enable POST. */
(function () {
  "use strict";
  const LS_LOG = "nn777-metrics-log-v1";
  const LS_OUT = "nn777-metrics-outbox-v1";
  const LS_LED = "nn777-link-ledger-v1";
  const LS_SID = "nn777-sid";
  const LS_EP  = "nn777-metrics-endpoint";
  const CAP = 1000;

  function uuid() {
    try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx".replace(/x/g, () =>
      (Math.random() * 16 | 0).toString(16)) + "-" + Date.now().toString(16);
  }
  let SID = null;
  function sid() {
    if (SID) return SID;
    try {
      SID = localStorage.getItem(LS_SID);
      if (!SID) { SID = "sid-" + uuid(); localStorage.setItem(LS_SID, SID); }
    } catch (e) { SID = "sid-mem-" + uuid(); }
    return SID;
  }
  function read(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function endpoint() {
    try {
      if (typeof window !== "undefined" && window.NN_METRICS_ENDPOINT) return window.NN_METRICS_ENDPOINT;
      const saved = typeof localStorage !== "undefined" && localStorage.getItem(LS_EP);
      if (saved) return saved;
      if (typeof window !== "undefined" && window.NN_CONFIG && window.NN_CONFIG.metricsEndpoint)
        return window.NN_CONFIG.metricsEndpoint;
    } catch (e) {}
    return null;
  }
  function setEndpoint(url) {
    try {
      if (typeof window !== "undefined") window.NN_METRICS_ENDPOINT = url || null;
      if (url) localStorage.setItem(LS_EP, url); else localStorage.removeItem(LS_EP);
    } catch (e) {}
    queueFlush();
  }

  function log(event, data) {
    const e = Object.assign({ t: new Date().toISOString(), sid: sid(), event }, data || {});
    const l = read(LS_LOG, []); l.push(e);
    while (l.length > CAP) l.shift();
    write(LS_LOG, l);
    const o = read(LS_OUT, []); o.push(e); write(LS_OUT, o);
    queueFlush();
    return e;
  }

  let flushTimer = null, flushing = false;
  function queueFlush() {
    if (!endpoint() || typeof fetch === "undefined") return;
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 4000);
  }
  function flush() {
    const ep = endpoint();
    if (!ep) return Promise.resolve({ sent: false, reason: "no-endpoint-configured" });
    if (typeof fetch === "undefined") return Promise.resolve({ sent: false, reason: "no-fetch" });
    if (flushing) return Promise.resolve({ sent: false, reason: "busy" });
    const out = read(LS_OUT, []);
    if (!out.length) return Promise.resolve({ sent: true, count: 0 });
    flushing = true;
    return fetch(ep, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "neon-nights-777", events: out }),
    }).then(r => {
      if (!r.ok) throw new Error("http-" + r.status);
      write(LS_OUT, []);
      return { sent: true, count: out.length };
    }).catch(err => ({ sent: false, reason: String((err && err.message) || err) }))
      .then(res => { flushing = false; return res; });
  }

  /* Link issuance: every streaming-link handout is recorded with timestamp + service. */
  function recordLinkIssued(service, url, context) {
    const rec = { t: new Date().toISOString(), sid: sid(), service: service, url: url, context: context || "" };
    const l = read(LS_LED, []); l.push(rec); write(LS_LED, l);
    log("link_issued", { service: service, context: context || "" });
    return rec;
  }

  function exportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      game: "neon-nights-777",
      session: sid(),
      endpoint: endpoint() || "(none — local-only)",
      events: read(LS_LOG, []),
      linkLedger: read(LS_LED, []),
      note: "Anonymous session id only. No PII collected.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "neon-nights-777-metrics.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return payload;
  }
  function clearLocal() { [LS_LOG, LS_OUT, LS_LED].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); }

  const API = {
    sid, log, flush, setEndpoint, endpoint,
    recordLinkIssued, exportAll, clearLocal,
    getLog: () => read(LS_LOG, []),
    getLedger: () => read(LS_LED, []),
    getOutbox: () => read(LS_OUT, []),
    CAP,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.NN_METRICS = API;
})();
