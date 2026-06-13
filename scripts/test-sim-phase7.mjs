// Pure-Node test for Phase 7: Mahkota Monument victory (build, defend 5 min,
// countdown cancels if destroyed), stats history, and the 300-unit
// performance pass (sim side: 20 ticks/sec budget).
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

// --- monument victory ---
{
  const sim = new Sim({ seed: 5, playerFaction: 'hassan', aiFaction: 'semaun' });
  sim.players[0].era = 4;
  const s = sim.grid.startZones[0];
  const mon = sim.spawnBuilding('mahkota_monument', 0, s.x + 5, s.y + 5, true);
  run(sim, 7); // victory checks engage after the opening grace period
  check(sim.players[0].monumentSince >= 0, 'monument countdown started');
  let events = sim.drainEvents();
  check(events.some((e) => e.type === 'monument-started'), 'monument-started event fired');

  // destroying it cancels the countdown
  sim.killEntity(mon, 1);
  run(sim, 2);
  check(sim.players[0].monumentSince < 0, 'countdown cancels when the monument falls');
  events = sim.drainEvents();
  check(events.some((e) => e.type === 'monument-lost'), 'monument-lost event fired');

  // rebuild and defend the full 5 minutes -> victory
  sim.spawnBuilding('mahkota_monument', 0, s.x + 5, s.y + 5, true);
  run(sim, 2);
  const t0 = sim.players[0].monumentSince;
  check(t0 >= 0, 'countdown restarted after rebuild');
  run(sim, 5 * 60 + 5);
  check(sim.winner === 0, 'monument defended 5 minutes -> victory');
  events = sim.drainEvents();
  check(events.some((e) => e.type === 'game-over' && e.byMonument), 'game-over (by monument) event fired');
}

// --- stats history sampling ---
{
  const sim = new Sim({ seed: 5, playerFaction: 'semaun', aiFaction: 'badar' });
  run(sim, 30);
  check(sim.statsHistory.length >= 5, `stats history sampled (${sim.statsHistory.length} points in 30s)`);
  check(typeof sim.statsHistory[0].scores[0] === 'number', 'stats carry military scores');
}

// --- performance: 300 units in a brawl, sim tick budget ---
{
  const sim = new Sim({ seed: 11, testUnits: true });
  // wipe the small test armies and stage a 150v150 line battle
  sim.pool.forEach((e) => sim.pool.kill(e));
  const protos = ['pahlawan_kampilan', 'pemanah', 'penikam_keris'];
  const ids = [[], []];
  for (let owner = 0; owner < 2; owner++) {
    for (let i = 0; i < 150; i++) {
      const x = 30 + (i % 25) * 1.1;
      const z = owner === 0 ? 24 + ((i / 25) | 0) : 36 + ((i / 25) | 0);
      const u = sim.spawnUnit(protos[i % 3], owner, x, z);
      ids[owner].push(u.id);
    }
  }
  sim.cmdAttackMove(ids[0], 44, 38, 0);
  sim.cmdAttackMove(ids[1], 44, 22, 1);

  let alive = 300;
  let maxMs = 0;
  let totalMs = 0;
  let ticks = 0;
  for (let t = 0; t < 90 * TICK_RATE; t++) {
    const t0 = performance.now();
    sim.step();
    const ms = performance.now() - t0;
    if (t > 5) {
      maxMs = Math.max(maxMs, ms);
      totalMs += ms;
      ticks++;
    }
    if (t % 100 === 0) {
      alive = 0;
      sim.pool.forEach((e) => {
        if (e.kind === 'unit') alive++;
      });
      if (alive < 80) break;
    }
  }
  const avg = totalMs / ticks;
  console.log(`   (300-unit battle: avg ${avg.toFixed(2)}ms/tick, worst ${maxMs.toFixed(2)}ms, budget 50ms @ 20Hz)`);
  // Average is the real steady-state metric. The single worst tick includes
  // V8 GC pauses (bursty in headless Node), so it gets a GC-tolerant ceiling;
  // a one-off late tick is absorbed by the render loop's accumulator.
  check(avg < 10, `average tick well inside budget (${avg.toFixed(2)}ms)`);
  check(maxMs < 70, `worst tick inside GC-tolerant ceiling (${maxMs.toFixed(2)}ms)`);
  check(alive < 300, 'the battle actually resolved casualties');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
