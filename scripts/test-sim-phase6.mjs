// Pure-Node test for Phase 6: the scripted AI booms, scouts-counters,
// attacks in waves on schedule, retreats when losing, and beats a passive
// player by ~minute 20 on Normal. This runs ~25 minutes of game time.
import { Sim } from '../src/sim/sim.js';
import { TICK_RATE } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const MIN = 60 * TICK_RATE;

// --- 1. passive player on Normal: attacked by ~min 8, dead by ~min 22 ---
{
  const sim = new Sim({ seed: 1234, playerFaction: 'semaun', aiFaction: 'sakam', difficulty: 'normal' });
  let firstAttackTick = -1;
  let gameOverTick = -1;
  let t0 = performance.now();
  for (let t = 0; t < 25 * MIN; t++) {
    sim.step();
    if (firstAttackTick < 0) {
      // any player-0 building hit?
      let hit = false;
      sim.pool.forEach((e) => {
        if (e.owner === 0 && e.kind === 'building' && e.hp < e.maxHp && e.complete) hit = true;
      });
      if (hit) firstAttackTick = sim.tick;
    }
    if (sim.winner >= 0) {
      gameOverTick = sim.tick;
      break;
    }
  }
  const wallMs = performance.now() - t0;
  console.log(`   (simulated ${(sim.tick / MIN).toFixed(1)} game-min in ${(wallMs / 1000).toFixed(1)}s wall)`);
  check(firstAttackTick > 0, `passive player gets attacked (first hit ~min ${(firstAttackTick / MIN).toFixed(1)})`);
  check(firstAttackTick > 2 * MIN && firstAttackTick < 7 * MIN, 'first attack lands early (~minute 4)');
  check(gameOverTick > 0 && sim.winner === 1, `AI wins (min ${(gameOverTick / MIN).toFixed(1)})`);
  check(gameOverTick < 16 * MIN, 'passive player loses quickly (by ~minute 12)');

  // AI macro sanity at the end
  const ai = { villagers: 0, military: 0, buildings: 0 };
  sim.pool.forEach((e) => {
    if (e.owner !== 1) return;
    if (e.kind === 'building' && e.complete) ai.buildings++;
    if (e.kind === 'unit' && e.proto.tags.includes('villager')) ai.villagers++;
    if (e.kind === 'unit' && e.proto.tags.includes('military')) ai.military++;
  });
  console.log(`   (AI ended with ${ai.villagers} villagers, ${ai.military} military, ${ai.buildings} buildings, era ${sim.players[1].era})`);
  check(ai.villagers >= 10, 'AI boomed an economy');
  check(ai.buildings >= 5, 'AI expanded its base');
  check(sim.players[1].era >= 2, 'AI advanced eras');
}

// --- 2. Easy is slower to attack ---
{
  const sim = new Sim({ seed: 1234, playerFaction: 'semaun', aiFaction: 'sakam', difficulty: 'easy' });
  let firstAttackTick = -1;
  for (let t = 0; t < 11 * MIN; t++) {
    sim.step();
    let hit = false;
    sim.pool.forEach((e) => {
      if (e.owner === 0 && e.kind === 'building' && e.hp < e.maxHp && e.complete) hit = true;
    });
    if (hit) {
      firstAttackTick = sim.tick;
      break;
    }
  }
  check(firstAttackTick < 0, 'Easy AI has not attacked by minute 11');
}

// --- 3. active player can blunt a wave: AI retreats when losing badly ---
{
  const sim = new Sim({ seed: 77, playerFaction: 'hassan', aiFaction: 'badar', difficulty: 'normal' });
  // give the passive player a strong standing army at home
  const s = sim.grid.startZones[0];
  const guards = [];
  for (let i = 0; i < 14; i++) {
    guards.push(sim.spawnUnit('pahlawan_kampilan', 0, s.x - 3 + (i % 7), s.y + 4 + ((i / 7) | 0)));
  }
  for (let i = 0; i < 8; i++) {
    guards.push(sim.spawnUnit('pemanah', 0, s.x - 2 + (i % 4), s.y + 6 + ((i / 4) | 0)));
  }
  let sawWave = false;
  let sawRetreat = false;
  for (let t = 0; t < 18 * MIN; t++) {
    sim.step();
    if (sim.ai.waveActive) sawWave = true;
    if (sawWave && !sim.ai.waveActive && sim.winner < 0) {
      sawRetreat = true;
      break;
    }
    if (sim.winner >= 0) break;
  }
  check(sawWave, 'AI launched an attack wave');
  check(sawRetreat && sim.winner < 0, 'AI retreated after the wave broke on defenses');
  check(sim.players[0].defeated === false, 'defended player survives the first wave');
}

// --- 4. AI rebuilds key buildings after a raid ---
{
  const sim = new Sim({ seed: 9, playerFaction: 'semaun', aiFaction: 'hassan', difficulty: 'normal' });
  for (let t = 0; t < 4 * MIN; t++) sim.step();
  let balai = null;
  sim.pool.forEach((e) => {
    if (e.owner === 1 && e.protoId === 'balai_pahlawan') balai = e;
  });
  check(!!balai, 'AI built a balai pahlawan by minute 4');
  if (balai) {
    sim.players[1].resources.timber += 300; // ensure it can afford the rebuild
    sim.killEntity(balai, 0);
    let rebuilt = false;
    for (let t = 0; t < 4 * MIN && !rebuilt; t++) {
      sim.step();
      sim.pool.forEach((e) => {
        if (e.owner === 1 && e.protoId === 'balai_pahlawan') rebuilt = true;
      });
    }
    check(rebuilt, 'AI rebuilt the destroyed balai');
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
