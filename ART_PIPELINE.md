# Panji Brunei — Art Pipeline

Every model in the game is currently a **procedural placeholder** built from
composed primitives. All of them can be replaced by real low-poly 3D assets
(e.g. generated with Meshy or Tripo, or hand-made in Blender) **without
touching game code** via the model manifest.

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
| Origin | At the **feet** (ground contact point), centered on x/z |
| Forward axis | **+Z** faces the direction of travel |
| Buildings | Origin at footprint center; footprint is `size`×`size` tiles (see `src/data/buildings.json`); fit within it |
| Boats | Origin at the waterline center |

## Faction coloring

Placeholder models mark faction-colored parts (sashes, banners, sails) with a
white base material that the renderer multiplies by the faction color. For
GLTF assets, name materials with the prefix `Faction` (e.g. `FactionCloth`)
— the loader will apply the same per-owner tinting to those materials.

## Animation clips

Units are animated procedurally today (walk bob, lean). GLTF unit models
should ship these clips, which the renderer will map by name:

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
