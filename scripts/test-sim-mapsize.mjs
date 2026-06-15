// Phase 13 — variable map size. The risk in this refactor is a tile-index
// stride that still uses the old constant (96) instead of the grid's instance
// size: at a non-default size that silently corrupts pathfinding/gathering/fog.
// So this test runs full AI matches at sizes 72 and 128 and asserts the world
// is the right size, units stay in bounds, resources actually flow (gather +
// path + economy strides agree), and save/load stays in lock-step.
import { Sim } from '../src/sim/sim.js';
import { MAP_SIZES, GRID } from '../src/sim/constants.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };

check('MAP_SIZES exposes small/medium/large', MAP_SIZES.small === 72 && MAP_SIZES.medium === 96 && MAP_SIZES.large === 128);
check('default size is GRID (96)', new Sim({ seed: 1 }).grid.size === GRID);

for (const size of [72, 128]) {
  const sim = new Sim({ seed: 4242, playerFaction: 'semaun', aiFaction: 'sakam', difficulty: 'normal', numEnemies: 1, mapSize: size });
  check(`size ${size}: grid dimension`, sim.grid.size === size);
  check(`size ${size}: tile array sized`, sim.grid.types.length === size * size);
  check(`size ${size}: fog arrays sized`, sim.fog.explored[0].length === size * size);
  check(`size ${size}: fire stride`, sim.fire.size === size);
  check(`size ${size}: start zones inside map`, sim.grid.startZones.every((s) => s.x > 0 && s.x < size && s.y > 0 && s.y < size));

  // run a real match slice; both kingdoms gather, path, fight, maybe burn
  for (let i = 0; i < 700; i++) sim.step();

  let inBounds = true, finite = true, units = 0;
  sim.pool.forEach((e) => {
    if (e.kind !== 'unit') return;
    units++;
    if (e.x < 0 || e.z < 0 || e.x > size || e.z > size) inBounds = false;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !Number.isFinite(e.hp)) finite = false;
  });
  check(`size ${size}: units stayed in bounds`, inBounds, `${units} units`);
  check(`size ${size}: no NaN positions/hp`, finite);

  // resources flowed (proves gatherTile encode/decode + pathfinding strides agree)
  const gathered = sim.players.reduce((s, p) => s + Object.values(p.gathered).reduce((a, b) => a + b, 0), 0);
  check(`size ${size}: resources were gathered`, gathered > 0, `total gathered ${gathered.toFixed(0)}`);

  // save/load structural round-trip at this size (AI match: AI state isn't
  // serialized, so we check structure, not lock-step — see below)
  const restored = Sim.deserialize(JSON.parse(JSON.stringify(sim.serialize())));
  check(`size ${size}: restore keeps size`, restored.grid.size === size);
  let rc = 0; restored.pool.forEach(() => rc++);
  let oc = 0; sim.pool.forEach(() => oc++);
  check(`size ${size}: restore keeps entity count`, oc === rc, `${oc} vs ${rc}`);

  // deterministic lock-step is guaranteed AI-FREE (AI timers aren't saved); run
  // it on a fresh AI-free sim at this size to isolate the index-stride math
  const det = new Sim({ seed: 71, playerFaction: 'semaun', numEnemies: 1, mapSize: size });
  for (let i = 0; i < 120; i++) det.step();
  const det2 = Sim.deserialize(JSON.parse(JSON.stringify(det.serialize())));
  let lock = true;
  const fp = (s) => { let c = 0, h = 0; s.pool.forEach((e) => { c++; h += e.x + e.z * 7 + e.hp * 13; }); return `${s.tick}|${c}|${h.toFixed(3)}|${s.rng.getState()}|${s.fire.rng}`; };
  for (let i = 0; i < 200; i++) { det.step(); det2.step(); if (fp(det) !== fp(det2)) { lock = false; break; } }
  check(`size ${size}: AI-free save/load lock-step (200 ticks)`, lock);
}

// same seed + size reproduces; different size differs
const a = new Sim({ seed: 9, mapSize: 72 }).grid.types.join('');
const b = new Sim({ seed: 9, mapSize: 72 }).grid.types.join('');
const c = new Sim({ seed: 9, mapSize: 128 }).grid.types.join('');
check('same seed+size reproduces the map', a === b);
check('different size gives a different map', a !== c);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
