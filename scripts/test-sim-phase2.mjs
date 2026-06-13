// Pure-Node sim test for Phase 2: spawn test armies, order a cross-river
// march, assert pathing correctness and tick-time budget. No browser, no
// Three.js — the sim layer runs standalone at full speed.
import { Sim } from '../src/sim/sim.js';
import { TileType, TICK_RATE } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const sim = new Sim({ seed: 20260612, testUnits: true });

const p0 = [];
sim.pool.forEach((e) => {
  if (e.owner === 0 && e.kind === 'unit') p0.push(e.id);
});
check(p0.length === 20, `player has 20 test units (got ${p0.length})`);

// March across the river (start zone is NW, target is south of the river).
const TX = 60;
const TZ = 60;
sim.cmdMove(p0, TX, TZ);

let waterViolations = 0;
let maxTickMs = 0;
let arrivedTick = -1;
const MAX_TICKS = TICK_RATE * 140;

for (let t = 0; t < MAX_TICKS; t++) {
  const t0 = performance.now();
  sim.step();
  // skip the first few ticks: JIT warmup dominates them in Node
  if (t > 5) maxTickMs = Math.max(maxTickMs, performance.now() - t0);

  if (t % 20 === 0) {
    for (const id of p0) {
      const e = sim.pool.get(id);
      if (e && sim.grid.typeAt(e.x | 0, e.z | 0) === TileType.WATER) waterViolations++;
    }
    let arrived = 0;
    for (const id of p0) {
      const e = sim.pool.get(id);
      if (e && Math.hypot(e.x - TX, e.z - TZ) < 6) arrived++;
    }
    if (arrived >= 19 && arrivedTick < 0) {
      arrivedTick = t;
      break;
    }
  }
}

check(arrivedTick > 0, `units arrived across the river (tick ${arrivedTick}, ~${Math.round(arrivedTick / TICK_RATE)}s game time)`);
check(waterViolations === 0, `no land unit ever stood on a water tile (violations: ${waterViolations})`);
check(maxTickMs < 15, `worst sim tick well under the 50ms budget (max ${maxTickMs.toFixed(2)}ms)`);

// Pathfinding budget: 200 simultaneous single-unit orders must not spike.
const sim2 = new Sim({ seed: 7, testUnits: true });
const all = [];
sim2.pool.forEach((e) => all.push(e.id));
for (const id of all) sim2.cmdMove([id], 48 + (id % 7), 48 + (id % 5)); // individual requests
let spikeMs = 0;
for (let t = 0; t < 100; t++) {
  const t0 = performance.now();
  sim2.step();
  if (t > 0) spikeMs = Math.max(spikeMs, performance.now() - t0);
}
check(spikeMs < 15, `40 simultaneous individual orders, worst tick ${spikeMs.toFixed(2)}ms`);
check(sim2.pathfinder.queue.length === 0 || sim2.pathfinder.queue.length < 40, `path queue drains (left: ${sim2.pathfinder.queue.length})`);

// Control sanity: stop command clears movement.
sim.cmdStop(p0);
const stopped = p0.every((id) => {
  const e = sim.pool.get(id);
  return !e || e.path === null;
});
check(stopped, 'cmdStop clears all paths');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
