# PANJI BRUNEI — Game Design Spec

PROJECT: "Panji Brunei" — a fully playable, single-player real-time strategy
game in the browser, inspired by Age of Empires, in a full 3D world, built
entirely in JavaScript.

## TECH CONSTRAINTS
- Pure JavaScript (ES modules), Three.js (or equivalent WebGL) for rendering.
  Full 3D world — no pixel art, no 2D sprites.
- Vite for dev/build. No backend, no multiplayer, no login. Runs in browser.
- Simulation runs on a fixed timestep (20 ticks/sec) decoupled from render
  framerate. All game logic lives in the simulation layer (/src/sim, which
  must never import Three.js); the render layer only draws.
- Object pooling for units/projectiles; instanced meshes for repeated
  geometry (trees, units). No per-frame allocation in hot loops.

## VISUAL QUALITY BAR (applies to every phase — never ship blobby placeholders)
- Make it look like a real game: proper lighting and shadows (one directional
  sun + ambient, shadow maps), readable unit silhouettes, terrain with
  texture/material variety, water with simple animated shader on rivers.
- Units/buildings are stylized low-poly 3D models built from composed
  primitives with intentional proportions and faction-color materials —
  a swordsman must read as a swordsman at gameplay zoom.
- Smooth camera pan and zoom (eased, clamped), classic RTS angled top-down
  perspective.
- A model manifest (/src/data/models.json) maps every entity id to its
  model-builder function now and to imported GLTF paths later, so real
  3D assets (e.g. from Meshy/Tripo) can be swapped in without code changes.

## CHOSEN VISUAL STYLE (locked in at Phase 1 check-in)
Style C — grounded semi-realistic tropical: muted earthy palette, heavier
atmosphere (haze, warm golden sun), denser jungle. Cinematic over toy-like.

## CHECK-INS PROTOCOL (applies to EVERY phase prompt)
Check in at key decision points instead of deciding silently.
- Before building the world (Phase 1), present 3 visual style directions
  labeled A/B/C with a one-line tradeoff each, and wait for the pick. [DONE: C]
- Do the same for any major gameplay scoping decision — including what
  would be cut if the full scope of a phase won't fit in one shot.
- Never silently drop a feature from the spec; propose the cut and wait.

## SETTING & TONE
Brunei across its legendary and historical eras — primal myth, the Kota Batu
sultanate, the empire's golden age, and the 19th-century people's resistance.
Respectful, heroic, mythologized but rooted in real figures. Water is central:
rivers, Kampong Ayer stilt villages, perahu boats.

## RESOURCES (4)
- FOOD (padi farms, fishing from river tiles, sago groves)
- TIMBER (jungle trees)
- GOLD (mines, river trade)
- CAMPHOR (rare luxury resource from special jungle groves; gates elite units,
  hero summoning, and era advancement — Brunei's historical export)

## ERAS (tech ages, advance at the Istana)
1. Kampong Era      — villagers, basic economy, militia
2. Kota Batu Era    — walls, archers, perahu war boats, blacksmith
3. Empire Era       — lela swivel-cannon, elite units, trade ships, hero unlock
4. Perjuangan Era   — ultimate techs, hero ability upgrades

## CORE BUILDINGS
Istana (town center), Rumah Kampong (houses, pop cap), Kebun (farm),
Pangkalan (dock — trains boats, enables fishing), Balai Pahlawan (barracks),
Gerai Tukang (blacksmith — upgrades), Kubu (watchtower), Pagar (palisade/wall),
Surau (heals nearby units, generates small Camphor trickle),
Panggung Panji (Hero Shrine — summons the faction hero, Empire Era, costs
heavy Camphor; only one hero alive at a time, long respawn).

## CORE UNIT ROSTER (shared, reskinned per faction)
- Penduduk (villager): gathers, builds, repairs
- Pahlawan Kampilan (kampilan swordsman): melee line infantry
- Pemanah (bowman): ranged
- Penikam Keris (keris skirmisher): fast, cheap, anti-archer
- Lela Gunner (Empire Era): slow siege unit, swivel-cannon, anti-building
- Perahu Nelayan (fishing boat), Perahu Perang (war boat: ranged, river only)
- Pedagang (trade cart/boat: generates gold between markets)

## RIVERS ARE TERRAIN
Maps are river-dominated. Boats only on water tiles.
Some resources (fish, trade routes) only reachable by water. Stilt buildings
(Pangkalan, some houses) can be placed on shoreline tiles.

## THE 6 PANJI (playable factions)
Each = one banner, one hero, one faction bonus, one hero ultimate. Heroes are
powerful single units summoned at the Panggung Panji; ultimate has a long
cooldown.

1. PANJI SEMAUN — hero: Awang Semaun (legendary era)
   Faction bonus: infantry +15% HP; buildings 10% cheaper Timber.
   Hero: massive melee bruiser, very high HP, cleave attack.
   Ultimate "Kekuatan Gergasi": ground slam — AoE damage + knockback +
   3s stun in radius around hero. Cracks terrain decal.

2. PANJI SAKAM — hero: Pengiran Muda Sakam (Kota Batu era)
   Faction bonus: military units train 20% faster; +10% move speed at night
   (day/night cycle optional — if not implemented, flat +5% move speed).
   Hero: spear cavalry-style fast melee, bonus damage vs siege.
   Ultimate "Serbuan Berani Mati": summons 100 spectral warriors (weak,
   30s lifespan, uncontrollable — they auto-charge nearest enemies as a
   crimson wave). One use per cooldown; visually a red ghost-army surge.

3. PANJI HASSAN — hero: Sultan Hassan (Kota Batu era)
   Faction bonus: walls/towers +25% HP; units near the hero or Istana
   gain +2 armor ("aura of order").
   Hero: non-combat-pose commander — moderate stats, strong auras.
   Ultimate "Perintah Adil": for 15s all friendly units in a large radius
   gain a glowing geometric shield (absorbs flat damage) and +20% attack
   speed; enemy conversion/control effects are blocked.

4. PANJI SHAHBANDAR — hero: Pengiran Shahbandar Pengiran Mohd. Salleh (19th c.)
   Faction bonus: trade income +25%; map vision +1 tile on all units.
   Hero: ranged caster, attacks are glowing Jawi-script projectiles.
   Ultimate "Lidah Pujangga": converts up to 5 enemy units in a radius to
   your side permanently (silver-blue calligraphy swirl); heroes immune.

5. PANJI SAMAN — hero: Haji Saman (19th c. resistance)
   Faction bonus: villagers +50% HP and can fight decently; units cost
   5% less Food.
   Hero: musket + parang hybrid (ranged with melee fallback).
   Ultimate "Bara Perjuangan": for 20s every friendly villager in a large
   radius transforms into an ember-wreathed militia fighter (temporary
   combat stats), then reverts. Ember-orange aura.

6. PANJI BADAR — hero: Liau Badar (19th c. tactician)
   Faction bonus: all units +1 line of sight; ambush — units standing in
   jungle tiles are hidden until they attack.
   Hero: agile twin-keris duelist, high attack speed, low HP.
   Ultimate "Mata Strategi": reveals the entire map for 10s and marks all
   visible enemies (teal outline) — marked enemies take +25% damage for 15s.

## VICTORY
Destroy all enemy Istana, OR build and defend a "Mahkota Monument"
(Perjuangan Era wonder) for 5 minutes.

## AI OPPONENT
One scripted AI difficulty to start — gathers, expands, builds army on a
timer, attacks in waves, rebuilds. No cheating resources on Normal.
