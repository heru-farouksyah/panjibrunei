// Batch 4: free-for-all multi-kingdom test. 1 player + 4 AI rival kingdoms,
// each a distinct theme, all fighting each other and the player.
import { Sim } from '../src/sim/sim.js';
import { TICK_RATE } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const MIN = 60 * TICK_RATE;

// --- Normal = 4 enemies (5 kingdoms) ---
{
  const sim = new Sim({ seed: 4242, playerFaction: 'semaun', numEnemies: 4, difficulty: 'normal' });
  check(sim.numPlayers === 5, `5 kingdoms (player + 4 enemies), got ${sim.numPlayers}`);
  check(sim.ais.length === 4, `4 AI controllers, got ${sim.ais.length}`);
  // distinct themes + colours
  const colours = new Set();
  const names = [];
  for (let i = 1; i < 5; i++) {
    colours.add(sim.players[i].faction.color);
    names.push(sim.players[i].faction.name);
    check(sim.players[i].faction.isEnemy === true, `enemy ${i} is a themed kingdom (${sim.players[i].faction.name})`);
  }
  check(colours.size === 4, `4 distinct enemy banner colours (${[...colours].join(', ')})`);
  console.log('   enemy kingdoms:', names.join(' / '));

  // each kingdom starts with an istana + a boss
  const istanas = new Array(5).fill(0);
  let bosses = 0;
  sim.pool.forEach((e) => {
    if (e.protoId === 'istana') istanas[e.owner]++;
    if (e.isBoss) bosses++;
  });
  check(istanas.every((n) => n === 1), `every kingdom has 1 istana (${istanas.join(',')})`);
  check(bosses === 4, `4 enemy bosses guard their capitals (got ${bosses})`);

  // run a long free-for-all; enemies should damage/eliminate EACH OTHER
  let crashed = false;
  try {
    for (let t = 0; t < 22 * MIN && sim.winner < 0; t++) sim.step();
  } catch (err) {
    crashed = true;
    console.log('   CRASH:', err.message);
  }
  check(!crashed, 'no crash over a 22-minute free-for-all');

  // count how many enemy kingdoms were defeated, and by whom (player kills)
  let defeatedEnemies = 0;
  for (let i = 1; i < 5; i++) if (sim.players[i].defeated) defeatedEnemies++;
  const playerKills = sim.players[0].unitsKilled;
  console.log(`   after ${(sim.tick / MIN).toFixed(1)} min: winner=${sim.winner}, enemies defeated=${defeatedEnemies}, player kills=${playerKills}`);
  // at least SOME fighting happened between kingdoms (enemies killed units)
  let enemyKills = 0;
  for (let i = 1; i < 5; i++) enemyKills += sim.players[i].unitsKilled;
  check(enemyKills > 0, `enemy kingdoms are actively fighting (combined kills: ${enemyKills})`);
}

// --- Easy = 2 enemies (3 kingdoms) ---
{
  const sim = new Sim({ seed: 7, playerFaction: 'hassan', numEnemies: 2, difficulty: 'easy' });
  check(sim.numPlayers === 3, `Easy: 3 kingdoms (player + 2), got ${sim.numPlayers}`);
  check(sim.ais.length === 2, `Easy: 2 AI controllers, got ${sim.ais.length}`);
}

// --- player wins when ALL enemies are gone (manually raze the enemy istanas) ---
{
  const sim = new Sim({ seed: 99, playerFaction: 'semaun', numEnemies: 2, difficulty: 'normal' });
  for (let t = 0; t < 200; t++) sim.step(); // past the tick>100 victory guard
  // raze enemy 1's istana(s) → enemy 1 defeated, but enemy 2 remains → no win
  const razeKingdom = (owner) => {
    const ists = [];
    sim.pool.forEach((b) => { if (b.alive && b.owner === owner && b.protoId === 'istana') ists.push(b); });
    for (const b of ists) sim.killEntity(b, 0);
  };
  razeKingdom(1);
  check(sim.players[1].defeated && sim.winner < 0, 'razing enemy 1 defeats it but the match continues (enemy 2 alive)');
  razeKingdom(2);
  check(sim.winner === 0, 'razing the LAST enemy wins the match for the player');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
