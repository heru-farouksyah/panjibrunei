# PANJI BRUNEI — Vibe-Coding Build Guide

> This is the **build manual for an AI coding agent** (or a human vibe-coding
> with one). It encodes the rules, conventions and per-phase recipes so you can
> implement [PRD.md](PRD.md) phases 8–12 without re-discovering the
> architecture each time. Read this first, then pick a phase.
>
> Golden rule: **make the smallest change that fits the existing code, then
> prove it works.** This codebase rewards reading the neighbours before typing.

---

## 1. What this project is

A single-player, browser, 3D RTS (Age-of-Empires-like) themed on Bruneian
legend/history. **Pure JavaScript + Three.js + Vite. No backend, no build step
beyond Vite, no TypeScript.** See [DESIGN.md](DESIGN.md) for the game spec.

Run it:
```bash
npm install        # one-time
npm run dev        # dev server at http://localhost:5173
npm run build      # production build into dist/
```

---

## 2. The architecture you must not break

```
src/
  sim/      ← PURE game logic. NEVER imports three.js. Deterministic.
  render/   ← ALL drawing, audio, input, UI/DOM. Imports three.js freely.
  data/     ← JSON: units, buildings, factions, enemies, eras, models, audio.
  main.js   ← glue: fixed-timestep loop, screen flow, wires sim ↔ render.
```

**Hard rules (violating these is the main way to break the game):**

1. **`/src/sim` never imports Three.js or touches the DOM/WebAudio.** It is the
   single source of truth and must stay headless-testable. If you need a vector
   helper, write plain math.
2. **Fixed 20 Hz simulation, decoupled from render.** `main.js` accumulates
   real time and steps `sim.step()` in fixed `TICK_MS` increments
   (`src/sim/constants.js`), with a catch-up clamp (`MAX_TICKS_PER_FRAME`) to
   avoid the spiral of death. Rendering interpolates with `alpha`. **Do not put
   gameplay logic in the render loop**, and do not make the sim frame-rate
   dependent.
3. **The sim is deterministic.** Same `seed` + same inputs ⇒ identical run. All
   randomness goes through `src/sim/rng.js` (`mulberry32`, `hash2`). Never call
   `Math.random()` in the sim. Worldgen is seeded; `generateWorld(seed,
   numZones)` only generates the zones it needs so adding players doesn't
   perturb existing maps (this is why the seeded tests stay byte-stable).
4. **Data-driven.** Anything a designer might tune lives in `src/data/*.json`,
   not as an inline constant. New tunables → JSON.
5. **N-player by design.** `sim.numPlayers = 1 + numEnemies`; player 0 is human,
   `sim.players[]`, one AI per enemy in `sim.ais[]` (`sim.ai` is a legacy alias
   for `ais[0]`). Combat already targets any non-self owner (free-for-all). Keep
   new systems player-indexed, not hard-coded to 2 sides.
6. **Render reads cached faction colour** from `player.faction.color`, not a
   static map, so themed enemy kingdoms tint correctly.

---

## 3. Conventions (match these, don't invent your own)

- **ES modules, vanilla JS.** No TypeScript syntax (no `: type`, no
  `interface`, no generics) — Vite serves these files to the browser as-is.
- **Comments explain *why*, at moderate density**, matching surrounding files.
  Don't over-comment trivia; do explain non-obvious gameplay/rendering choices.
- **Naming** uses the project's Malay domain vocabulary for game entities
  (`penduduk`, `pahlawan_kampilan`, `istana`, `lumbung`, `kedai_runcit`) — keep
  it. Code identifiers around them are plain English.
- **Files** are small and single-purpose. A new subsystem = a new file in
  `render/` or `sim/`, wired in where its siblings are wired.
- **The debug handle** `window.__panji = { sim, gameRenderer, cameraRig, input,
  hud, minimap, audio, touch }` is how tests and the console reach into a
  running game. Keep it populated; add to it when you add a subsystem worth
  inspecting.
- **No per-frame allocation in hot loops** (sim step, render update). Pool and
  reuse (see `EntityPool`, instanced meshes).

---

## 4. Verification protocol — a phase is NOT done until all green

Tests are headless Playwright/Node and **must** run with software rendering
flags. Two kinds:

**A. Pure-sim tests (Node, fast, deterministic) — the safety net.**
```bash
for t in phase2 phase3 phase4 phase5 phase6 phase7 improvements multikingdom fire; do
  node scripts/test-sim-$t.mjs || echo "FAIL: $t"
done
```
These import only `/src/sim`, construct a `Sim`, step it, and assert. They are
seeded — **timing-sensitive**. If a change shifts worldgen RNG or economy
constants, they may break; that's the net doing its job. Either preserve
determinism or update expectations *deliberately* and say so.

**B. Headless render/UI checks (Playwright + Chromium, software GL).**
Always launch Chromium with:
```js
chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'] })
```
and run the Node process with the Bash tool's `dangerouslyDisableSandbox: true`.
Drive the game via `?quickstart` (skips the tutorial: see `main.js`) and the
`window.__panji` handle. Pattern (see `scripts/shot-themes.mjs`):
- `page.goto('http://localhost:5173/?quickstart&theme=<id>')`
- `await page.waitForFunction(() => window.__panji?.gameRenderer)`
- collect `console.error`/`pageerror` into an array and **assert it's empty**
- screenshot to `/tmp/*.png` and read it back to eyeball the result.

**Software-rendering gotchas (don't be fooled):**
- **FPS is meaningless** under SwiftShader — never assert on frame rate.
- **CSS-compositor animations may starve.** To verify a DOM animation actually
  runs, check `el.getAnimations()[0].playState/currentTime`, not vibes.
- Give the world ~1–1.5 s after load to build + settle before screenshotting.

**Definition of done for every phase:**
1. `npm run build` succeeds.
2. All pure-sim tests green.
3. Headless check for the phase passes with **zero console errors**.
4. New behaviour has at least one new/updated test or scripted check.

---

## 5. Where things live (quick map)

| Concern | File(s) |
|---|---|
| Fixed loop, screen flow, wiring | `src/main.js` |
| Sim core / step order | `src/sim/sim.js` |
| Economy / gather / build | `src/sim/economy.js` |
| Combat / fire / status | `src/sim/combat.js`, `fire.js`, `statuses.js` |
| Movement / pathing / de-overlap | `src/sim/movement.js`, `pathfinding.js` |
| Heroes / ultimates | `src/sim/heroes.js` |
| AI (one per enemy) | `src/sim/ai.js` |
| Worldgen (seeded) | `src/sim/worldgen.js`, `grid.js` |
| Renderer / scene / lights | `src/render/renderer.js` |
| Environment colour themes | `src/render/themes.js` (+ terrain/water/sky) |
| Procedural models | `render/models.js`, `unitModels.js`, `buildingModels.js` |
| Model manifest (GLTF hook) | `src/data/models.json` |
| Audio (cues + WebAudio) | `src/render/audio.js`, `src/data/audio.json` |
| Screens (disclaimer/title/select/tutorial/end) | `src/render/screens.js` |
| HUD / minimap / input / touch | `render/hud.js`, `minimap.js`, `input.js`, `touch.js` |
| Deployment (diamond placement) | `src/render/deploy.js` |

---

## 6. Per-phase recipes

Each recipe is a *starting* decomposition, not a contract — adapt as the code
tells you to. Always finish with §4 verification.

### Phase 8 — Audio & music (procedural)
- **Extend, don't replace, `audio.json`'s contract.** Each cue may stay a synth
  spec *or* gain a `file` for a future sample. Add new cue ids for the missing
  events (combat hits per weapon, death, collapse, fire loop).
- In `audio.js`, build a **bus graph**: `master → {music, sfx, ambient}` gains.
  Add `setVolume('master'|'music'|'sfx', v)` and read persisted values from
  `localStorage` on construct.
- Replace `blip()` with small **patches** (layered osc + noise + filter +
  ADSR). Keep `play(name)` API stable so existing call-sites don't change.
- **Ambient bed**: a `startAmbient(themeId)` that loops filtered noise + sparse
  random one-shots; re-call on theme change.
- **Music**: a generative scheduler on a **pentatonic** scale (gamelan vibe),
  with `setIntensity('peace'|'battle')`. Drive intensity from whether the
  player has units in combat (cheap check each second, not per frame).
- Route new combat/fire events through the existing `onEvent` switch. Fire loop
  starts when `sim.fire` has active tiles, stops when it doesn't.
- **Verify:** headless can't *hear*, so assert structurally —
  `window.__panji.audio` exposes bus state; assert music/ambient nodes exist
  and `setVolume` changes gain. Plus zero console errors.

### Phase 9 — Art pipeline (GLTF + animation)
- Add a `render/modelLoader.js`: `loadGLTF(path) → Promise<Group>` using
  `three/examples/jsm/loaders/GLTFLoader.js`, **cached by path**, with
  normalize (recenter to feet, scale to a target height) + a faction-tint hook.
- In `props.js`, `unitRenderer`/`unitModels` and `buildingRenderer`, where the
  manifest entry is read: if `entry.gltf`, kick off the async load and swap the
  procedural placeholder when it resolves; **on reject, keep procedural + warn
  once**. Never block the first frame on a network load.
- **Animation**: add a small code-driven animator for units (idle bob / walk /
  attack lunge / gather swing) driven by unit state + `dt`; if a loaded GLTF has
  `animations`, prefer an `AnimationMixer`.
- Update [ART_PIPELINE.md](ART_PIPELINE.md) with the *verified* drop-in steps.
- **Verify:** temporarily point one manifest entry at a tiny test `.glb` (or
  assert the loader cache + fallback path via a unit test of `modelLoader`),
  confirm fallback-on-bad-path warns once and still renders, eyeball animation
  in a screenshot sequence, zero console errors, sim tests green.

### Phase 10 — Content & persistence
- **Settings**: `render/settings.js` (a `Settings` object backed by
  `localStorage`) + a `showSettings()` overlay in `screens.js`. Volumes call
  into `audio`; graphics preset is stored for Phase 12 to consume.
- **Save/load**: add `serialize()`/`static deserialize(snapshot)` to `Sim`. It
  is plain data — capture `seed, tick, rng state, players (resources/era/techs
  as arrays/sets→arrays/mods), entity pool (live entities' fields), fire, fog,
  winner` + chosen `theme/difficulty`. Restoring rebuilds the grid from seed
  (deterministic) then repopulates. **Expose RNG internal state** in `rng.js`
  (getter/setter) so the stream resumes exactly. Version the snapshot; reject
  mismatches with a friendly message. Rebuild the render layer from the restored
  sim (fresh `GameRenderer`).
- **Map options**: thread map **size** + **seed** from a setup screen → `Sim`
  opts → `generateWorld`. Keep determinism (same seed+size ⇒ same map).
- **Verify:** new `scripts/test-sim-save.mjs` — build a sim, step T ticks,
  `serialize`, `deserialize`, assert identical tick/entity-count/resources, then
  step both and assert they stay in lock-step. Same-seed map reproducibility
  test. All other sim tests green.

### Phase 11 — Balance harness & tuning
- `scripts/balance.mjs` (Node, sim-only): loop over faction pairings ×
  difficulties × seeds, run each to a tick cap, record winner/length/army-value,
  print a **win-rate matrix + length histogram**. No render.
- Read the report, then tune `data/*.json` to pull outliers toward 50% and
  match length into the target band. **Re-run** to confirm. Keep seeded tests
  green (or update expectations deliberately, noting why).
- **Verify:** harness runs and prints; post-tuning win-rates within band;
  sim tests green.

### Phase 12 — Polish, perf & QA
- **Loading screen** in `screens.js`, shown by `main.js` until first world build
  + audio unlock are ready.
- **Graphics presets**: a function the renderer reads at construct + on change
  to set shadow on/off + map size, `setPixelRatio` cap, ambient density, shader
  detail. Wire to the Phase 10 settings value.
- **Perf audit**: grep hot loops (`sim.step`, `*Renderer.update`) for
  per-frame `new`/array allocs; pool them. Confirm the catch-up clamp.
- **Final sweep**: full sim suite + a headless script loading every theme and
  the main flows asserting zero console errors; update `README.md`; confirm the
  disclaimer + credits are intact.

---

## 7. Tone & content guardrails (do not regress)

- The opening is an **unfinished / educational / fan-made / non-commercial
  disclaimer** with a Malay apology line, plus credits **"Blooming Barakah 2026
  · Heru & Hasanah"**. **Never** reintroduce a royal "DAULAT TUANKU" dedication,
  Sultan dedication, or royal crest — that was explicitly removed.
- The setting is respectful, mythologized Bruneian legend/history. Keep names
  and flavour consistent with [DESIGN.md](DESIGN.md).

---

## 8. When in doubt

Read the nearest existing file that does something similar, copy its shape, run
the tests. The codebase is internally consistent — consistency with it beats
cleverness. If a phase genuinely won't fit in one pass, **say what you'd cut and
why** rather than dropping it silently.
