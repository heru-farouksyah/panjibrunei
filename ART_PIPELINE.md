# Panji Brunei — Art Pipeline

Every model in the game ships as a **procedural placeholder** built from
composed primitives. All of them can be replaced by real low-poly 3D assets
(e.g. generated with Meshy or Tripo, or hand-made in Blender) **without
touching game code** via the model manifest.

> **Status (Phase 9): the GLTF loader is implemented and verified.** Setting a
> manifest entry's `gltf` to an asset path makes the renderer load it and use it
> instead of the procedural builder, with automatic normalization, faction
> tinting, load caching, and graceful fallback. Verified end-to-end by
> `scripts/test-art.mjs` and a live swap test. See **What's wired** below.

## Quick drop-in (verified steps)

1. Export a low-poly `.glb` following the conventions below.
2. Drop it under `public/assets/models/` (e.g. `public/assets/models/penduduk.glb`).
3. In `src/data/models.json`, set that entry's `gltf` to `/assets/models/penduduk.glb`.
4. Reload. The model loads asynchronously and swaps in when ready. If the path
   is wrong or the file is broken, the game keeps the procedural model and logs
   **one** warning — it never crashes or blocks the first frame.

## What's wired (and the one caveat)

- **Units** — full support. The loaded model is decomposed into per-part
  InstancedMeshes exactly like the procedural template (so instancing/perf and
  faction tinting via instance colour are preserved). The batch is rebuilt when
  the asset resolves.
- **Buildings** — full support. The loaded model replaces the procedural model
  meshes in place; the faction banner, selection ring and health bar are kept.
  *Caveat:* GLTF buildings do **not** get the procedural per-era decoration or
  the animated storage-resource pile (those are tied to the placeholder
  geometry). Per-era colour tinting still applies. If you need era decor on a
  real asset, ship era variants or add the `userData.storagePile` convention.
- **Props** (trees, rocks, fish spots) — remain **procedural-instanced** for
  now (thousands of them share a handful of draw calls). `gltf` on a prop entry
  is currently ignored; this is a deliberate, documented limitation.

The loader lives in `src/render/modelLoader.js` (`loadGLTF`, `cloneTemplate`,
`warnFallback`).

## The manifest: `src/data/models.json`

Every unit, building, and prop id maps to an entry:

```json
"pahlawan_kampilan": { "builder": "pahlawan_kampilan", "gltf": null }
```

- `builder` — the procedural fallback (functions in `src/render/unitModels.js`,
  `src/render/buildingModels.js`, `src/render/models.js`).
- `gltf` — set this to an asset path (e.g. `/assets/models/pahlawan_kampilan.glb`)
  to override the builder with a real model. Place files under `public/assets/models/`.

Audio works the same way: `src/data/audio.json` maps named cues to synth
stubs; set `file` on a cue to a sample path to replace it.

## Model conventions

| Property | Convention |
|---|---|
| Format | glTF binary (`.glb`), low-poly, single material preferred |
| Scale | **1 world unit = 1 tile ≈ 2 m.** A human is ~0.8 units tall; heroes ~1.0–1.2 |
| Origin | At the **feet** (ground contact point), centered on x/z — *also auto-normalized*: the loader recentres to feet and rescales to the engine's expected height, so you don't have to be exact |
| Forward axis | **+Z** faces the direction of travel |
| Buildings | Origin at footprint center; footprint is `size`×`size` tiles (see `src/data/buildings.json`); fit within it |
| Boats | Origin at the waterline center |

## Faction coloring

Placeholder models mark faction-colored parts (sashes, banners, sails) with a
white base material that the renderer multiplies by the faction color. For
GLTF assets, **name the mesh or material so it contains `faction` or `banner`**
(case-insensitive — e.g. `FactionCloth`, `banner_main`). The loader tags those
materials so the renderer applies the same per-owner tinting. Keep the base
colour white/neutral so the multiply reads true.

## Animation

Units are animated **procedurally** today and it looks alive: idle breathing,
a walk cycle (bob + lean), a melee lunge, a ranged recoil, a villager
chop/hammer swing while gathering/building, water bob for boats, and a carried
resource bundle. This works for procedural models **and** for GLTF models that
ship without animation clips, so a static `.glb` still moves.

If a GLTF ships skeletal animation clips, name them so the renderer can map
them (clip playback via `AnimationMixer` takes precedence over the procedural
motion when present):

| Clip name | Used when |
|---|---|
| `idle` | standing |
| `walk` | moving |
| `attack` | melee wind-up / ranged fire |
| `death` | on death (plays once, then the unit sinks) |

Optional: `gather` (villagers working), `carry` (walking with a full load).

## VFX

Ultimate and status effects are simple meshes/particles in
`src/render/vfx.js`, keyed by ultimate id (`kekuatan_gergasi`,
`serbuan_berani_mati`, `perintah_adil`, `lidah_pujangga`, `bara_perjuangan`,
`mata_strategi`). Replace individual effect classes there; events carry
position and affected entity ids.

## Concept art / portraits

The faction select screen (`src/render/screens.js`) uses colored banner
blocks as placeholders. Hero portraits and faction crests can be dropped in
as images under `public/assets/portraits/` and referenced from
`src/data/factions.json` (add a `portrait` field next to `color` and render
it in the faction card — one-line change in `screens.js`).
