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

Press **F1** in-game for the hotkey reference, **F3** for the debug overlay.

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
  Easy and Normal; no resource cheats.

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
