/* 777 Neon Nights — promo slot game for "Neon Nights Pt. 777" by That Boy Hi Hat.
   Every tuning knob lives here. Free promo game: no gambling, no cash prizes,
   no purchase, no IAP. */
const CONFIG = {
  gameName: "777 Neon Nights",
  tagline: "Neon Nights Pt. 777 • That Boy Hi Hat",
  disclaimer: "Free promo game. No gambling. No cash prizes. No purchase necessary.",

  symbols: [
    { id: "seven",  weight: 3, label: "7" },
    { id: "cherry", weight: 5, label: "Cherries" },
    { id: "lemon",  weight: 4, label: "Lemon" },
    { id: "bell",   weight: 6, label: "Bell" },
  ],
  // 2026-09-20 visual redo: the "leaf" symbol was retired (reference look is
  // classic fruit/bell/7s; no leaf on reels). Its weight moved to "bell" —
  // triple-bell is now the Encore teaser. Total weight unchanged (18).
  // Jackpot = three 7s on the middle row. Pity guarantees one by this many spins.
  pitySpins: 200,
  // Neon Credits: fun points — NO money value, redeemable only for free music links.
  // A jackpot (1000) reaches the link price instantly; smaller wins accumulate.
  creditAwards: { jackpot: 1000, triple: 50, prize: 25 },
  creditLinkPrice: 1000,

  // Free-spin economy (never purchasable)
  spinsStart: 30, spinCap: 40, spinRegenSec: 45,

  stages: [
    { id: "lobby", name: "Lobby Lights", theme: "orange",
      rounds: [
        { id: "r1", name: "First Pull", objective: { type: "spins", count: 1 } },
        { id: "r2", name: "Warming Up", objective: { type: "spins", count: 10 } },
        { id: "r3", name: "Listener",   objective: { type: "listen", seconds: 180 } },
      ] },
    { id: "strip", name: "Midnight Strip", theme: "magenta",
      rounds: [
        { id: "r4", name: "Strip Regular", objective: { type: "spins", count: 30 } },
        { id: "r5", name: "Triple Match",  objective: { type: "triples", count: 1 } },
        { id: "r6", name: "Deep Cut",      objective: { type: "listen", seconds: 420 } },
      ] },
    { id: "skyline", name: "777 Skyline", theme: "cyan",
      rounds: [
        { id: "r7", name: "Neon Dreams", objective: { type: "spins", count: 75 } },
        { id: "r8", name: "Triple Threat", objective: { type: "triples", count: 3 } },
        { id: "r9", name: "Headliner",     objective: { type: "listen", seconds: 900 } },
      ] },
  ],

  // Listening-time prizes (seconds of audible play). All deliverable by CWI.
  listenPrizes: [
    { at: 180, id: "wallpaper", name: "Neon Wallpaper", file: "art/wallpaper-777.png",
      desc: "Official 777 Neon Nights phone wallpaper." },
    { at: 420, id: "artpack", name: "Neon Art Pack",
      files: ["art/wallpaper-777.png", "art/marquee-777.png", "art/cabinet-777.png"],
      desc: "Three official neon art cards." },
    { at: 900, id: "golden", name: "Golden Reel + Certified Badge",
      desc: "20 spins with double 7s odds, plus a Hi Hat Certified Listener badge." },
  ],

  // Bonus round: unlocked after Stage 2 (r6) + 5 min listening. Always wins —
  // it's a reward round. 24h cooldown between plays.
  bonus: {
    id: "encore", name: "Encore Round",
    unlockAfterRound: "r6", unlockListenSec: 300, cooldownHours: 24,
    prizes: [
      { track: "Neon Nights Pt. 777", artist: "That Boy Hi Hat",
        url: "https://distrokid.com/hyperfollow/thatboyhihat/neon-nights-pt-777",
        note: "Smart link — every platform" },
      { track: "Zooted Zone", artist: "That Boy Hi Hat",
        url: "https://open.spotify.com/track/0emH8ktA8x4DkOFLsG5xkW",
        note: "Spotify — the breakout (307K plays)" },
      { track: "Diabolique", artist: "That Boy Hi Hat",
        url: "https://open.spotify.com/track/2eSyWmIdPzEMyWejLb2LBj",
        note: "Spotify — the spearhead single" },
    ],
  },

  // Jackpot (777) prize: winner picks a free streaming link. All URLs verified.
  jackpotLinks: [
    { platform: "Spotify",     url: "https://open.spotify.com/track/4XP56LZjeS0TJUd30kpGSK" },
    { platform: "Spotify",     url: "https://open.spotify.com/artist/2f9j460EwjfvjYp3trBcb7" }, // Black-supplied 2026-09-20, canonical (no ?si=/?utm_source=). Artist ID matches the verified artist ID.
    { platform: "Apple Music", url: "https://music.apple.com/us/artist/that-boy-hi-hat/1590210881" }, // Black-supplied 2026-09-20. (Old album URL: https://music.apple.com/us/album/neon-nights-pt-777/1660915130?i=1660915131)
    { platform: "Amazon Music",url: "https://music.amazon.com/artists/B09JFCWZYG" }, // Black-supplied 2026-09-20 from his Amazon Music app share (bot-walled for fetch; treated as his verified link). Canonical, no ?ref= token. (Old album URL: https://music.amazon.com/albums/B0BQRC5NY5?marketplaceId=ATVPDKIKX0DER&musicTerritory=US)
    { platform: "Deezer",      url: "https://www.deezer.com/us/artist/148421152" }, // verified 2026-09-20: That Boy Hi Hat artist page (artist ID matches known seed; discography: Idol or Icon, The Alternative Theory, Post Trap Futurism: The Logo Effect). Canonical, no utm params. (Old album URL: https://www.deezer.com/album/388911647)
    { platform: "YouTube",     url: "https://www.youtube.com/watch?v=3L5eUDui-00" }, // verified 2026-09-20 (oEmbed: "Neon Nights pt. 777" — That Boy Hi Hat - Topic)
    { platform: "YouTube Music", url: "https://music.youtube.com/channel/UCdlSWhZXKKNPhjXDknHzzpQ" }, // verified 2026-09-20 (Black-supplied, live title-confirmed "That Boy Hi Hat"; canonical, no ?si= token). Re-sent youtube.com/channel form w/ ?si= same day — canonical music.youtube.com form kept.
    { platform: "Tidal",       url: "https://tidal.com/track/267845274" }, // verified 2026-09-20 via TIDAL's own search: "Neon Nights pt. 777" by That Boy Hi Hat, 1-track single, 2022-12-23, 3:47, Explicit, label CUMULATIVE WEB INC
    { platform: "Pandora",     url: "https://www.pandora.com/artist/that-boy-hi-hat/ARd7j9fggX32x6q" }, // verified 2026-09-20: Black's short link https://pandora.app.link/OIHcaPZYA6b resolves (via its own deep-link metadata) to this canonical artist page. Canonical, no utm/part params.
    { platform: "All platforms", url: "https://distrokid.com/hyperfollow/thatboyhihat/neon-nights-pt-777" },
  ],

  audioFile: "audio/neon-nights-777-128k.mp3",   // 3.6MB loop default (fast first load)
  audioFileFull: "audio/neon-nights-777.mp3",     // 9MB full-quality fallback
  goldenSpins: 20,          // golden-reel spins granted at 15-min prize
  goldenSevenMult: 2,       // 7s weight multiplier during golden spins
  // Metrics endpoint: null = local-only (ring buffer + manual JSON export).
  // Set to a $0 endpoint Black approves (Cloudflare Worker / Apps Script /
  // Pipedream webhook) to POST anonymous event batches. No PII is ever sent.
  metricsEndpoint: null,
};
if (typeof module !== "undefined") module.exports = CONFIG;
if (typeof window !== "undefined") window.NN_CONFIG = CONFIG;
