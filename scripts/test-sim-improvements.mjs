// Tests for the post-launch improvements: javelin thrower + unit step-aside.
import { Sim } from '../src/sim/sim.js';
import { TICK_RATE } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const run = (sim, seconds) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) sim.step();
};

// --- javelin thrower exists, is era 1, ranged, and kills from a distance ---
{
  const sim = new Sim({ seed: 7, testUnits: true });
  const proto = sim.protos.units.pelempar_lembing;
  check(!!proto, 'pelempar_lembing proto exists');
  check(proto.era === 1 && proto.range >= 3, `javelin is era 1 and ranged (range ${proto.range})`);
  check(sim.protos.buildings.balai_pahlawan.trains.includes('pelempar_lembing'),
    'javelin trainable at Balai Pahlawan');

  // a thrower vs a melee infantry it should be able to poke
  sim.pool.forEach((e) => sim.pool.kill(e));
  const thrower = sim.spawnUnit('pelempar_lembing', 0, 40, 40);
  const target = sim.spawnUnit('penduduk', 1, 43, 40);
  sim.cmdAttack([thrower.id], target.id, 0);
  let sawProjectile = false;
  for (let i = 0; i < 30 * TICK_RATE; i++) {
    sim.step();
    sim.pool.forEach((e) => {
      if (e.kind === 'proj' && e.projThrown) sawProjectile = true;
    });
    if (!target.alive) break;
  }
  check(sawProjectile, 'thrown javelin projectile spawned (projThrown flag set)');
  check(!target.alive, 'javelin thrower killed its target from range');
}

// --- step-aside: idle units yield to a mover passing through them ---
{
  const sim = new Sim({ seed: 11, testUnits: true });
  sim.pool.forEach((e) => sim.pool.kill(e));
  // a wall of idle units the traveler must pass through
  const blockers = [];
  for (let i = 0; i < 8; i++) {
    blockers.push(sim.spawnUnit('pahlawan_kampilan', 0, 45, 36 + i * 0.5));
  }
  run(sim, 1); // let them settle
  const traveler = sim.spawnUnit('penikam_keris', 0, 40, 38);
  sim.cmdMove([traveler.id], 52, 38);
  let arrived = false;
  for (let i = 0; i < 25 * TICK_RATE; i++) {
    sim.step();
    if (Math.hypot(traveler.x - 52, traveler.z - 38) < 1.5) {
      arrived = true;
      break;
    }
  }
  check(arrived, `traveler pushed through the crowd to its goal (${traveler.x.toFixed(1)}, ${traveler.z.toFixed(1)})`);

  // no two units end up hard-stacked (separation keeps them apart)
  let stacked = 0;
  const all = [];
  sim.pool.forEach((e) => {
    if (e.kind === 'unit') all.push(e);
  });
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      if (Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z) < 0.18) stacked++;
    }
  }
  check(stacked === 0, `no hard-stacked unit pairs (${stacked})`);
}

// --- a big group move still resolves without permanent gridlock ---
{
  const sim = new Sim({ seed: 3, testUnits: true });
  const mine = [];
  sim.pool.forEach((e) => {
    if (e.owner === 0 && e.kind === 'unit') mine.push(e.id);
  });
  sim.cmdMove(mine, 60, 60); // across the river — needs time to cross the ford
  run(sim, 90);
  let near = 0;
  for (const id of mine) {
    const e = sim.pool.get(id);
    if (e && Math.hypot(e.x - 60, e.z - 60) < 8) near++;
  }
  check(near >= mine.length - 2, `group reached the destination area (${near}/${mine.length})`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
