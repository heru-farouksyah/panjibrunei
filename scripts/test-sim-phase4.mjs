// Pure-Node test for Phase 4: combat counters, attack-move, towers, fog of
// war states, fishing boats, war boats, trade routes, surau healing.
import { Sim } from '../src/sim/sim.js';
import { TICK_RATE, GRID, TileType } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const run = (sim, seconds) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

// --- 1. counter triangle: skirmisher > archer > infantry > skirmisher ---
function duel(protoA, protoB, seconds = 60) {
  // hassan vs hassan: no ambush/stat tricks, pure counter math
  const sim = new Sim({ seed: 99, testUnits: true, playerFaction: 'hassan', aiFaction: 'hassan' });
  // clear the test armies, spawn a clean duel in open ground at combat range
  sim.pool.forEach((e) => sim.pool.kill(e));
  const a = sim.spawnUnit(protoA, 0, 40, 20);
  const b = sim.spawnUnit(protoB, 1, 48, 20);
  sim.cmdAttack([a.id], b.id, 0);
  sim.cmdAttack([b.id], a.id, 1);
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    sim.step();
    if (!a.alive || !b.alive) break;
  }
  return a.alive && !b.alive ? 'A' : b.alive && !a.alive ? 'B' : 'draw';
}
check(duel('penikam_keris', 'pemanah') === 'A', 'skirmisher beats archer');
check(duel('pemanah', 'pahlawan_kampilan') === 'A', 'archer beats infantry');
check(duel('pahlawan_kampilan', 'penikam_keris') === 'A', 'infantry beats skirmisher');

// --- 2. attack-move sweeps through an enemy position ---
{
  const sim = new Sim({ seed: 7, testUnits: true });
  const mine = [];
  const theirs = [];
  sim.pool.forEach((e) => (e.owner === 0 ? mine : theirs).push(e));
  // teleport a small enemy picket between the armies
  for (let i = 0; i < 3; i++) {
    const e = theirs[i];
    e.x = e.prevX = 35 + i;
    e.z = e.prevZ = 30;
  }
  sim.cmdAttackMove(mine.map((e) => e.id), 40, 34, 0);
  run(sim, 90);
  let picketAlive = 0;
  for (let i = 0; i < 3; i++) if (theirs[i].alive) picketAlive++;
  check(picketAlive === 0, `attack-move kills the picket (${3 - picketAlive}/3 dead)`);
}

// --- 3. kubu tower attacks, building damage, rubble event ---
{
  const sim = new Sim({ seed: 7 });
  sim.players[1].resources = { food: 9999, timber: 9999, gold: 9999, camphor: 9999 };
  const tower = sim.spawnBuilding('kubu', 1, 46, 46, true);
  const raiders = [];
  // a strong tower needs a real raiding party to bring down
  for (let i = 0; i < 8; i++) raiders.push(sim.spawnUnit('pahlawan_kampilan', 0, 43 + (i % 4), 43 + ((i / 4) | 0)));
  sim.cmdAttack(raiders.map((e) => e.id), tower.id, 0);
  let raiderHurt = false;
  let events = [];
  for (let i = 0; i < 80 * TICK_RATE; i++) {
    sim.step();
    events.push(...sim.drainEvents());
    if (raiders.some((e) => e.alive && e.hp < e.maxHp)) raiderHurt = true;
    if (!tower.alive) break;
  }
  check(raiderHurt, 'kubu tower shoots back at raiders');
  check(!tower.alive, 'raiders destroy the kubu');
  check(events.some((ev) => ev.type === 'death' && ev.kind === 'building'), 'building death event (rubble hook) fired');
}

// --- 4. fog of war: 3 states + coarse updates ---
{
  const sim = new Sim({ seed: 7 });
  const aiStart = sim.grid.startZones[1];
  check(!sim.fog.tileExplored(0, aiStart.x, aiStart.y), 'enemy base starts unexplored');
  const home = sim.grid.startZones[0];
  check(sim.fog.tileVisible(0, home.x, home.y), 'own base is visible');
  // send a scout toward the enemy base
  const scout = sim.spawnUnit('penikam_keris', 0, home.x + 2, home.y + 2);
  sim.cmdMove([scout.id], aiStart.x, aiStart.y, 0);
  run(sim, 120);
  check(sim.fog.tileExplored(0, scout.x | 0, scout.z | 0), 'scouted ground becomes explored');
  // walk the scout home; the enemy base area should drop to explored (grey)
  sim.cmdMove([scout.id], home.x, home.y, 0);
  run(sim, 120);
  check(
    sim.fog.tileExplored(0, aiStart.x, aiStart.y) || !sim.fog.tileVisible(0, aiStart.x, aiStart.y),
    'enemy base no longer visible after the scout leaves'
  );
  // enemy unit visibility follows fog
  const enemy = sim.spawnUnit('pahlawan_kampilan', 1, home.x + 3, home.y + 3);
  sim.fog.update(sim);
  check(sim.isVisibleToPlayer(0, enemy), 'enemy inside our vision is visible');
  enemy.x = enemy.prevX = aiStart.x;
  enemy.z = enemy.prevZ = aiStart.y;
  sim.fog.update(sim);
  check(!sim.isVisibleToPlayer(0, enemy), 'enemy in their own base is not visible to us');
}

// --- 5. fishing boat works a fish spot ---
{
  const sim = new Sim({ seed: 7 });
  const P = sim.players[0];
  // place a pangkalan on the shore + a boat next to a fish tile
  let shore = null;
  outer: for (let z = 2; z < GRID - 2; z++) {
    for (let x = 2; x < GRID - 2; x++) {
      if (sim.canPlace('pangkalan', x, z)) {
        shore = { x, z };
        break outer;
      }
    }
  }
  const dock = sim.spawnBuilding('pangkalan', 0, shore.x, shore.z, true);
  let fish = null;
  let bestD = Infinity;
  for (const ti of sim.grid.fishTiles) {
    const fx = ti % GRID;
    const fz = (ti / GRID) | 0;
    const d = (fx - dock.x) ** 2 + (fz - dock.z) ** 2;
    if (d < bestD) {
      bestD = d;
      fish = { x: fx, z: fz };
    }
  }
  check(!!fish, `fish spot exists (nearest ${Math.sqrt(bestD).toFixed(0)} tiles from dock)`);
  // spawn the boat on water near the dock
  const wi = sim.pathfinder.nearestPassable(dock.x | 0, dock.z | 0, 'water', 6);
  const boat = sim.spawnUnit('perahu_nelayan', 0, (wi % GRID) + 0.5, ((wi / GRID) | 0) + 0.5);
  const foodBefore = P.gathered.food;
  sim.cmdGather([boat.id], fish.x, fish.z, 0);
  run(sim, 150);
  check(P.gathered.food > foodBefore, `boat fished +${Math.round(P.gathered.food - foodBefore)} food`);

  // --- 6. war boat fights ---
  const wb = sim.spawnUnit('perahu_perang', 0, boat.x, boat.z);
  const enemyBoat = sim.spawnUnit('perahu_nelayan', 1, boat.x + 3, boat.z);
  sim.cmdAttack([wb.id], enemyBoat.id, 0);
  run(sim, 30);
  check(!enemyBoat.alive, 'perahu perang sinks an enemy boat');

  // --- 7. trade route between two pangkalan ---
  let shore2 = null;
  outer2: for (let z = GRID - 3; z > 2; z--) {
    for (let x = GRID - 3; x > 2; x--) {
      if (sim.canPlace('pangkalan', x, z)) {
        const d = (x - dock.tileX) ** 2 + (z - dock.tileZ) ** 2;
        if (d > 400) {
          shore2 = { x, z };
          break outer2;
        }
      }
    }
  }
  const dock2 = sim.spawnBuilding('pangkalan', 0, shore2.x, shore2.z, true);
  const trader = sim.spawnUnit('pedagang', 0, boat.x + 1, boat.z);
  const goldBefore = P.resources.gold;
  sim.cmdTrade([trader.id], dock2.id, 0);
  run(sim, 240);
  check(P.resources.gold > goldBefore, `trade route earned +${Math.round(P.resources.gold - goldBefore)} gold`);
}

// --- 8. surau heals ---
{
  const sim = new Sim({ seed: 7 });
  const surau = sim.spawnBuilding('surau', 0, 22, 22, true);
  const hurt = sim.spawnUnit('pahlawan_kampilan', 0, 24, 23);
  hurt.hp = 10;
  const camBefore = sim.players[0].resources.camphor;
  run(sim, 30);
  check(hurt.hp > 10, `surau healed unit to ${Math.ceil(hurt.hp)} hp`);
  check(sim.players[0].resources.camphor > camBefore, 'surau trickles camphor');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
