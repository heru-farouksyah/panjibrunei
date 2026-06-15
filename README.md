# Panji Brunei

A fully playable, single-player real-time strategy game in the browser —
Age of Empires-style, in a full 3D world, themed on Bruneian legend and
history. Pure JavaScript + Three.js; the simulation runs at a fixed
20 ticks/sec on a 96×96 logical grid, fully decoupled from rendering.

## Play

```bash
npm install
npm run dev      # development server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

Before a match you choose your **banner** (each shown with a hero portrait), the
**difficulty** (Easy = 2 rival kingdoms · Normal = 4 · **Hard** = an early rush
with a tougher economy — a free-for-all where the AIs also fight each other), an
**environment theme**, a **map size** (Small / Medium / Large), and a **map
seed** (re-roll or type one to replay a map).

**Desktop** controls: **left-drag** select · **right-click** move/attack/gather ·
**WASD / screen edge** pan · **wheel** zoom · **1–5 / Ctrl+1–5** control groups ·
**F1** hotkeys · **F3** debug · **O** settings · **F5** save · **Space** pause · **M** mute.

**Mobile** (landscape) has near-parity via on-screen controls: tap select / drag
pan / pinch zoom, a **⛶ box-select** toggle (or long-press) for multi-select,
a **1–5 control-group bar** (tap recall, long-press assign), a **☰ menu** for
pause / settings / save, double-tap empty ground = attack-move, haptic feedback,
and graphics that auto-default to **Low** on small devices.

## The game

- **4 resources**: Food (sago, farms, fishing), Timber, Gold, Camphor (rare,
  gates eras, elites and heroes).
- **4 eras**: Kampong → Kota Batu → Empire → Perjuangan, advanced at the Istana.
- **6 factions (Panji)**, each with a unique bonus, hero, and ultimate —
  from Awang Semaun's ground slam to Liau Badar's full-map reveal.
- **River-dominated maps**: fords, fishing boats, war perahu, trade routes
  between docks, shoreline stilt buildings.
- **Win** by slaying the enemy **Boss** (their champion guards the capital from
  the start), destroying every enemy Istana, or defending a Mahkota Monument
  for 5 minutes.
- Buildings **upgrade their appearance each era**; houses shelter residents
  whose numbers drain as the building is damaged; workers can demolish
  buildings for a partial refund.
- **Scripted AI** with economy management, counter-based armies (it only
  reacts to what it has scouted), timed attack waves, retreats and rebuilds.
  Fully deterministic (seeded), so runs are reproducible.
- **Fire & siege**: fire arrows, thrown firebombs and Lela cannon set blazes
  that spread through vegetation and structures; Balai Bomba firefighters douse.
- **Environment themes** — Tropical Kampong, Water Village, Highland Mountains —
  recolour terrain, water, sky, fog and lighting; chosen at setup.
- **Procedural audio** (no audio files): synthesised SFX, a per-theme ambient
  bed, and a generative gamelan-style score that shifts between peace and
  battle. Master/Music/SFX volumes + mute, persisted.
- **Save & resume** a match (deterministic snapshot to localStorage), a
  **settings** menu (volumes, graphics quality, controls), and **3 graphics
  presets** (Low/Medium/High) for low-end devices.
- **Real 3D assets drop in via data only** — set a `gltf` path in
  `src/data/models.json` and the loader swaps it for the procedural model, with
  normalization, faction tinting and graceful fallback. See `ART_PIPELINE.md`.
- **Variable map size** (Small 72² / Medium 96² / Large 128²) and **3 AI
  difficulties** (Easy / Normal / Hard) chosen at setup.
- **Procedural hero portraits** on the faction cards (drop-in for real art via a
  `portrait` field in `factions.json`).

## Docs

- `DESIGN.md` — the original game design spec.
- `PRD.md` — product requirements for the road-to-production phases (8–12).
- `VIBE_CODING.md` — the build guide / conventions for extending the game.
- `ART_PIPELINE.md` — dropping in real models & audio with no code changes.
- `BALANCE.md` — the balance methodology, findings and the harness.

## Testing

Deterministic pure-Node sim tests and headless Playwright checks live in
`scripts/`:

```bash
for t in phase2 phase3 phase4 phase5 phase6 phase7 improvements multikingdom fire save mapsize; do
  node scripts/test-sim-$t.mjs; done   # logic (no browser)
node scripts/test-audio.mjs            # audio engine       (needs npm run dev)
node scripts/test-art.mjs              # GLTF pipeline      (needs npm run dev)
node scripts/test-content.mjs          # settings/save/seed (needs npm run dev)
node scripts/test-qa.mjs               # themes + gfx presets (needs npm run dev)
node scripts/test-mapsize-render.mjs   # map-size render (spawns its own server)
node scripts/balance.mjs               # AI-vs-AI balance harness (DIFF=hard too)
```

## Architecture

| Layer | Path | Rule |
|---|---|---|
| Simulation | `src/sim/` | All game logic. **Never imports Three.js.** |
| Rendering | `src/render/` | Draws sim state; interpolates between ticks. |
| Data | `src/data/*.json` | All stats, costs, factions, model + audio manifests. |

Pure-Node sim tests (no browser needed) and headless Playwright visual
checks live in `scripts/`. See `ART_PIPELINE.md` for dropping in real
3D models and audio without touching code.

## Disclaimer

This is an **unfinished work in progress**, created purely for **educational
purposes**. It is a fan-made, non-commercial project and is not affiliated
with, nor endorsed by, any government, institution, or organisation. We
apologise if any of its content unintentionally offends any party.
*Maaf sekiranya terdapat sebarang unsur yang menyinggung mana-mana pihak.*
