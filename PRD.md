# PANJI BRUNEI — Product Requirements Document (Phases 8 → 12: Road to Production)

> Status as of this PRD: Phases 1–7 plus five gameplay batches are **done and
> verified** — a complete, playable single-player RTS (economy, combat, fog of
> war, boats, 6 Panji factions + heroes/ultimates, multi-kingdom free-for-all
> AI, fire & siege, market & mercenaries, storage economy, mobile UI, tutorial,
> deployment, environment colour themes). What remains is the long tail that
> turns a complete *prototype* into a *shippable game*: sound, art, content,
> balance and polish.
>
> This PRD scopes that tail as **five phases (8–12)**. It is the *what* and
> *why*; the companion [VIBE_CODING.md](VIBE_CODING.md) is the *how* (the build
> guide an AI/vibe-coder follows). See [DESIGN.md](DESIGN.md) for the original
> game spec and [ART_PIPELINE.md](ART_PIPELINE.md) for asset conventions.

---

## 0. Product vision & success criteria

**Vision.** A respectful, mythologized Bruneian RTS that a stranger can open in
a browser — desktop or phone — and enjoy end-to-end without instruction beyond
the built-in tutorial: pick a banner and a land, build a kampong, raise an
army, and conquer (or be conquered by) rival kingdoms, with sound and art that
feel like a real indie game rather than a tech demo.

**Definition of "production / release quality".** All of the following true:

1. **Sound** — the game is never silent; actions have feedback, the world has
   ambience, and there is music. A mute/volume control exists and is respected.
2. **Art** — units and buildings read clearly at gameplay zoom and *move*
   (not frozen statues); the art pipeline can ingest real 3D assets without
   code changes.
3. **Content** — more than one map; the player can change settings and **save /
   resume** a game.
4. **Balance** — no faction or strategy is dominant or useless across a sample
   of automated matches; matches resolve in a reasonable length.
5. **Polish** — a loading screen, graphics-quality options for low-end devices,
   no console errors across the main flows, and green automated tests.

**Non-goals (explicitly out of scope for 8–12).** Multiplayer/networking,
accounts/cloud saves, a backend, monetization, a full narrative campaign with
scripted missions (a *structure* for one may be stubbed, but authored mission
content is its own future effort), and original commissioned art/music
production (the *pipeline* is in scope; sourcing final assets is not).

**Environment constraint that shapes these phases.** The build environment is
offline-ish with no asset store and no GPU. Therefore the default deliverables
are **procedural** (synthesized audio, procedural geometry) and the external
asset paths are **drop-in ready** rather than pre-filled. This is a deliberate
choice so the game is fully playable with zero external dependencies, while a
later art/audio pass can replace stubs by editing data files only.

---

## Phase 8 — Audio & Music

**Goal.** The game is alive with sound on every platform, generated entirely in
the browser (WebAudio) so it ships with no audio files, while still allowing
real samples to be dropped in via `src/data/audio.json`.

**Why now.** Silence is the single most "unfinished" signal a game can give.
Audio is high perceived-value for relatively low effort, and the cue/event
plumbing already exists ([audio.js](src/render/audio.js), event routing).

**Scope.**
- **SFX engine upgrade.** Replace single-oscillator blips with small synth
  *patches* (layered oscillators + noise + envelopes + filter) for: select,
  move/attack order, train/build complete, era up, combat hit (sword, arrow,
  thrown, cannon), unit death, fire crackle (looping while fires burn),
  building collapse, UI click, victory/defeat sting, hero summon, each
  ultimate. Positional volume falloff from camera/selection where cheap.
- **Ambient bed.** A continuous, looping, low-level ambience that changes with
  the chosen **environment theme**: tropical = insects/birds; water village =
  lapping water + distant gulls; mountain = wind. Built from filtered noise +
  sparse randomized one-shots; no files.
- **Generative music.** A gentle, generative **gamelan-style** score on a
  pentatonic (slendro/pelog-flavoured) scale — culturally apt for Brunei /
  Nusantara — with at least two intensity states: **menu/peace** and
  **battle** (denser, faster) that cross-fade based on whether the player is in
  combat. Metallophone-like timbres via additive synthesis + decay envelopes.
- **Mix & control.** A master bus with **Master / Music / SFX** gain stages.
  Mute (existing `M` key) preserved. Volumes are settable (wired to the Phase 10
  settings menu) and persist to `localStorage`.

**Acceptance criteria.**
- Starting a match produces ambience + music within a couple of seconds of the
  first user gesture (autoplay-unlock respected).
- Combat, building, training, fire and game-over all produce distinct audible
  cues; fire crackle starts/stops with active fires.
- Switching environment theme audibly changes ambience.
- Master/Music/SFX volumes and mute take effect immediately and survive reload.
- No console errors; all sim tests still green (audio is render-side only).

---

## Phase 9 — Art Pipeline (GLTF ingestion + animation)

**Goal.** Two things: (a) make the promised "drop in a `.glb`, no code changes"
manifest workflow **actually work**, and (b) make the existing procedural units
**move** so the world isn't a frozen diorama.

**Why now.** The manifest, builders and `gltf: null` fields already exist; the
loader is the missing link. Animation is the cheapest large jump in
"feels like a real game" once models are in place. Real commissioned models are
external and out of scope, but the pipeline and a graceful fallback are not.

**Scope.**
- **GLTF loader integration.** When a manifest entry has a non-null `gltf`
  path, load and cache that asset (via `three/examples/jsm/loaders/GLTFLoader`)
  and use it instead of the procedural builder; on load failure, **fall back**
  to the procedural builder and warn. Loads are cached/deduped by path. Applies
  to props, units and buildings uniformly.
- **Asset normalization.** Loaded GLTFs are auto-scaled/recentred to the
  builder's expected footprint (origin at feet, faction-tint hook) so artists
  don't have to match engine units exactly.
- **Procedural animation.** Add lightweight, code-driven motion to units that
  works for *both* procedural and GLTF-without-clips models: idle breathing
  bob, walk cycle (leg/torso oscillation while moving), attack lunge on hit,
  gather swing for villagers. If a GLTF ships animation clips, play those
  instead via `AnimationMixer`.
- **Docs.** Update [ART_PIPELINE.md](ART_PIPELINE.md) with the exact, verified
  drop-in steps and the normalization contract.

**Acceptance criteria.**
- Setting a `gltf` path on a manifest entry renders that model with no other
  code change; a bad path falls back to procedural + a single warning.
- Units visibly animate when idle, moving, attacking and gathering.
- No regression: themes/flows render with no console errors; sim tests green.

> Honesty note: this phase ships the **pipeline + procedural animation**, not a
> set of final commissioned models. Replacing procedural art with real `.glb`
> assets is a content task that this pipeline makes a data-only change.

---

## Phase 10 — Content & Persistence

**Goal.** Give the player control and continuity: a settings menu, the ability
to **save and resume** a match, and more than one map to play.

**Why now.** "Can I change the volume?" and "Can I come back to my game?" are
table-stakes expectations that a release must meet. The sim is pure data in
`/src/sim` (no Three.js), which makes deterministic snapshotting feasible.

**Scope.**
- **Settings menu.** An overlay reachable from the title screen and in-game
  (pause): Master/Music/SFX volume sliders, mute, graphics-quality preset
  (Low/Medium/High — consumed in Phase 12), and a controls/help reference.
  Persists to `localStorage`.
- **Save / load.** Serialize the deterministic sim to a JSON snapshot (seed,
  tick, RNG state, players/economy/tech, all live entities, fire & fog,
  chosen theme/difficulty) and restore it, rebuilding the render layer from the
  restored sim. Manual "Save game" + automatic "resume last game" on launch.
  Versioned snapshot schema with a graceful "incompatible save" message.
- **Map options.** Let the player pick map **size** (small/medium/large) and a
  **seed** (random or entered) at setup, in addition to the existing
  faction / difficulty / environment-theme choices. Consolidate the setup
  choices into a coherent skirmish-setup flow.

**Acceptance criteria.**
- Settings persist across reload and visibly affect audio immediately.
- A match can be saved and restored to a functionally identical state
  (verified headlessly: same tick, same entity count, same resources; the
  restored sim continues to step without error).
- At least three distinguishable map sizes are selectable and generate valid,
  playable maps; entering the same seed reproduces the same map.
- Sim tests green (snapshot round-trip added as a new test).

---

## Phase 11 — Balance & Tuning

**Goal.** Use the deterministic, headless sim to *measure* balance instead of
guessing, then tune the data files so no banner or strategy is strictly
best/worst and matches resolve in a sensible window.

**Why now.** The sim runs headlessly and deterministically — ideal for batch
simulation. This is the only phase that can be largely *data-driven* and
*measured*, and it's cheap relative to its impact on feel.

**Scope.**
- **Balance harness.** A headless script that runs many AI-vs-AI matches across
  faction pairings (and difficulties), to a tick cap, recording: winner, match
  length, peak army value, resource flow, and any stalls/timeouts. Outputs a
  readable report (win-rate matrix + length distribution).
- **Tuning pass.** Based on the report, adjust `factions.json` / `units.json` /
  `buildings.json` / economy constants to pull outlier win-rates toward the
  middle and bring match lengths into a target band. Re-run to confirm.
- **Regression guard.** Keep the seeded sim tests green throughout (balance
  edits must not break deterministic test expectations, or those expectations
  are updated deliberately and noted).

**Acceptance criteria.**
- Harness runs N matches and prints a win-rate matrix + length stats.
- After tuning, no faction's overall win-rate is a gross outlier (target: each
  within a reasonable band of 50% in mirror-pool play), and the median match
  length sits in the target window.
- All sim tests green (or intentionally, explicitly updated).

---

## Phase 12 — Polish, Performance & QA

**Goal.** The "last 10% that takes 30%": make it boot nicely, run on weak
devices, and pass a clean final sweep.

**Why now.** Last, because it consumes the outputs of all prior phases (the
graphics-quality setting from Phase 10, the audio from Phase 8, etc.) and
because final QA is only meaningful once the feature set is frozen.

**Scope.**
- **Loading screen.** A themed loading/boot screen while assets and the first
  world build complete, replacing any blank flash.
- **Graphics quality presets.** Wire the Low/Med/High setting to concrete
  renderer knobs: shadow map on/off + resolution, device pixel-ratio cap,
  ambient-life density, fog/water shader detail. Optional auto-detect on weak
  hardware.
- **Performance guards.** No per-frame allocation in hot paths (audit),
  instancing/pooling honoured, sensible draw distance; verify the sim's
  catch-up clamp protects against spiral-of-death on slow frames.
- **Final QA sweep.** Run the full sim test suite + a headless pass that loads
  every theme and the main UI flows asserting **zero console errors**; fix
  what surfaces. Update [README.md](README.md) (how to run, controls, feature
  list) and confirm the educational/fan-made disclaimer + credits are intact.

**Acceptance criteria.**
- A loading screen shows on boot and dismisses when ready.
- Low preset measurably reduces GPU cost (shadows off, lower pixel ratio,
  fewer ambient props) and is selectable + persisted.
- Full automated sweep is green with zero console errors across themes/flows.
- README reflects the shipped feature set; disclaimer/credits unchanged.

---

## Cross-cutting requirements (all phases)

- **Architecture is sacred.** `/src/sim` never imports Three.js; all new
  rendering/audio/UI lives in `/src/render`. Fixed 20 Hz tick stays decoupled
  from render. (See [VIBE_CODING.md](VIBE_CODING.md).)
- **Data-driven by default.** New tunables go in `src/data/*.json`, not inline
  constants, wherever a designer might want to change them.
- **Verify every phase.** `npm run build` clean + all `scripts/test-sim-*.mjs`
  green + a headless console-error check before a phase is called done.
- **Respect the tone.** No reintroduction of royal dedication/crest; keep the
  unfinished/educational/fan-made/non-commercial disclaimer and the
  "Blooming Barakah 2026 · Heru & Hasanah" credits.
- **No silent cuts.** If a phase won't fit, propose the cut — don't drop it
  quietly.

## Sequencing & rationale

8 → 12 in order. Audio first (high value, self-contained). Art pipeline next
(unblocks any later asset work and makes the world move). Content/persistence
then (depends on nothing but benefits from a settings home for audio/graphics
options). Balance after the feature set is stable enough to measure. Polish/QA
last because it consumes everyone else's outputs and freezes the build.

## Estimate

Five phases. By *effort* (not phase count), Phase 9 (art) and Phase 11
(balance, iterative) are the heaviest; Phase 8 and Phase 12 are moderate;
Phase 10 is moderate-to-heavy (save/load is fiddly). The procedural-first
strategy keeps all five fully achievable in-engine with no external assets,
while leaving real art/audio as a pure data-swap for the future.
