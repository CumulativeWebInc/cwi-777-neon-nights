/* 777 Neon Nights — UI controller. Uses NN_CONFIG + logic.js (browser globals). */
import { spinLabelFor } from './cabinet-anim.js';
(function () {
  "use strict";
  const C = window.NN_CONFIG;
  const L = window.NN_LOGIC; // set below from logic.js browser export
  const M = window.NN_METRICS;
  const metric = (name, data) => { try { M.record(localStorage, name, data || {}); } catch (e) {} };
  const SC = window.NN_SCORES;
  const CAB = window.NN_CABINET; // canvas cabinet renderer (cabinet.js)
  /* ---------- cabinet safety: a 3D-cabinet exception must NEVER swallow the
     DOM banner + payout modal (v8.2 hardening — Black's +50-with-no-announcement
     was a throwing CAB.showPrize). Every CAB call goes through cabSafe: the error
     is logged to metrics (cabinet_error) and the DOM flow continues. ---------- */
  function cabSafe(what, fn) {
    if (!CAB) return null;
    try { return fn(CAB); } catch (e) {
      metric("cabinet_error", { what, error: String((e && e.message) || e).slice(0, 200) });
      return null;
    }
  }
  const $ = (id) => document.getElementById(id);
  const CELL = 72, VISIBLE = 3;

  /* ---------- state ---------- */
  const KEY = "nn777-state-v1";
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || L.newState(); }
  catch (e) { S = L.newState(); }
  if (!S.roundsDone) S.roundsDone = [];
  if (typeof S.credits !== "number" || S.credits < 0) S.credits = 0; // Neon Credits bank (fun points)
  if (!Array.isArray(S.creditsAwarded)) S.creditsAwarded = []; // prize IDs whose unlock award already paid (once ever)
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
    // The cabinet's physical button label follows the language: translate the
    // DOM fallback button and notify the 3D cabinet (it redraws its texture).
    const sb = $("spinBtn");
    if (sb) sb.textContent = spinLabelFor(code, I18N);
    try { window.dispatchEvent(new CustomEvent("nn777-lang", { detail: code })); } catch (e) {}
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
    if (!userGestured || S.muted || !audioReady || silenced) return;
    audio.play().catch(() => {});
  }
  // v8.2 — SILENCE IS THE TRIGGER: in GAME OVER with zero Neon Credits the
  // song must STOP (pause, not just quiet). Any way forward (replay credit,
  // like/share/follow award, bought or regenerated spins) lifts the silence
  // and the music resumes via tryPlay().
  let silenced = false;
  function updateSilence() {
    const should = L.shouldSilence(S);
    if (should && !silenced) {
      silenced = true;
      try { audio.pause(); } catch (e) {}
      metric("song_silence", { credits: S.credits });
    } else if (!should && silenced) {
      silenced = false;
      tryPlay();
    }
  }
  // v8.2 — song-replay detector: each completed loop banks +25 Neon Credits.
  // Wrapped (backward) timeupdates after hearing the track to the end count;
  // seeks never count (see logic.js replayTick).
  let replaySt = L.newReplayState();
  let seekingNow = false;
  audio.addEventListener("seeking", () => { seekingNow = true; });
  audio.addEventListener("seeked", () => { seekingNow = false; });
  audio.addEventListener("emptied", () => { replaySt = L.newReplayState(); });
  audio.addEventListener("play", () => { metric("song_play", {}); });
  audio.addEventListener("timeupdate", () => {
    if (S.muted || audio.paused || !audioReady) return;
    if (L.replayTick(replaySt, audio.currentTime, audio.duration, seekingNow)) {
      const n = C.creditAwards.replay;
      bankCredits(n, "replay");
      metric("song_replay", { award: n, balance: S.credits });
      toast(creditsText("replay", { n }));
      refresh();
    }
  });
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

  /* ---------- translated win announcements (41-language i18n) ----------
     Every win names WHAT was won on screen — the player never has to guess.
     Falls back to English for locales that haven't shipped win strings. */
  function winText(key, vars) {
    const entry = I18N[lang] && I18N[lang].win;
    let t = (entry && entry[key]) || (I18N.en && I18N.en.win && I18N.en.win[key]) || "";
    if (vars) for (const k of Object.keys(vars)) t = t.split("{" + k + "}").join(String(vars[k]));
    return t;
  }
  function claimWord() { return winText("claim") || "CLAIM"; }
  /* ---------- Neon Credits (fun points — no money value) ---------- */
  // Award table: jackpot = 1000 (reaches the link price instantly),
  // triple = 50, listening-prize unlock = 25. Banked in S.credits,
  // persisted in localStorage via save(), shown on the machine display.
  function creditsText(key, vars) {
    const entry = I18N[lang] && I18N[lang].credits;
    let t = (entry && entry[key]) || (I18N.en && I18N.en.credits && I18N.en.credits[key]) || "";
    if (vars) for (const k of Object.keys(vars)) t = t.split("{" + k + "}").join(String(vars[k]));
    return t;
  }
  function creditScoreLine() {
    return "⭐ " + creditsText("score") + ": " + S.credits;
  }
  function bankCredits(n, via) {
    n = Math.max(0, n | 0);
    if (!n) return S.credits;
    S.credits += n; save();
    metric("credit_earn", { amount: n, balance: S.credits, via: via || "win" });
    return S.credits;
  }
  function spendCredits(n, via) {
    n = Math.max(0, n | 0);
    if (S.credits < n) return false;
    S.credits -= n; save();
    metric("credit_spend", { amount: n, balance: S.credits, via: via || "redeem" });
    return true;
  }
  // Persistent on-screen win announcement + toast, naming the prize.
  function announcePrizeUnlock(p) {
    const msg = winText("prize", { name: p.name, claim: claimWord() });
    // +25 Neon Credits per listening-prize unlock — paid ONCE EVER per prize.
    // The announcement itself stays once-per-session, but the award must not
    // re-bank on every reload (that would let a player farm credits by
    // reloading). S.creditsAwarded persists the paid prize IDs.
    if (!S.creditsAwarded.includes(p.id)) {
      S.creditsAwarded.push(p.id);
      bankCredits(C.creditAwards.prize);
    }
    $("winBanner").textContent = msg;
    cabSafe("showPrize", c => c.showPrize(msg, creditScoreLine())); // prize name + credit score ON THE MACHINE (all 41 languages)
    toast(msg);
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
  const cabReady = !!cabSafe("init", c => c.init());
  if (cabReady) {
    cabSafe("setRest", c => c.setRest([["lemon", "cherry", "bell"], ["bell", "cherry", "bell"], ["cherry", "seven", "lemon"]]));
    cabSafe("onSpinRequest", c => c.onSpinRequest(() => { const b = $("spinBtn"); if (b && !b.disabled) b.click(); }));
  }

  /* Visible reel animation is owned by the canvas cabinet (cabinet.js):
     camera push-in, motion blur, left-to-right settle bounce, near-miss
     anticipation, jackpot token pour. The DOM strips above remain as the
     screen-reader fallback and are left at their rest positions. */

  /* ---------- UI refresh ---------- */
  function refresh() {
    L.regenSpins(S);
    updateSilence(); // v8.2: GAME OVER + 0 credits => song stops. Silence is the trigger.
    $("spinsLeft").textContent = S.spins;
    $("spinBtn").disabled = !L.canSpin(S);
    cabSafe("setSpins", c => c.setSpins(S.spins, L.canSpin(S)));
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
        b.className = "claim-btn"; b.textContent = claimWord();
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
    // v8.2: GAME OVER modal follows the spin bank (rising edge shows it).
    if (L.gameOver(S)) maybeShowGameOver();
    else if (goKey !== null) { goKey = null; hideGameOver(); }
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
    cabSafe("clearPrize", c => c.clearPrize()); // new pull: the machine's prize readout resets
    cabSafe("setSignFlare", c => c.setSignFlare(1));   // JACKPOT! sign flares while reels spin
    const res = L.spin(S, Math.random);
    L.applySpinResult(S, res);
    const allStopped = () => finishSpin(res);
    const spinPromise = cabSafe("spin", c => c.spin(res.rows));
    if (spinPromise && typeof spinPromise.then === "function")
      spinPromise.then(allStopped, (e) => { // rejected 3D spin: log, then finish on the DOM fallback
        metric("cabinet_error", { what: "spin_reject", error: String((e && e.message) || e).slice(0, 200) });
        allStopped();
      });
    else setTimeout(allStopped, 2400); // no-canvas fallback keeps game playable
    refresh();
    metric("spin", { totalSpins: S.totalSpins, spinsLeft: S.spins,
      middle: res.middle.join(","), triple: res.triple || null, jackpot: !!res.jackpot });
  }

  function finishSpin(res) {
    spinning = false;
    if (res.jackpot) {
      // Golden token pour on the canvas, then the credit-claim payout screen.
      cabSafe("celebrate", c => c.celebrate());
      bankCredits(C.creditAwards.jackpot); // +1000: jackpot reaches the link price instantly
      $("winBanner").textContent = winText("jackpot");
      cabSafe("showPrize", c => c.showPrize(winText("jackpot"), creditScoreLine())); // prize name + credit score ON THE MACHINE
      setTimeout(() => { cabSafe("endCelebrate", c => c.endCelebrate()); openJackpot(); }, 2400);
    } else {
      cabSafe("setSignFlare", c => c.setSignFlare(0));
      if (res.triple) {
        const label = C.symbols.find(s => s.id === res.triple).label;
        bankCredits(C.creditAwards.triple); // +50 Neon Credits per triple
        $("winBanner").textContent = winText("triple", { label });
        cabSafe("showPrize", c => c.showPrize($("winBanner").textContent, creditScoreLine())); // triple + credit score ON THE MACHINE
        if (res.triple === "bell" && L.bonusUnlocked(S))
          toast("🔔 Triple bell! The Encore Round is calling — tap 🎰");
        setTimeout(() => openTriplePayout(label), 1200);
      }
    }
    const doneRounds = L.advanceRounds(S);
    doneRounds.forEach(id => {
      const meta = findRound(id);
      toast(`✅ Round complete: ${meta.name}${S.stageIdx < 3 && L.currentRound(S) ? "" : ""}`);
      if (id === "r3") { toast("🌃 Welcome to the Midnight Strip — Stage 2 unlocked"); metric("stage_unlock", { stage: 2, name: "Midnight Strip" }); }
      if (id === "r6") { toast("🌃 Welcome to the 777 Skyline — Stage 3 unlocked. Encore Round available!"); metric("stage_unlock", { stage: 3, name: "777 Skyline" }); }
    });
    announceNewPrizes();
    refresh();
  }

  function findRound(id) {
    for (const st of C.stages) for (const r of st.rounds) if (r.id === id) return r;
    return { name: id };
  }

  /* ---------- payout screen ---------- */
  // One payout screen for every win: prize name, credit award, cash-in/save
  // choice, link choice. Wins with a credit award (jackpot/triple/listening
  // prize) bank the award first, then ASK: "Cash in now, or save as credit?"
  // Cash-in (balance >= link price) opens the 10 allowlisted music platforms;
  // one tap issues the link and deducts the price. Save just closes.
  // The encore round keeps the legacy direct-link flow (no credits).
  function showPayout(opts) {
    const award = Math.max(0, opts.award | 0);
    const creditFlow = award > 0;
    const price = C.creditLinkPrice;
    $("payoutTitle").textContent = opts.title;
    $("payoutWhat").innerHTML = opts.what;
    const creditBox = $("payoutCreditBox");
    const linksEl = $("payoutLinks");
    const actions = $("payoutActions");
    const cashIn = $("payoutCashIn");
    const saveBtn = $("payoutSave");
    linksEl.innerHTML = ""; linksEl.classList.add("hidden");
    let linksShown = false;
    function renderLinks() {
      if (linksShown) return; linksShown = true;
      (opts.links || []).forEach(l => {
        const a = document.createElement("a");
        a.href = l.url; a.target = "_blank"; a.rel = "noopener";
        a.innerHTML = `${l.label}<small>${l.sub || ""}</small>`;
        a.addEventListener("click", () => {
          if (!spendCredits(price)) {
            toast("⏳ " + creditsText("need", { n: price - S.credits }));
            return;
          }
          
          metric("prize_claim", { kind: opts.kind, via: l.label, credits: true });
          toast(`✅ Link issued: ${l.label} — enjoy the music 🎶`);
          refresh();
          setTimeout(() => $("payoutModal").classList.add("hidden"), 600);
        });
        linksEl.appendChild(a);
      });
      linksEl.classList.remove("hidden");
    }
    const files = $("payoutFiles"); files.innerHTML = "";
    (opts.files || []).forEach(f => {
      const a = document.createElement("a");
      a.href = f; a.download = f.split("/").pop();
      a.textContent = "⬇ " + f.split("/").pop();
      a.addEventListener("click", () => metric("prize_claim", { kind: opts.kind, file: f.split("/").pop() }));
      files.appendChild(a);
    });
    $("payoutScore").textContent = SC.computeScore(S).score;
    if (creditFlow) {
      // The award was already banked before the modal opened (finishSpin/claim).
      creditBox.style.display = "";
      $("payoutEarn").textContent = creditsText("earned", { n: award });
      $("payoutScoreLine").textContent = creditScoreLine();
      $("payoutAsk").textContent = creditsText("ask");
      $("payoutDisclaimer").textContent = creditsText("disclaimer");
      actions.style.display = "";
      cashIn.style.display = "";
      cashIn.textContent = creditsText("cashin");
      cashIn.onclick = () => {
        if (S.credits < price) {
          toast("⏳ " + creditsText("need", { n: price - S.credits }));
          return;
        }
        metric("credit_cashin_open", { kind: opts.kind, balance: S.credits });
        creditBox.style.display = "none";
        actions.style.display = "none";
        $("payoutWhat").innerHTML = "<b>" + creditsText("choose") + "</b>";
        renderLinks();
      };
      saveBtn.textContent = creditsText("save");
      saveBtn.onclick = () => {
        metric("credit_save", { kind: opts.kind, balance: S.credits });
        $("payoutModal").classList.add("hidden");
        refresh();
      };
    } else {
      // Legacy direct-link flow (encore round): no credits involved.
      creditBox.style.display = "none";
      cashIn.style.display = "none";
      actions.style.display = "";
      saveBtn.textContent = opts.claimLabel || "CLOSE";
      saveBtn.onclick = () => {
        metric("prize_claim", { kind: opts.kind + "-close" });
        $("payoutModal").classList.add("hidden");
      };
      renderLinks();
    }
    $("payoutModal").classList.remove("hidden");
  }
  $("payoutSaveScore").addEventListener("click", () => saveScore());
  $("payoutCopyCode").addEventListener("click", () => copyScoreCode());

  /* ---------- jackpot ---------- */
  function openJackpot() {
    metric("jackpot_win", { spinsSinceJackpot: S.spinsSinceJackpot, totalSpins: S.totalSpins });
    showPayout({
      kind: "jackpot",
      title: winText("jackpot"),
      what: `You hit <b>777</b> on <b>Neon Nights Pt. 777</b> — <b>+${C.creditAwards.jackpot} Neon Credits</b> banked!`,
      links: C.jackpotLinks.map(l => ({ label: l.platform, sub: "Neon Nights Pt. 777 — free stream", url: l.url })),
      award: C.creditAwards.jackpot,
    });
  }

  /* ---------- triple (wins get the same cash-in/save claim modal) ---------- */
  function openTriplePayout(label) {
    showPayout({
      kind: "triple",
      title: winText("triple", { label }),
      what: `Triple <b>${label}</b> — nice hit! <b>+${C.creditAwards.triple} Neon Credits</b> banked.`,
      links: C.jackpotLinks.map(l => ({ label: l.platform, sub: "Neon Nights Pt. 777 — free stream", url: l.url })),
      award: C.creditAwards.triple,
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
      metric("encore_play", { bonusWins: S.bonusWins });
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
    // Every listening prize ships its free catalog music links — the fix for
    // "the prize didn't generate a music link". Same verified platform URLs
    // the Encore Round already uses (see openJackpot), allowlisted in tests.
    const musicLinks = C.jackpotLinks.map(l => ({ label: l.platform, sub: "Neon Nights Pt. 777 — free stream", url: l.url }));
    $("winBanner").textContent = winText("prize", { name: p.name, claim: claimWord() });
    showPayout({
      kind: "prize",
      title: winText("prize", { name: p.name, claim: claimWord() }),
      what: `<b>${p.name}</b> — ${p.desc}`,
      links: musicLinks,
      files,
      award: C.creditAwards.prize,
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
    m.addEventListener("click", e => {
      // The GAME OVER modal never closes on backdrop click — in silence the
      // earn actions are the only way forward.
      if (e.target === m && m.id !== "gameoverModal") m.classList.add("hidden");
    }));
  // v8.2 GAME OVER actions
  $("buySpinsBtn").addEventListener("click", () => {
    const r = L.buySpins(S);
    if (!r.ok) {
      toast(creditsText("needSpins", { n: Math.max(0, C.spinBuy.price - S.credits) }));
      return;
    }
    save();
    metric("credit_spend", { amount: C.spinBuy.price, balance: S.credits, via: "spin_buy" });
    metric("spin_buy", { price: C.spinBuy.price, spins: C.spinBuy.spins, balance: S.credits });
    toast(creditsText("boughtSpins", { n: C.spinBuy.spins }));
    refresh();
  });
  $("shareBtn").addEventListener("click", doShare);
  $("gameoverClose").addEventListener("click", () => $("gameoverModal").classList.add("hidden"));
  $("spinBtn").addEventListener("click", doSpin);
  $("rulesBtn").addEventListener("click", () => $("rulesModal").classList.remove("hidden"));
  $("muteBtn").addEventListener("click", () => {
    S.muted = !S.muted;
    if (S.muted) audio.pause(); else tryPlay();
    save(); refresh();
  });

  /* ---------- listening clock + regen ---------- */
  let lastMinute = 0;
  // Each prize announces exactly once per session: unlockedPrizes() keeps
  // returning unclaimed prizes, so without this the banner/toast would
  // re-fire every second until the player taps CLAIM.
  const announcedPrizes = new Set();
  function announceNewPrizes() {
    for (const p of L.unlockedPrizes(S)) {
      if (announcedPrizes.has(p.id)) continue;
      announcedPrizes.add(p.id);
      announcePrizeUnlock(p);
    }
  }
  setInterval(() => {
    const audible = !S.muted && !document.hidden && !audio.paused && audioReady;
    L.listenTick(S, audible);
    announceNewPrizes();
    const minute = Math.floor(S.listeningSec / 60);
    if (minute > lastMinute) { lastMinute = minute; metric("listen_minute", { minute }); }
    refresh();
  }, 1000);

  /* ---------- v8.2 GAME OVER + Earn panel ---------- */
  // Modal visibility key: re-render whenever the game-over economy changes
  // (balance, awarded once-ever actions, language). Rising edge (null -> key)
  // records exactly one game_over metric per game-over entry.
  let goKey = null;
  function maybeShowGameOver() {
    if (!L.gameOver(S)) { goKey = null; return; }
    const key = S.spins + ":" + S.credits + ":" + lang + ":" + S.creditsAwarded.join(",");
    if (goKey === null) metric("game_over", { credits: S.credits });
    if (goKey !== key) { goKey = key; showGameOver(); }
  }
  function showGameOver() {
    const price = C.spinBuy.price, n = C.spinBuy.spins;
    $("gameoverTitle").textContent = "💀 " + creditsText("gameover");
    $("gameoverMsg").textContent = creditsText("gameoverMsg");
    $("gameoverScore").textContent = creditScoreLine();
    $("gameoverDisclaimer").textContent = creditsText("disclaimer");
    const opts = L.earnOptions(S);
    const buyBtn = $("buySpinsBtn");
    buyBtn.textContent = creditsText("buySpins", { n, price });
    buyBtn.disabled = !opts.canBuy;
    $("buySpinsNote").textContent = opts.canBuy ? ""
      : creditsText("needSpins", { n: Math.max(0, price - S.credits) });
    // Earn panel: like / follow / share — only while credits < 25.
    $("earnTitle").textContent = creditsText("earnTitle");
    $("earnIntro").textContent = creditsText("earnIntro");
    const showEarn = opts.showLike || opts.showShare || opts.showFollow;
    $("earnPanel").classList.toggle("hidden", !showEarn);
    renderEarnLinks("like", opts.showLike, C.likeLinks, "❤️ ", doLike, "likeSong", "likeHint");
    renderEarnLinks("follow", opts.showFollow, C.followLinks, "➕ ", doFollow, "followTitle", "followHint");
    $("shareSection").classList.toggle("hidden", !opts.showShare);
    if (opts.showShare) {
      $("shareBtn").textContent = creditsText("shareSong");
      $("shareHint").textContent = creditsText("shareHint");
    }
    // In silence (0 spins + 0 credits) the close button is hidden: the earn
    // actions are the only way forward. Backdrop clicks never dismiss this modal.
    const closeBtn = $("gameoverClose");
    closeBtn.textContent = creditsText("keepListening");
    closeBtn.style.display = silenced ? "none" : "";
    // Machine marquee shows GAME OVER on the cabinet (3D + DOM fallback).
    cabSafe("showPrize", c => c.showPrize(creditsText("gameover"), creditScoreLine()));
    $("gameoverModal").classList.remove("hidden");
  }
  function renderEarnLinks(section, show, links, icon, handler, labelKey, hintKey) {
    $(section + "Section").classList.toggle("hidden", !show);
    if (!show) return;
    $(section + "Label").textContent = creditsText(labelKey);
    const wrap = $(section + "Btns");
    wrap.innerHTML = "";
    links.forEach(l => {
      const a = document.createElement("a");
      a.href = l.url; a.target = "_blank"; a.rel = "noopener";
      a.className = "earn-btn";
      a.textContent = icon + l.platform;
      a.addEventListener("click", () => handler(l.url));
      wrap.appendChild(a);
    });
    $(section + "Hint").textContent = creditsText(hintKey);
  }
  function hideGameOver() {
    $("gameoverModal").classList.add("hidden");
    cabSafe("clearPrize", c => c.clearPrize());
  }
  // Once-ever credit award (anti-farming): like/share/follow each pay +25
  // exactly once, ever — re-clicks can never double-pay.
  function grantOnce(id, amount, eventName) {
    const r = L.awardOnce(S, id, amount);
    if (r.awarded) {
      save();
      metric("credit_earn", { amount, balance: S.credits, via: id });
      metric(eventName, { amount, balance: S.credits });
    }
    return r.awarded;
  }
  // LIKE: opens the allowlisted track page (native app via universal link)
  // AND restarts the song — the award lifts credits above zero, so
  // updateSilence() clears the silence flag and tryPlay() resumes the music.
  function doLike(url) {
    metric("like_tap", { platform: url });
    try { window.open(url, "_blank", "noopener"); } catch (e) {}
    if (grantOnce("like-song", C.creditAwards.like, "like_award"))
      toast(creditsText("liked", { n: C.creditAwards.like }));
    refresh();
  }
  // FOLLOW: same once-ever pattern on the allowlisted artist pages.
  function doFollow(url) {
    metric("follow_tap", { platform: url });
    try { window.open(url, "_blank", "noopener"); } catch (e) {}
    if (grantOnce("follow-artist", C.creditAwards.follow, "follow_award"))
      toast(creditsText("followed", { n: C.creditAwards.follow }));
    refresh();
  }
  function sharePayload() {
    return {
      title: "777 Neon Nights",
      text: "Free slot game for “Neon Nights Pt. 777” by That Boy Hi Hat — listen here: " + C.likeLinks[0].url,
      url: C.gameUrl,
    };
  }
  // SHARE: real Web Share API (native iOS sheet) with clipboard fallback.
  // Awards only on a completed share or a successful copy — never on cancel.
  function doShare() {
    metric("share_tap", {});
    const path = L.sharePath(navigator);
    const data = sharePayload();
    if (path === "native" && navigator.share) {
      navigator.share(data).then(() => {
        if (grantOnce("share-song", C.creditAwards.share, "share_award"))
          toast(creditsText("shared", { n: C.creditAwards.share }));
        refresh();
      }).catch(() => metric("share_cancel", {}));
    } else if (path === "clipboard" && navigator.clipboard) {
      const txt = data.title + " — " + data.text + " " + data.url;
      navigator.clipboard.writeText(txt).then(() => {
        if (grantOnce("share-song", C.creditAwards.share, "share_award"))
          toast(creditsText("shared", { n: C.creditAwards.share }));
        refresh();
      }, () => toast("Copy failed — long-press to copy"));
    } else {
      toast("Sharing isn't available in this browser");
    }
  }

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
    if (r.ok) { metric("score_submit", { score: r.score }); toast(`🏆 Score saved: ${r.score}`); renderBoard(); }
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
    const payload = {
      exportedAt: new Date().toISOString(), game: "neon-nights-777",
      counts: M.counts(localStorage), events: M.events(localStorage),
      note: "Anonymous device id only. No PII collected.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "neon-nights-777-metrics.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $("metricsNote").textContent = `${payload.events.length} events exported.`;
  });
  // Owner-only metrics dashboard: rendered ONLY when ?metrics=1 is present.
  // Never linked from the normal UI. Read-only aggregate counts.
  function renderMetricsDash() {
    const dash = $("metricsDash");
    if (!dash) return;
    let show = false;
    try { show = new URLSearchParams(location.search).get("metrics") === "1"; } catch (e) {}
    dash.classList.toggle("hidden", !show);
    if (!show) return;
    const c = M.counts(localStorage);
    $("metricsGrid").innerHTML = M.EVENTS.map(e =>
      `<div>${e}<br><b>${c.byEvent[e] || 0}</b></div>`).join("");
    $("metricsTotals").textContent =
      `events: ${c.totalEvents} · credits earned: ${c.creditsEarned} · credits spent: ${c.creditsSpent} · device: ${c.deviceId}`;
  }

  refresh();
  buildPicker();
  applyLang(lang);
  renderBoard();
  renderMetricsDash();
  metric("game_start", { lang });
  $("metricsNote").textContent = "Metrics are local-only (no endpoint configured). Export anytime.";
  // Headless-QA handle: drives the real UI path (spin/refresh/state) for tests.
  // spinning() reports the true in-flight state — the spin button is
  // re-enabled synchronously by refresh() mid-spin, so button.disabled is
  // NOT a settle signal (a spin started while spinning=true is ignored).
  window.NN_GAME = { spin: doSpin, refresh, state: () => S, spinning: () => spinning,
    silenced: () => silenced, gameOverShown: () => !$("gameoverModal").classList.contains("hidden"),
    metrics: () => M.counts(localStorage), metricsDashVisible: () => !$("metricsDash").classList.contains("hidden") };
})();
