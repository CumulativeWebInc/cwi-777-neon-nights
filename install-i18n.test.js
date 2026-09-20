/* Node tests: install-guide i18n coverage, payout-link verification markers, PWA assets.
   Run: node install-i18n.test.js
   Convention: window-free; loads i18n.js by injecting a fake window. */
"use strict";
const fs = require("fs");
const path = require("path");
const here = __dirname;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

/* ---- load i18n.js ---- */
const src = fs.readFileSync(path.join(here, "i18n.js"), "utf8");
const window = {};
new Function("window", src)(window);
const I18N = window.NN_I18N;
ok(I18N && typeof I18N === "object", "NN_I18N loads");

const locales = Object.keys(I18N);
ok(locales.length === 41, `41 locales present (got ${locales.length})`);

const KEYS = ["title", "android", "ios1", "ios2", "ios3", "note"];
// Never claim native store availability. The note may honestly say "no
// app-store download needed" — that is a negation, not an availability claim.
// Only POSITIVE claims ("available on the App Store", "get it on Google
// Play") are failures.
const NO_GAMBLE = [/gambl/i, /\bcash\b/i, /\bmoney\b/i, /wagering/i];
const STORE_CLAIM = /(available on|get (it|this)|download (it|this)|find (it|this)).*(app.?store|google.?play)/i;

for (const loc of locales) {
  const inst = I18N[loc] && I18N[loc].install;
  ok(inst && typeof inst === "object", `${loc}: install block exists`);
  if (!inst) continue;
  for (const k of KEYS) {
    ok(typeof inst[k] === "string" && inst[k].trim().length > 0, `${loc}: install.${k} non-empty`);
    if (typeof inst[k] === "string") {
      for (const re of NO_GAMBLE) {
        ok(!re.test(inst[k]), `${loc}: install.${k} carries no gambling claims`);
      }
      ok(!STORE_CLAIM.test(inst[k]), `${loc}: install.${k} claims no native store availability`);
    }
  }
}

/* ---- spin button label: translated for all 41 locales, never English-only ---- */
ok(I18N.en.spin === "Spin!", `en spin label is "Spin!" (got "${I18N.en.spin}")`);
for (const loc of locales) {
  const s = I18N[loc] && I18N[loc].spin;
  ok(typeof s === "string" && s.trim().length > 0, `${loc}: spin label non-empty`);
}

/* ---- win announcements: every locale names the win (iPhone 2026-09-20 fix) ---- */
ok(I18N.en.win && I18N.en.win.jackpot === "🎰 JACKPOT! 777 🎰", "en win.jackpot exact");
ok(I18N.en.win && I18N.en.win.triple === "✨ Triple {label}! ✨", "en win.triple template exact");
ok(I18N.en.win && I18N.en.win.claim === "CLAIM", "en win.claim exact");
ok(I18N.en.win && I18N.en.win.prize === "🎁 {name} unlocked! Tap {claim} below for your free music link.",
  "en win.prize template exact");
const WIN_KEYS = ["jackpot", "triple", "prize", "claim"];
for (const loc of locales) {
  const w = I18N[loc] && I18N[loc].win;
  ok(w && typeof w === "object", `${loc}: win block exists`);
  if (!w) continue;
  for (const k of WIN_KEYS) {
    ok(typeof w[k] === "string" && w[k].trim().length > 0, `${loc}: win.${k} non-empty`);
    if (typeof w[k] === "string") {
      for (const re of NO_GAMBLE) {
        ok(!re.test(w[k]), `${loc}: win.${k} carries no gambling claims`);
      }
    }
  }
  if (typeof w.triple === "string") ok(w.triple.includes("{label}"), `${loc}: win.triple names the symbol ({label})`);
  if (typeof w.prize === "string") {
    ok(w.prize.includes("{name}"), `${loc}: win.prize names the prize ({name})`);
    ok(w.prize.includes("{claim}"), `${loc}: win.prize matches the CLAIM button word ({claim})`);
  }
}

/* ---- Neon Credits: every locale carries the credit strings (fun points, no money) ---- */
const CREDIT_KEYS = ["ask", "cashin", "save", "score", "earned", "choose", "need", "disclaimer"];
// ask/cashin/save use the required "cash in / save credit" feature copy; the
// no-gambling regex runs on the rest. The disclaimer MUST carry a no-money-value negation.
for (const loc of locales) {
  const c = I18N[loc] && I18N[loc].credits;
  ok(c && typeof c === "object", `${loc}: credits block exists`);
  if (!c) continue;
  for (const k of CREDIT_KEYS) {
    ok(typeof c[k] === "string" && c[k].trim().length > 0, `${loc}: credits.${k} non-empty`);
  }
  for (const k of ["score", "earned", "choose", "need"]) {
    if (typeof c[k] === "string") {
      for (const re of NO_GAMBLE) {
        ok(!re.test(c[k]), `${loc}: credits.${k} carries no gambling claims`);
      }
    }
  }
  if (typeof c.earned === "string") ok(c.earned.includes("{n}"), `${loc}: credits.earned carries the award ({n})`);
  if (typeof c.need === "string") ok(c.need.includes("{n}"), `${loc}: credits.need carries the shortfall ({n})`);
  if (typeof c.disclaimer === "string") {
    // The disclaimer must carry a NEGATION (no money value / not gambling),
    // in any of the 41 languages — never a positive money claim.
    ok(/(no|not|non|kein|geen|pas |sans |sin |sem |não|niet|ne |нет|не |όχι|nem |ikke|inget|inga|ei |fără|žádný|nie |না |নয়|இல்லை|లేదు|没有|沒有|無|없|không|ไม่|tidak|tiada|नहीं|hazi|babu|ba |אין|لا |نہیں|ندار|نه |نہ|ਨਹੀਂ|ନାହିଁ|kò|ለም|yok|walang)/i.test(c.disclaimer),
      `${loc}: credits.disclaimer carries a no-money/no-gambling negation`);
    ok(!/(real money|cash prize|win money|earn (real )?cash|wygrana pieniężna)/i.test(c.disclaimer),
      `${loc}: credits.disclaimer makes no positive money claim`);
  }
}

/* ---- payout links: verified entries, no invented Tidal ---- */
const cfgSrc = fs.readFileSync(path.join(here, "config.js"), "utf8");
ok(cfgSrc.includes("https://www.youtube.com/watch?v=3L5eUDui-00"), "YouTube payout link present (verified 2026-09-20)");
// Tidal: only the TIDAL-search-verified track page may appear. No other Tidal URL.
ok(cfgSrc.includes("https://tidal.com/track/267845274"), "Tidal payout link present (verified track page 2026-09-20)");
// Payout-URL checks run against actual `url:` values only (comments may cite
// retired URLs for provenance). Strip // comments that are NOT part of "://".
const cfgNoComments = cfgSrc.replace(/([^:])\/\/.*$/gm, "$1");
// URL checks scope to the jackpotLinks array (bonusLinks share domains).
const jackpotArr = (cfgNoComments.match(/jackpotLinks:\s*\[([\s\S]*?)\],/) || [null, ""])[1];
const spotifyUrls = jackpotArr.match(/https?:\/\/open\.spotify\.com\/[^\s"']*/g) || [];
const appleUrls = jackpotArr.match(/https?:\/\/music\.apple\.com\/[^\s"']*/g) || [];
const deezerUrls = jackpotArr.match(/https?:\/\/www\.deezer\.com\/[^\s"']*/g) || [];
const pandoraUrls = jackpotArr.match(/https?:\/\/www\.pandora\.com\/[^\s"']*/g) || [];
const ytmUrls = jackpotArr.match(/https?:\/\/music\.youtube\.com\/[^\s"']*/g) || [];
const amazonUrls = jackpotArr.match(/https?:\/\/music\.amazon\.com\/[^\s"']*/g) || [];
const tidalUrls = jackpotArr.match(/https?:\/\/tidal\.com\/[^\s"']*/g) || [];
ok(tidalUrls.length === 1 && tidalUrls[0] === "https://tidal.com/track/267845274",
  `exactly one Tidal URL, the verified track page (found: ${tidalUrls.join(", ") || "none"})`);
ok(spotifyUrls.includes("https://open.spotify.com/track/4XP56LZjeS0TJUd30kpGSK") &&
   spotifyUrls.includes("https://open.spotify.com/artist/2f9j460EwjfvjYp3trBcb7") &&
   spotifyUrls.length === 2 && !/[?&](si|utm_source)=/i.test(spotifyUrls.join(" ")),
  `Spotify: track + canonical artist page, no share tokens (found: ${spotifyUrls.join(", ") || "none"})`);
ok(appleUrls.length === 1 && appleUrls[0] === "https://music.apple.com/us/artist/that-boy-hi-hat/1590210881",
  `Apple Music URL is the Black-supplied artist page (found: ${appleUrls.join(", ") || "none"})`);
ok(deezerUrls.length === 1 && deezerUrls[0] === "https://www.deezer.com/us/artist/148421152",
  `Deezer URL is the verified artist page, no utm params (found: ${deezerUrls.join(", ") || "none"})`);
ok(pandoraUrls.length === 1 && pandoraUrls[0] === "https://www.pandora.com/artist/that-boy-hi-hat/ARd7j9fggX32x6q",
  `Pandora URL is the resolved canonical artist page (found: ${pandoraUrls.join(", ") || "none"})`);
ok(ytmUrls.length === 1 && ytmUrls[0] === "https://music.youtube.com/channel/UCdlSWhZXKKNPhjXDknHzzpQ",
  `YouTube Music URL is canonical with no share token (found: ${ytmUrls.join(", ") || "none"})`);
const platforms = ["Spotify", "Apple Music", "Amazon Music", "Deezer", "YouTube", "YouTube Music", "Tidal", "Pandora", "All platforms"];
for (const p of platforms) {
  ok(cfgSrc.includes(`"${p}"`) || cfgSrc.includes(`platform: "${p}"`), `jackpotLinks includes ${p}`);
}

/* ---- manifest icon coverage ---- */
const man = JSON.parse(fs.readFileSync(path.join(here, "manifest.webmanifest"), "utf8"));
const sizes = man.icons.map(i => i.sizes).sort();
for (const s of ["180x180", "192x192", "512x512"]) ok(sizes.includes(s), `manifest lists ${s} icon`);
ok(man.icons.some(i => i.purpose === "maskable"), "manifest lists a maskable icon");
ok(man.display === "standalone" && man.scope === "." && man.start_url === ".", "manifest installability fields sane");

/* ---- icon files exist ---- */
for (const f of ["icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"]) {
  ok(fs.existsSync(path.join(here, f)), `${f} exists`);
}

/* ---- VERSION / CHANGELOG in sync with build ---- */
const ver = JSON.parse(fs.readFileSync(path.join(here, "VERSION.json"), "utf8"));
ok(/^nn777-v\d+$/.test(ver.build), `VERSION.json build tag shape (${ver.build})`);
const idx = fs.readFileSync(path.join(here, "index.html"), "utf8");
ok(idx.includes(`window.NN_BUILD = "${ver.build}"`), `index.html NN_BUILD matches VERSION.json (${ver.build})`);
const sw = fs.readFileSync(path.join(here, "sw.js"), "utf8");
ok(sw.includes(`"${ver.build}"`), `sw.js cache tag matches VERSION.json (${ver.build})`);
const cl = fs.readFileSync(path.join(here, "CHANGELOG.md"), "utf8");
ok(cl.includes(ver.build), "CHANGELOG.md mentions current build");
ok(idx.includes('rel="apple-touch-icon" href="icons/icon-180.png"'), "apple-touch-icon points at the 180px icon");

console.log(`install-i18n: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
