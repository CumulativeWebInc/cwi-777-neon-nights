/* 777 Neon Nights — cache-bust test.
   Asserts every <script src="..."> and <link rel="stylesheet" href="..."> tag in
   index.html carries ?v=<build> from VERSION.json, so a refresh always pulls
   fresh code (2026-09-20 iPhone post-mortem: stale cached JS ran pre-v8.1 code
   with the announcement bug — +50 credits banked, no win announced).
   Run: node cache-bust.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const GAME = __dirname;
const build = JSON.parse(fs.readFileSync(path.join(GAME, "VERSION.json"), "utf8")).build;
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log("FAIL:", name); } }

ok(typeof build === "string" && build.length > 0, "VERSION.json has a build string");

const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
ok(scripts.length >= 5, `found ${scripts.length} script src tags (expect >= 5)`);
for (const m of scripts) {
  const local = !/^https?:\/\//.test(m[1]) && !m[1].startsWith("data:");
  if (local) ok(m[1].includes("?v=" + build), `script carries ?v=${build}: ${m[1]}`);
}

const styleLinks = [...html.matchAll(/<link\b[^>]*>/g)].filter((t) => /rel="stylesheet"/.test(t[0]));
ok(styleLinks.length >= 1, `found ${styleLinks.length} stylesheet link tags (expect >= 1)`);
for (const t of styleLinks) {
  const h = t[0].match(/href="([^"]+)"/);
  ok(h && h[1].includes("?v=" + build), `stylesheet carries ?v=${build}: ${t[0].slice(0, 90)}`);
}

// No stale double-stamps: exactly one ?v= per tagged URL.
for (const m of scripts) ok((m[1].match(/\?v=/g) || []).length <= 1, `single ?v= on ${m[1]}`);

console.log(`cache-bust: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
