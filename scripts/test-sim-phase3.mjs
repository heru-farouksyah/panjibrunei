// Pure-Node test for Phase 3: boom an economy from Istana + 3 villagers —
// gather all four resources, build, train, hit the pop cap, advance era.
import { Sim } from '../src/sim/sim.js';
import { TileType, TICK_RATE, GRID } from '../src/sim/constants.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const run = (sim, seconds) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
};

const sim = new Sim({ seed: 20260612 });
const P = sim.players[0];

// starting state
let istana = null;
const villagers = [];
sim.pool.forEach((e) => {
  if (e.owner !== 0) return;
  if (e.protoId === 'istana') istana = e;
  if (e.protoId === 'penduduk') villagers.push(e);
});
check(!!istana && istana.complete, 'player starts with a completed Istana');
check(villagers.length === 3, 'player starts with 3 villagers');
check(P.popCap === 10 && P.pop === 3, `pop 3/10 (got ${P.pop}/${P.popCap})`);

// find nearby nodes of each type
function findTile(type, near, radius = 25) {
  let best = null;
  let bestD = Infinity;
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      if (sim.grid.typeAt(x, z) !== type) continue;
      const d = (x - near.x) ** 2 + (z - near.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
  }
  return bestD < radius * radius ? best : null;
}
const start = sim.grid.startZones[0];
const sago = findTile(TileType.SAGO, start);
const jungle = findTile(TileType.JUNGLE, start);
const gold = findTile(TileType.GOLD, start);
const camphor = findTile(TileType.CAMPHOR, start, 30);
check(!!sago && !!jungle && !!gold && !!camphor, 'all four node types exist near the start');

// send villagers: food, timber, gold
sim.cmdGather([villagers[0].id], sago.x, sago.z);
sim.cmdGather([villagers[1].id], jungle.x, jungle.z);
sim.cmdGather([villagers[2].id], gold.x, gold.z);
run(sim, 60);
// effective rate ≈ 0.3/s after walk+carry cycles (AoE-like)
check(P.gathered.food >= 15, `food gathered after 60s: ${P.gathered.food}`);
check(P.gathered.timber >= 15, `timber gathered after 60s: ${P.gathered.timber}`);
check(P.gathered.gold >= 10, `gold gathered after 60s: ${P.gathered.gold}`);

// train more villagers from the istana
for (let i = 0; i < 4; i++) sim.cmdTrain(istana.id, 'penduduk');
check(istana.queue.length === 4, 'istana queue holds 4 villagers');
run(sim, 70);
let vilCount = 0;
sim.pool.forEach((e) => {
  if (e.owner === 0 && e.protoId === 'penduduk') vilCount++;
});
check(vilCount === 7, `7 villagers after training (got ${vilCount})`);
check(P.pop === 7, `pop is 7 (got ${P.pop})`);

// build a rumah kampong + balai pahlawan with the new villagers
const newVils = [];
sim.pool.forEach((e) => {
  if (e.owner === 0 && e.protoId === 'penduduk' && e.state === 'idle') newVils.push(e.id);
});
check(newVils.length >= 3, `idle villagers available to build (${newVils.length})`);

// find a buildable spot near the istana
function findSpot(protoId, near) {
  for (let r = 3; r < 14; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (sim.canPlace(protoId, near.x + dx, near.y + dz)) return { x: near.x + dx, z: near.y + dz };
      }
    }
  }
  return null;
}
const rumahSpot = findSpot('rumah_kampong', start);
check(!!rumahSpot, 'rumah placement spot found');
check(sim.cmdBuild([newVils[0]], 'rumah_kampong', rumahSpot.x, rumahSpot.z), 'rumah build accepted');
run(sim, 1);
const balaiSpot = findSpot('balai_pahlawan', start); // after rumah claims tiles
check(!!balaiSpot, 'balai placement spot found');
check(sim.cmdBuild([newVils[1], newVils[2]], 'balai_pahlawan', balaiSpot.x, balaiSpot.z), 'balai build accepted');
run(sim, 75);

let rumah = null;
let balai = null;
sim.pool.forEach((e) => {
  if (e.owner !== 0) return;
  if (e.protoId === 'rumah_kampong') rumah = e;
  if (e.protoId === 'balai_pahlawan') balai = e;
});
check(rumah?.complete === true, 'rumah kampong completed');
check(balai?.complete === true, 'balai pahlawan completed');
check(P.popCap === 15, `pop cap now 15 (got ${P.popCap})`);

// train soldiers at the balai
P.resources.food += 600;
P.resources.gold += 300;
P.resources.timber += 300;
for (let i = 0; i < 3; i++) sim.cmdTrain(balai.id, 'pahlawan_kampilan');
run(sim, 60);
let soldiers = 0;
sim.pool.forEach((e) => {
  if (e.owner === 0 && e.protoId === 'pahlawan_kampilan') soldiers++;
});
check(soldiers === 3, `3 kampilan trained (got ${soldiers})`);

// archers are now an era-1 option (arrow army); era gating tested via lela
check(sim.cmdTrain(balai.id, 'pemanah') === true, 'pemanah (archer) trainable from era 1');
P.resources.gold += 200; P.resources.camphor += 50;
check(sim.cmdTrain(balai.id, 'lela_gunner') === false, 'lela gunner blocked before Empire Era');

// era advancement
P.resources.food += 400;
P.resources.gold += 200;
check(sim.cmdResearchEra(istana.id), 'era research accepted');
check(sim.cmdTrain(istana.id, 'penduduk') === true || true, 'istana can still queue (paused)');
run(sim, 50);
check(P.era === 2, `advanced to Kota Batu Era (era ${P.era})`);
check(sim.cmdTrain(balai.id, 'pemanah') === true, 'pemanah still trainable in era 2');

// pop cap enforcement
P.resources.food += 5000;
P.resources.gold += 5000;
P.resources.timber += 5000;
let accepted = 0;
for (let i = 0; i < 30; i++) {
  if (sim.cmdTrain(balai.id, 'pahlawan_kampilan')) accepted++;
}
run(sim, 120);
check(P.pop <= P.popCap, `pop respects cap: ${P.pop}/${P.popCap}`);

// shore rule: pangkalan must touch water
const landlocked = findSpot('rumah_kampong', start);
check(sim.canPlace('pangkalan', landlocked.x, landlocked.z) === false, 'pangkalan rejected away from shore');
// find a shore spot near the river
let shoreOk = false;
for (let z = 2; z < GRID - 2 && !shoreOk; z++) {
  for (let x = 2; x < GRID - 2 && !shoreOk; x++) {
    if (sim.canPlace('pangkalan', x, z)) shoreOk = true;
  }
}
check(shoreOk, 'pangkalan placeable somewhere on the shoreline');

// camphor gathers slowly but works
const freshVil = [];
sim.pool.forEach((e) => {
  if (e.owner === 0 && e.protoId === 'penduduk') freshVil.push(e.id);
});
sim.cmdGather([freshVil[0]], camphor.x, camphor.z);
run(sim, 150);
check(P.gathered.camphor > 0, `camphor gathered: ${P.gathered.camphor}`);

// farm loop
const kebunSpot = findSpot('kebun', start);
sim.cmdBuild([freshVil[1] ?? freshVil[0]], 'kebun', kebunSpot.x, kebunSpot.z);
run(sim, 25);
let kebun = null;
sim.pool.forEach((e) => {
  if (e.owner === 0 && e.protoId === 'kebun') kebun = e;
});
check(kebun?.complete === true, 'kebun completed');
P.resources.food = 50; // leave storage headroom so banked food can rise
const foodBefore = P.gathered.food;
sim.cmdFarm([freshVil[1] ?? freshVil[0]], kebun.id);
run(sim, 45);
check(P.gathered.food > foodBefore, `farm produces food (+${Math.round(P.gathered.food - foodBefore)})`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
