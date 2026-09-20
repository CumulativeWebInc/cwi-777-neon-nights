/* 777 Neon Nights — UI controller. Uses NN_CONFIG + logic.js (browser globals). */
(function () {
  "use strict";
  const C = window.NN_CONFIG;
  const L = window.NN_LOGIC; // set below from logic.js browser export
  const M = window.NN_METRICS;
  const SC = window.NN_SCORES;
  const CAB = window.NN_CABINET; // canvas cabinet renderer (cabinet.js)
  const $ = (id) => document.getElementById(id);
  const CELL = 72, VISIBLE = 3;

  /* ---------- state ---------- */
  const KEY = "nn777-state-v1";
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || L.newState(); }
  catch (e) { S = L.newState(); }
  if (!S.roundsDone) S.roundsDone = [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- language (how-to translations) ---------- */
  const LANG_KEY = "nn777-lang-v1";
  const I18N = window.NN_I18N || { en: { name: "English", bullets: [] } };
  function detectLang() {
    try {
      const nav = (navigator.language || "en").toLowerCase();
      if (I18N[nav]) return nav;
      const base = nav.split(/[-_]/)[0];
      if (I18N[base]) return base;
      if (base === "zh") return nav.includes("tw") || nav.includes("hk") ? "zh-TW" : "zh";
    } catch (e) {}
    return "en";
  }
  let lang = "en";
  try { lang = localStorage.getItem(LANG_KEY) || detectLang(); } catch (e) { lang = detectLang(); }
  if (!I18N[lang]) lang = "en";
  function applyLang(code) {
    if (!I18N[code]) code = "en";
    lang = code;
    try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
    const entry = I18N[code];
    const list = $("howtoList");
    if (list) {
      list.innerHTML = entry.bullets.map(b => `<li>${b}</li>`).join("");
      if (entry.rtl) list.setAttribute("dir", "rtl"); else list.removeAttribute("dir");
    }
    // Install guide renders in the player's language (falls back to English
    // for locales that haven't shipped their install strings yet).
    const inst = (entry && entry.install) || (I18N.en && I18N.en.install) || {};
    const it = $("installTitle");
    if (it && inst.title) {
      it.textContent = inst.title;
      const steps = $("installSteps");
      if (steps) {
        const ios = isIOS();
        const arr = ios ? [inst.ios1, inst.ios2, inst.ios3] : [inst.android, inst.ios3];
        steps.innerHTML = arr.filter(Boolean).map(s => `<li>${s}</li>`).join("");
        if (entry.rtl) steps.setAttribute("dir", "rtl"); else steps.removeAttribute("dir");
      }
      const note = $("installNote");
      if (note) note.textContent = inst.note || "";
    }
    const pk = $("langPicker");
    if (pk && pk.value !== code) pk.value = code;
  }
  function buildPicker() {
    const pk = $("langPicker");
    if (!pk) return;
    pk.innerHTML = Object.keys(I18N).map(k =>
      `<option value="${k}">${I18N[k].name}</option>`).join("");
    pk.value = lang;
    pk.addEventListener("change", () => applyLang(pk.value));
  }

  /* ---------- audio ---------- */
  const audio = new Audio(C.audioFile);
  audio.loop = true; audio.preload = "auto";
  let audioReady = false, userGestured = false, triedFull = false, audioUnlocked = false;
  audio.addEventListener("canplay", () => { audioReady = true; });
  audio.addEventListener("error", () => {
    // Loop file failed (e.g. blocked decode) — fall back to the full-quality file once.
    if (!triedFull && C.audioFileFull) {
      triedFull = true; audioReady = false;
      audio.src = C.audioFileFull; audio.load();
    } else { audioReady = false; }
  });
  function tryPlay() {
    if (!userGestured || S.muted || !audioReady) return;
    audio.play().catch(() => {});
  }
  function firstGesture() {
    userGestured = true;
    if (!audioUnlocked) {
      audioUnlocked = true;
      // First gesture: unlock synchronously INSIDE the handler. Deliberately
      // not gated on audioReady/canplay — the play() call itself carries the
      // user activation (the iPhone post-mortem: gating on canplay wasted the
      // first tap). The element goes audible as soon as data arrives; mute
      // state is still respected, and visibility/mute pauses are unchanged.
      if (!S.muted) audio.play().catch(() => {});
    }
    tryPlay();
  }
  // iOS Safari can report pointerdown late or not at all in some embedded
  // webviews; listen on both so the first tap always unlocks the music.
  document.addEventListener("pointerdown", firstGesture, { passive: true });
  document.addEventListener("touchstart", firstGesture, { passive: true });
  // Playback-state diagnostics for QA (cheap object, no PII).
  window.__nnAudioState = function () {
    return {
      ready: audioReady, gestured: userGestured, unlocked: audioUnlocked,
      triedFull: triedFull, muted: S.muted, hidden: document.hidden,
      paused: audio.paused, ended: audio.ended,
      currentTime: Math.round(audio.currentTime * 10) / 10,
      readyState: audio.readyState, error: !!audio.error,
    };
  };
  let visRetryTimer = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.pause();
      if (visRetryTimer) { clearInterval(visRetryTimer); visRetryTimer = null; }
    } else {
      // iOS interruptions (calls, alarms, silent switch) can leave the
      // element paused even after we return — retry play a few times so the
      // music actually resumes instead of one hopeful attempt.
      tryPlay();
      let n = 0;
      if (visRetryTimer) clearInterval(visRetryTimer);
      visRetryTimer = setInterval(() => {
        tryPlay();
        if (!audio.paused || S.muted || ++n >= 5) {
          clearInterval(visRetryTimer); visRetryTimer = null;
        }
      }, 1000);
    }
  });

  /* ---------- helpers ---------- */
  function fmt(sec) {
    sec = Math.floor(sec);
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function toast(msg, ms = 2600) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), ms);
  }
  function symSVG(id) {
    return `<svg aria-hidden="true"><use href="#sym-${id}"></use></svg>`;
  }
  function randSym() {
    const tot = C.symbols.reduce((a, s) => a + s.weight, 0);
    let r = Math.random() * tot;
    for (const s of C.symbols) { r -= s.weight; if (r < 0) return s.id; }
    return C.symbols[0].id;
  }

  /* ---------- reels ---------- */
  const reelEls = [0, 1, 2].map(i => document.querySelector(`.reel[data-reel="${i}"] .strip`));
  function setReelStatic(i, symbols3) {
    reelEls[i].style.transition = "none";
    reelEls[i].innerHTML = symbols3.map(s => `<div class="cell">${symSVG(s)}</div>`).join("");
    reelEls[i].style.transform = "translateY(0px)";
  }
  // initial rest position (no leaf — retired 2026-09-20 visual redo)
  setReelStatic(0, ["lemon", "cherry", "bell"]);
  setReelStatic(1, ["bell", "cherry", "bell"]);
  setReelStatic(2, ["cherry", "seven", "lemon"]);

  // Canvas cabinet owns the visible reels/buttons; the DOM strips above stay
  // as the screen-reader fallback (unchanged ids, unchanged behavior).
  if (CAB && CAB.init()) {
    CAB.setRest([["lemon", "cherry", "bell"], ["bell", "cherry", "bell"], ["cherry", "seven", "lemon"]]);
    CAB.onSpinRequest(() => { const b = $("spinBtn"); if (b && !b.disabled) b.click(); });
  }

  /* Visible reel animation is owned by the canvas cabinet (cabinet.js):
     camera push-in, motion blur, left-to-right settle bounce, near-miss
     anticipation, jackpot token pour. The DOM strips above remain as the
     screen-reader fallback and are left at their rest positions. */

  /* ---------- UI refresh ---------- */
  function refresh() {
    L.regenSpins(S);
    $("spinsLeft").textContent = S.spins;
    $("spinBtn").disabled = !L.canSpin(S);
    if (CAB) CAB.setSpins(S.spins, L.canSpin(S));
    $("listenTime").textContent = fmt(S.listeningSec);
    // stage / round
    const st = C.stages[S.stageIdx];
    document.body.dataset.theme = st.theme === "orange" ? "" : st.theme;
    $("stageName").textContent = `Stage ${S.stageIdx + 1}/3 — ${st.name}`;
    const r = L.currentRound(S);
    if (r) {
      const p = L.roundProgress(S);
      $("roundName").textContent = r.name;
      const unit = p.unit === "listening" ? "listened" : p.unit;
      $("roundProg").textContent = p.done ? "done ✓"
        : (p.unit === "listening" ? `${fmt(p.have)} / ${fmt(p.need)}` : `${p.have} / ${p.need} ${unit}`);
      $("roundFill").style.width = Math.min(100, (p.have / p.need) * 100) + "%";
    } else {
      $("roundName").textContent = "All rounds complete 🏆";
      $("roundProg").textContent = "";
      $("roundFill").style.width = "100%";
    }
    // next prize
    const next = C.listenPrizes.find(p => S.listeningSec < p.at && !S.prizesClaimed.includes(p.id));
    $("nextPrize").textContent = next ? `next prize ${fmt(next.at - S.listeningSec)}` : "all prizes claimed 🏆";
    // prizes list
    const ul = $("prizeList"); ul.innerHTML = "";
    C.listenPrizes.forEach(p => {
      const li = document.createElement("li");
      const unlocked = S.listeningSec >= p.at, claimed = S.prizesClaimed.includes(p.id);
      li.className = unlocked && !claimed ? "unlocked" : "";
      li.innerHTML = `<span><b>${p.name}</b> — ${fmt(p.at)} listening<br><small>${p.desc}</small></span>`;
      if (unlocked && !claimed) {
        const b = document.createElement("button");
        b.className = "claim-btn"; b.textContent = "CLAIM";
        b.onclick = () => claimPrizeUI(p.id);
        li.appendChild(b);
      } else if (claimed) {
        const s = document.createElement("span"); s.textContent = "✓ claimed"; li.appendChild(s);
      } else {
        const s = document.createElement("span"); s.textContent = fmt(p.at - S.listeningSec) + " to go"; li.appendChild(s);
      }
      ul.appendChild(li);
    });
    // encore button
    const eb = $("encoreBtn");
    if (L.bonusAvailable(S)) { eb.classList.remove("locked"); eb.title = "Encore Round ready!"; }
    else { eb.classList.add("locked"); eb.title = L.bonusUnlocked(S) ? "Encore recharges daily" : "Finish Midnight Strip to unlock the Encore Round"; }
    // stats
    $("statsGrid").innerHTML = `
      <div>Total spins<br><b>${S.totalSpins}</b></div>
      <div>Listening<br><b>${fmt(S.listeningSec)}</b></div>
      <div>Jackpots (777)<br><b>${S.jackpots}</b></div>
      <div>Triple matches<br><b>${S.triples}</b></div>
      <div>Rounds cleared<br><b>${S.roundsDone.length} / 9</b></div>
      <div>Encore wins<br><b>${S.bonusWins}</b></div>`;
    // mute icon
    $("muteBtn").textContent = S.muted ? "🔇" : "🔊";
    save();
  }

  /* ---------- spin ---------- */
  let spinning = false;
  function doSpin() {
    if (spinning) return;
    L.regenSpins(S);
    if (!L.canSpin(S)) { toast("Out of spins — free spins regenerate over time. The music keeps playing 🎧"); return; }
    userGestured = true; tryPlay();
    spinning = true; $("spinBtn").disabled = true;
    $("winBanner").textContent = "";
    if (CAB) CAB.setSignFlare(1);   // JACKPOT! sign flares while reels spin
    const res = L.spin(S, Math.random);
    L.applySpinResult(S, res);
    const allStopped = () => finishSpin(res);
    if (CAB) CAB.spin(res.rows).then(allStopped);
    else setTimeout(allStopped, 2400); // no-canvas fallback keeps game playable
    refresh();
    M.log("spin", { totalSpins: S.totalSpins, spinsLeft: S.spins });
  }

  function finishSpin(res) {
    spinning = false;
    if (res.jackpot) {
      // Golden token pour on the canvas, then the unchanged payout screen.
      if (CAB) CAB.celebrate();
      $("winBanner").textContent = "🎰 JACKPOT! 777 🎰";
      setTimeout(() => { if (CAB) CAB.endCelebrate(); openJackpot(); }, 2400);
    } else {
      if (CAB) CAB.setSignFlare(0);
      if (res.triple) {
        const label = C.symbols.find(s => s.id === res.triple).label;
        $("winBanner").textContent = `✨ Triple ${label}! ✨`;
        if (res.triple === "bell" && L.bonusUnlocked(S))
          toast("🔔 Triple bell! The Encore Round is calling — tap 🎰");
      }
    }
    const doneRounds = L.advanceRounds(S);
    doneRounds.forEach(id => {
      const meta = findRound(id);
      toast(`✅ Round complete: ${meta.name}${S.stageIdx < 3 && L.currentRound(S) ? "" : ""}`);
      if (id === "r3") { toast("🌃 Welcome to the Midnight Strip — Stage 2 unlocked"); M.log("stage_unlock", { stage: 2, name: "Midnight Strip" }); }
      if (id === "r6") { toast("🌃 Welcome to the 777 Skyline — Stage 3 unlocked. Encore Round available!"); M.log("stage_unlock", { stage: 3, name: "777 Skyline" }); }
    });
    const newPrizes = L.unlockedPrizes(S);
    if (newPrizes.length) toast(`🎁 Listening prize unlocked: ${newPrizes[0].name} — claim it below`);
    refresh();
  }

  function findRound(id) {
    for (const st of C.stages) for (const r of st.rounds) if (r.id === id) return r;
    return { name: id };
  }

  /* ---------- payout screen ---------- */
  // One payout screen for every win: prize name, what was won, link choice,
  // claim action. Every streaming-link tap is issuance-tracked.
  function showPayout(opts) {
    $("payoutTitle").textContent = opts.title;
    $("payoutWhat").innerHTML = opts.what;
    const links = $("payoutLinks"); links.innerHTML = "";
    (opts.links || []).forEach(l => {
      const a = document.createElement("a");
      a.href = l.url; a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = `${l.label}<small>${l.sub || ""}</small>`;
      a.addEventListener("click", () => {
        M.recordLinkIssued(l.label, l.url, opts.title);
        M.log("prize_claim", { kind: opts.kind, via: l.label });
        toast(`✅ Link issued: ${l.label} — enjoy the music 🎶`);
        setTimeout(() => $("payoutModal").classList.add("hidden"), 600);
      });
      links.appendChild(a);
    });
    const files = $("payoutFiles"); files.innerHTML = "";
    (opts.files || []).forEach(f => {
      const a = document.createElement("a");
      a.href = f; a.download = f.split("/").pop();
      a.textContent = "⬇ " + f.split("/").pop();
      a.addEventListener("click", () => M.log("prize_claim", { kind: opts.kind, file: f.split("/").pop() }));
      files.appendChild(a);
    });
    $("payoutScore").textContent = SC.computeScore(S).score;
    $("payoutClaim").textContent = opts.claimLabel || "CLAIM & CLOSE";
    $("payoutModal").classList.remove("hidden");
  }
  $("payoutClaim").addEventListener("click", () => {
    M.log("prize_claim", { kind: "modal-close" });
    $("payoutModal").classList.add("hidden");
  });
  $("payoutSaveScore").addEventListener("click", () => saveScore());
  $("payoutCopyCode").addEventListener("click", () => copyScoreCode());

  /* ---------- jackpot ---------- */
  function openJackpot() {
    M.log("jackpot_win", { spinsSinceJackpot: S.spinsSinceJackpot, totalSpins: S.totalSpins });
    showPayout({
      kind: "jackpot",
      title: "🎰 JACKPOT! 777 🎰",
      what: `You hit <b>777</b> on <b>Neon Nights Pt. 777</b> — pick your <b>free</b> stream:`,
      links: C.jackpotLinks.map(l => ({ label: l.platform, sub: "Neon Nights Pt. 777 — free stream", url: l.url })),
      claimLabel: "KEEP SPINNING",
    });
  }

  /* ---------- encore / bonus round ---------- */
  $("encoreBtn").addEventListener("click", () => {
    if (!L.bonusAvailable(S)) {
      toast(L.bonusUnlocked(S) ? "Encore recharges — come back tomorrow 🌙" : "Clear Midnight Strip + 5 min listening to unlock the Encore Round");
      return;
    }
    $("bonusLinks").classList.add("hidden");
    $("bonusLinks").innerHTML = "";
    $("bonusSpinBtn").style.display = "";
    const bs = $("bonusStrip");
    bs.style.transition = "none";
    bs.innerHTML = ["disc", "disc", "disc"].map(s => `<div class="cell">${symSVG(s)}</div>`).join("");
    bs.style.transform = "translateY(0px)";
    $("bonusModal").classList.remove("hidden");
  });

  $("bonusSpinBtn").addEventListener("click", () => {
    const bs = $("bonusStrip");
    const seq = [];
    for (let k = 0; k < 16; k++) seq.push("disc");
    bs.style.transition = "none";
    bs.innerHTML = seq.map(s => `<div class="cell">${symSVG(s)}</div>`).join("");
    bs.style.transform = "translateY(0px)";
    void bs.offsetHeight;
    const target = -((seq.length - VISIBLE) * CELL);
    bs.style.transition = "transform 1600ms cubic-bezier(.12,.8,.24,1)";
    bs.style.transform = `translateY(${target}px)`;
    $("bonusSpinBtn").style.display = "none";
    setTimeout(() => {
      S.bonusLastPlayed = Date.now(); S.bonusWins++;
      save();
      M.log("encore_play", { bonusWins: S.bonusWins });
      $("bonusModal").classList.add("hidden");
      showPayout({
        kind: "encore",
        title: "🎶 ENCORE ROUND 🎶",
        what: `Bonus round complete — every spin wins. Pick your <b>free</b> catalog music link:`,
        links: C.bonus.prizes.map(p => ({ label: p.track, sub: `${p.artist} — ${p.note}`, url: p.url })),
        claimLabel: "DONE",
      });
      refresh();
    }, 1700);
  });

  /* ---------- prize claiming ---------- */
  function claimPrizeUI(id) {
    const p = L.claimPrize(S, id);
    if (!p) return;
    const files = p.files || (p.file ? [p.file] : []);
    if (id === "golden") files.push("art/badge-777.png");
    if (id === "golden") toast(`🌟 Golden Reel active: ${C.goldenSpins} spins, double 7s odds!`);
    showPayout({
      kind: "prize",
      title: "🎁 PRIZE UNLOCKED",
      what: `<b>${p.name}</b> — ${p.desc}`,
      files,
      claimLabel: "CLAIM & CLOSE",
    });
    refresh();
  }

  /* ---------- install UI: native prompt + iOS guided walkthrough ----------
     Translated into the player's language (see applyLang). PWA only — the UI
     never claims App Store or Google Play availability. */
  function isIOS() {
    try {
      const ua = navigator.userAgent || "";
      return /iphone|ipad|ipod/i.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    } catch (e) { return false; }
  }
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const b = $("installBtn");
    if (b) b.classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const b = $("installBtn");
    if (b) b.classList.add("hidden");
  });
  function openInstall() {
    applyLang(lang); // re-render in case the language changed since page load
    $("installGoBtn").classList.toggle("hidden", !deferredPrompt);
    $("installModal").classList.remove("hidden");
  }
  const iBtn = $("installBtn");
  if (iBtn) {
    // On iOS there is no beforeinstallprompt — the walkthrough is the install
    // path, so the button is always visible. Everywhere else it appears when
    // the browser fires beforeinstallprompt.
    if (isIOS() && !navigator.standalone) iBtn.classList.remove("hidden");
    iBtn.addEventListener("click", openInstall);
  }
  const goBtn = $("installGoBtn");
  if (goBtn) goBtn.addEventListener("click", () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; }).catch(() => {});
    $("installModal").classList.add("hidden");
  });
  window.NN_INSTALL_TEST = { isIOS, openInstall }; // QA wiring hook

  /* ---------- modals / buttons ---------- */
  document.querySelectorAll("[data-close]").forEach(b =>
    b.addEventListener("click", () => $(b.dataset.close).classList.add("hidden")));
  document.querySelectorAll(".modal").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));
  $("spinBtn").addEventListener("click", doSpin);
  $("rulesBtn").addEventListener("click", () => $("rulesModal").classList.remove("hidden"));
  $("muteBtn").addEventListener("click", () => {
    S.muted = !S.muted;
    if (S.muted) audio.pause(); else tryPlay();
    save(); refresh();
  });

  /* ---------- listening clock + regen ---------- */
  let lastMinute = 0;
  setInterval(() => {
    const audible = !S.muted && !document.hidden && !audio.paused && audioReady;
    if (L.listenTick(S, audible)) {
      const newPrizes = L.unlockedPrizes(S);
      if (newPrizes.length) toast(`🎁 Listening prize unlocked: ${newPrizes[0].name} — claim it below`);
    }
    const minute = Math.floor(S.listeningSec / 60);
    if (minute > lastMinute) { lastMinute = minute; M.log("listen_minute", { minute }); }
    refresh();
  }, 1000);

  /* ---------- high scores + metrics panel ---------- */
  function renderBoard() {
    const ol = $("scoreBoard");
    if (!ol) return;
    const b = SC.getBoard();
    ol.innerHTML = b.length
      ? b.map((e, i) => `<li><b>#${i + 1}</b> ${escapeHtml(e.name)} — <b>${e.score}</b> <span class="fine">(${e.tag})</span></li>`).join("")
      : `<li class="fine">No scores yet — play and save yours.</li>`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function saveScore() {
    const code = SC.encode(S);
    const name = ($("scoreName") && $("scoreName").value.trim()) || "Player";
    const r = SC.add(code, name);
    if (r.ok) { M.log("score_submit", { score: r.score }); toast(`🏆 Score saved: ${r.score}`); renderBoard(); }
    else toast("Score code invalid — not saved");
  }
  function copyScoreCode() {
    const code = SC.encode(S);
    const done = () => toast("📋 Score code copied — share it to prove your score");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => toast("Copy failed — long-press to copy"));
    else toast("Clipboard unavailable on this browser");
  }
  $("saveScoreBtn").addEventListener("click", saveScore);
  $("copyCodeBtn").addEventListener("click", copyScoreCode);
  $("importScoreBtn").addEventListener("click", () => {
    const code = $("importCode").value.trim();
    if (!code) return;
    const r = SC.add(code, ($("scoreName") && $("scoreName").value.trim()) || "Imported");
    if (r.ok) { toast(`✅ Verified score ${r.score} added`); renderBoard(); $("importCode").value = ""; }
    else toast(`❌ Score code invalid (${r.reason}) — not added`);
  });
  $("exportMetricsBtn").addEventListener("click", () => {
    const p = M.exportAll();
    $("metricsNote").textContent = `${p.events.length} events, ${p.linkLedger.length} links issued. Endpoint: ${p.endpoint}`;
  });

  refresh();
  buildPicker();
  applyLang(lang);
  renderBoard();
  M.log("game_start", { lang });
  if (!M.endpoint()) $("metricsNote").textContent = "Metrics are local-only (no endpoint configured). Export anytime.";
  // Headless-QA handle: drives the real UI path (spin/refresh/state) for tests.
  window.NN_GAME = { spin: doSpin, refresh, state: () => S };
})();
