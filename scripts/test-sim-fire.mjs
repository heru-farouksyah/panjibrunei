// Batch 5: fire system — ignition (firebomb / fire arrows), burning grass &
// buildings, spread, and the firefighter (Balai Bomba) dousing.
import { Sim } from '../src/sim/sim.js';
import { TICK_RATE, TileType, GRID } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const run = (sim, sec) => { for (let i = 0; i < Math.round(sec * TICK_RATE); i++) sim.step(); };

// a grass tile near the player base, away from buildings
function grassTile(sim, near) {
  for (let r = 3; r < 20; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = near.x + dx;
        const z = near.y + dz;
        if (sim.grid.typeAt(x, z) === TileType.GRASS && !sim.grid.occupied[sim.grid.idx(x, z)]) {
          return { x, z };
        }
      }
    }
  }
  return null;
}

// --- 1. firebomb thrower ignites an area; grass burns and spreads ---
{
  const sim = new Sim({ seed: 5 });
  const s = sim.grid.startZones[0];
  const g = grassTile(sim, s);
  sim.fire.ignite(sim, g.x + 0.5, g.z + 0.5, 1.5);
  check(sim.fire.burningTileCount() > 0, `fire ignited (${sim.fire.burningTileCount()} tiles)`);
  const initial = sim.fire.burningTileCount();
  run(sim, 1.5);
  // fire should have spread to more tiles at some point (it grows then burns out)
  const peak = sim.fire.burningTileCount();
  check(peak > 0, `fire is actively burning after 1.5s (${peak} tiles)`);
  check(peak < 80, `fire stays contained, no map-wide inferno (peak ~${peak})`);
  run(sim, 20);
  check(sim.fire.burningTileCount() === 0, 'fire burns itself out within ~15s');
  // a burnt grass tile is scorched to earth
  let scorched = false;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (sim.grid.typeAt(g.x + dx, g.z + dz) === TileType.EARTH) scorched = true;
  }
  check(scorched, 'burnt grass scorched to earth');
}

// --- 2. a building catches fire and takes damage over time ---
{
  const sim = new Sim({ seed: 5 });
  const s = sim.grid.startZones[0];
  const hut = sim.spawnBuilding('rumah_kampong', 0, s.x + 6, s.y + 6, true);
  const hp0 = hut.hp;
  sim.fire.igniteBuilding(sim, hut);
  check(hut.burning > 0, 'building set ablaze (burning > 0)');
  run(sim, 4);
  check(hut.hp < hp0, `burning building loses HP (${Math.round(hut.hp)} < ${hp0})`);
}

// --- 3. firefighter (Balai Bomba) douses nearby fire ---
{
  const sim = new Sim({ seed: 5 });
  const s = sim.grid.startZones[0];
  sim.spawnBuilding('balai_bomba', 0, s.x + 4, s.y + 4, true);
  const g = grassTile(sim, { x: s.x + 4, y: s.y + 4 });
  sim.fire.ignite(sim, g.x + 0.5, g.z + 0.5, 1.5);
  const before = sim.fire.burningTileCount();
  run(sim, 1.5);
  check(before > 0, `fire started near the fire station (${before} tiles)`);
  check(sim.fire.burningTileCount() < before || sim.fire.burningTileCount() === 0,
    `fire station doused the blaze (now ${sim.fire.burningTileCount()} tiles)`);
}

// --- 4. fire-arrows tech makes archer shots ignite ---
{
  const sim = new Sim({ seed: 5 });
  sim.players[0].mods.fireArrows = true;
  const archer = sim.spawnUnit('pemanah', 0, 40, 40);
  const target = sim.spawnUnit('pahlawan_kampilan', 1, 44, 40); // in open grass
  sim.cmdAttack([archer.id], target.id, 0);
  let lit = false;
  for (let i = 0; i < 20 * TICK_RATE && !lit; i++) {
    sim.step();
    if (sim.fire.burningTileCount() > 0) lit = true;
  }
  check(lit, 'archers with Fire Arrows set the ground alight on hit');
}

// --- 5. firebomb thrower unit exists and is era-2 ranged ---
{
  const sim = new Sim({ seed: 5 });
  const proto = sim.protos.units.pelempar_bom;
  check(!!proto && proto.firebomb === true, 'pelempar_bom (firebomb thrower) exists with firebomb flag');
  check(sim.protos.buildings.balai_pahlawan.trains.includes('pelempar_bom'), 'firebomb thrower trainable at Balai Pahlawan');
  check(!!sim.protos.buildings.balai_bomba.douse, 'Balai Bomba is a firefighter building (douse)');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
