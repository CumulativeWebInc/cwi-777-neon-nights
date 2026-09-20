# Vendored Three.js — 777 Neon Nights rebuild

**Pinned version:** `0.160.0`
**Total vendored code bytes:** 700,720 (addons 30,039 + core 670,681) + 1,081 LICENSE + 989 manifest
**Zero runtime CDN dependencies:** the game loads with no external network beyond its own host.

## Why 0.160.0

- It is the exact version ATHENA used for the Neon District rebuild of the Gear Ledger world
  (`~/workspace/gear-ledger-3d/build/index.html` importmap: `three@0.160.0`) — the "proper
  resources like Athena used in the new world" Black asked for. Same stack = shared precedent,
  shared bug surface, shared know-how.
- `OutputPass` exists in this version (correct tone-mapping + sRGB output when using EffectComposer;
  added in r152) — required for the bloom chain below.
- Stable, widely deployed, importmap addons layout (`three/addons/` → `examples/jsm/`) unchanged.

## Files

| File | Bytes | Purpose |
|---|---|---|
| `build/three.module.min.js` | 670,681 | Core three.js (minified ES module) |
| `addons/postprocessing/EffectComposer.js` | 4,651 | Post-processing chain |
| `addons/postprocessing/RenderPass.js` | 1,915 | Scene → buffer render |
| `addons/postprocessing/UnrealBloomPass.js` | 12,406 | Neon glow (see verdict below) |
| `addons/postprocessing/ShaderPass.js` | 1,576 | Custom shader passes |
| `addons/postprocessing/OutputPass.js` | 2,398 | Tone mapping + sRGB out |
| `addons/postprocessing/Pass.js` | 1,706 | Pass base class (auto-pulled) |
| `addons/postprocessing/MaskPass.js` | 2,231 | EffectComposer dependency (auto-pulled) |
| `addons/shaders/CopyShader.js` | 571 | Composer copy shader (auto-pulled) |
| `addons/shaders/LuminosityHighPassShader.js` | 1,192 | Bloom luminance pre-filter (auto-pulled) |
| `addons/shaders/OutputShader.js` | 1,393 | OutputPass shader (auto-pulled) |
| `LICENSE-THREE.txt` | 1,081 | MIT license text |
| `manifest.json` | 989 | Machine-readable version/file manifest |

All addon files passed `node --check`, and every `from '...'` import was resolved
against the vendored tree (closure verification CLEAN — the only bare specifier is
`three`, satisfied by the importmap below).

## Importmap

```html
<script type="importmap">
{
  "imports": {
    "three": "./vendor/three/build/three.module.min.js",
    "three/addons/": "./vendor/three/addons/"
  }
}
</script>
<script type="module">
  import * as THREE from 'three';
  import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
  import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
  import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
  import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
</script>
```

Note the difference from ATHENA's Neon District, which pulled the same version from
`https://cdn.jsdelivr.net/npm/three@0.160.0/` — here everything resolves locally, so the
game survives CDN outages, ad-blockers, and offline/PWA use.

## License

Three.js is MIT-licensed (Copyright © 2010–2024 Three.js authors). Full text in
`LICENSE-THREE.txt`. Attribution retained per license; no redistribution restrictions.

---

## Mobile bloom verdict: UnrealBloomPass is fine on iPhone 11–13 class — with the right config

**Verdict: ship bloom, half-resolution, high threshold (emissive-only selective bloom),
renderer DPR ≤ 1.5. Expected 60fps on mid-range mobile Safari. Fake-glow-sprite fallback
ships as a kill switch (runtime degrade), not the default.**

Evidence (all real, checked 2026-09-20):

1. **three.js forum, discourse.threejs.org/t/unrealbloompass-poor-performance-on-macos-safari-with-intel/42606**
   — user reports running bloom-heavy models at **60 FPS on iPhones and Safari**: settings
   `antialias:false, powerPreference:'high-performance'`, bloom resolution = window size,
   `threshold 0, strength 0.4, radius 0.225`, with shadowmap + standard materials.
   Conclusion: bloom itself is not inherently too heavy for iOS; lighting/overdraw dominates.
2. **mockrithm three-bloom docs (github.com/ahapraxahmed/mockrithm, content/docs/dev/aesthetics/three-bloom.mdx)**
   — targets a consistent **60 FPS on mid-range mobile** via selective bloom + dynamic resolution
   mapping when canvas pixel density exceeds 2.0; recommended mobile bloom values:
   `strength 1.2, radius 0.5, threshold 0.85`.
3. **CWI's own Neon District (ATHENA, 2026-09-19):** bloom-era stack at three@0.160.0,
   ~90 draw calls, 195KB page weight, zero WebGL workarounds needed on mobile.
4. **aserxgt-eng/jjk-cursed-technique (GitHub README):** ships three.js r160 +
   EffectComposer + UnrealBloomPass with **full support on Safari iOS 16+**, 20k particles
   fine on mid-range phones with pixel ratio capped at 2.
5. **Counter-evidence / guardrails (michi-neko PERFORMANCE_REVIEW, c1t1zen1 repo):**
   UnrealBloomPass at *full window resolution* + HDR + 4×MSAA is the documented mobile killer
   (context-loss risk on iOS Safari at DPR 1.25 with the full chain). MSAA is wasted under
   EffectComposer. Fix: DPR ≤ 1.5, no MSAA targets, bloom at half res.
6. **three.js forum, discourse.threejs.org/t/what-does-the-threshold.../60984 (drcmda, Mugen87):**
   "selective bloom is built in" — set `threshold: 1` and drive glow via `emissiveIntensity`
   above the 0–1 range (`toneMapped:false`). No second composer, no layer masks, no extra passes.

### Concrete config (pinned, for the build)

```js
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 820;
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2)); // NOT 2–3×
const composer = new EffectComposer(renderer); // composer picks up renderer pixel ratio
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth / 2, innerHeight / 2), // half-res: pass internally mips at 1/2 per level (5 mips in 0.160.0)
  0.9,   // strength — mockrithm uses 1.2; 0.9–1.2 range is the mobile sweet spot
  0.45,  // radius
  1.0    // threshold — selective: only HDR emissives (>1.0) bloom
);
composer.addPass(bloom);
composer.addPass(new OutputPass());
```

Rules that make it selective *and* cheap:
- Neon tubes / marquee / winning-line flashes: `emissiveIntensity: 2–10`, `toneMapped: false`.
- Everything else (reels, cabinet chrome, background): lit materials, max channel ≤ 1.0 → never blooms.
- The bloom pass never touches luminance ≤ 1.0, so the high-pass filter rejects most of the frame;
  overdraw stays low on an already simple scene (a few dozen draw calls vs. a 240k-blade meadow).

### No-bloom fallback (kill switch)

If the on-device FPS meter (rolling 2s) drops below ~50fps on any device, switch at runtime to:
`composer` bypassed → direct `renderer.render`, glow via additive-blended canvas-sprite
halos (radial-gradient textures) on the neon elements only. ~0 extra GPU passes. This is the
same "different post tiers, not just DPR" pattern documented in the agent-skills three.js perf
skill (github.com/vladmdgolam/agent-skills, skills/threejs-perf-loading/SKILL.md).

---

## Reel-cylinder technique note (recommended standard)

The direct three.js precedent is the forum thread
**discourse.threejs.org/t/multiple-textures-on-a-cylindergeometry/1211** ("I'm trying to put
together a slot machine … use CylinderGeometry for the slot wheels"), where hofk answered with a
working single-texture slot wheel — **http://threejs.hofk.de/** — code posted in-thread. Rule:
**one texture strip per reel, not per-face textures.**

Recommended build (standard across precedents):

1. **Geometry:** `new THREE.CylinderGeometry(r, r, h, 48, 1, true)` — open-ended, so the
   strip texture wraps cleanly with no caps; `side: THREE.DoubleSide` optional.
2. **Texture:** one 1024×2048 (or 1024×N·symbolH) canvas texture per reel: draw the symbol
   strip vertically — cherries, lemons, bells, red 7s, BAR, diamonds, Hi Hat logo — with
   2× padding rows top/bottom for wrap-around. `CanvasTexture`, `colorSpace = SRGBColorSpace`,
   `wrapT = RepeatWrapping` if using fractional offsets.
3. **Spin:** animate `texture.offset.y` (or rotate the mesh `rotation.x`); velocity profile
   fast start → linear cruise → cubic ease-out settle; settle lands on `offset` snapped to the
   winning symbol row. Three reels stagger stops 400–600ms apart.
4. **Motion blur trick (precedent-standard):** at high offset velocity the striped canvas
   texture naturally aliases into blur; deepen it with a second translucent "ghost" cylinder
   (same geometry, `opacity 0.35`, vertically smeared texture copy) visible only while
   velocity > threshold, fading out on settle. The CSS precedents (antibland's React Slot
   Machine, tangxuguo's CSS-only slot — codepen.io/antibland/pen/ypagZd,
   codepen.io/tangxuguo/pen/xqrNmx) use the same illusion with gradient-fade overlays;
   the ghost layer is its 3D equivalent.
5. **Settle feedback:** winning symbols pulse via `emissiveIntensity` spike (which also
   triggers the selective bloom — free win glow, no extra pass).

Chrome PBR note: for the cabinet, use `MeshStandardMaterial` with `metalness: 1,
roughness: 0.15–0.3` + a tiny procedurally generated environment map (RoomEnvironment from
`three/addons/environments/RoomEnvironment.js` — not vendored; can be added or swapped for a
baked gradient cubemap) per the official example
**threejs.org/examples/webgl_materials_envmaps_exr.html** technique. EXR/envmap + mobile
caveat: PMREM on older mobile GPUs can fail — prefer a baked low-res cubemap PNG or
RoomEnvironment over EXR loading on the mobile tier.

### Additional open-source precedents surveyed

- **t4v4res/casino_royale** (github.com/t4v4res/casino_royale) — full first-person 3D casino
  in Three.js with playable slot machines; live at t4v4res.github.io/casino_royale. Closest
  "casino cabinet in three.js" reference build.
- **J00nz/3dSlot** (github.com/J00nz/3dSlot) — JS/CSS 3D slot machine (CSS 3D transforms,
  no WebGL): precedent for reel-stagger timing and settle sequencing, minus GPU cost.
- **marcolago/spin-two-three** (github.com/marcolago/spin-two-three) — wheel-slice slot
  mini-library: markup pattern for multi-slot machines on one page.
- **vei66rus/slot-game-Reel-Combat-** (github.com/vei66rus/slot-game-Reel-Combat-) —
  PixiJS 8 slot machine with **procedural symbol texture generation from code** (no external
  sprite assets) — same procedural-symbol doctrine as our canvas strips.
- **Cyberpunk Arcade Cabinet tutorial** (youtube.com/watch?v=-vqvpA3GLSg) — procedural
  three.js cabinet construction: box-composite cabinet, marquee, emissive palette shifts —
  directly applicable to the 777 cabinet body.
