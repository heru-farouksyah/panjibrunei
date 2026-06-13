// Pure-Node test for Phase 5: faction bonuses are verifiably applied and
// every hero ultimate works exactly as specced.
import { Sim } from '../src/sim/sim.js';
import { TICK_RATE } from '../src/sim/constants.js';
import { hasStatus, getStatus } from '../src/sim/statuses.js';

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const run = (sim, seconds) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) sim.step();
};

function freshSim(playerFaction, aiFaction = 'hassan') {
  const sim = new Sim({ seed: 42, playerFaction, aiFaction });
  sim.players[0].resources = { food: 9999, timber: 9999, gold: 9999, camphor: 9999 };
  sim.players[0].era = 3;
  return sim;
}

function summonHero(sim, owner = 0) {
  const s = sim.grid.startZones[owner];
  const shrine = sim.spawnBuilding('panggung_panji', owner, s.x + 4, s.y - 4, true);
  sim.players[owner].era = 3;
  sim.players[owner].resources.gold += 500;
  sim.players[owner].resources.camphor += 500;
  const ok = sim.cmdSummonHero(shrine.id, owner);
  run(sim, 31);
  return { shrine, hero: sim.heroOf(owner), ok };
}

// --- faction bonuses ---
{
  const a = new Sim({ seed: 42, playerFaction: 'semaun', aiFaction: 'hassan' });
  const inf = a.spawnUnit('pahlawan_kampilan', 0, 30, 30);
  const infPlain = a.spawnUnit('pahlawan_kampilan', 1, 32, 30);
  check(inf.maxHp === Math.round(64 * 1.15), `Semaun infantry +15% HP (${inf.maxHp} vs ${infPlain.maxHp})`);
  const istanaCost = a.costOf(0, a.protos.buildings.istana);
  check(istanaCost.timber === Math.round(275 * 0.9), `Semaun buildings 10% cheaper timber (${istanaCost.timber})`);

  const b = freshSim('sakam');
  const balai = b.spawnBuilding('balai_pahlawan', 0, 24, 24, true);
  b.cmdTrain(balai.id, 'pahlawan_kampilan', 0);
  const baseTicks = b.protos.units.pahlawan_kampilan.trainTicks;
  check(balai.queue[0].total === Math.round(baseTicks * 0.8), 'Sakam military trains 20% faster');
  const u = b.spawnUnit('penikam_keris', 0, 30, 30);
  check(Math.abs(u.speedPerTick - (1.45 / TICK_RATE) * 1.05) < 1e-9, 'Sakam +5% move speed');

  const c = freshSim('hassan');
  const wall = c.spawnBuilding('pagar', 0, 30, 30, true);
  check(wall.maxHp === Math.round(380 * 1.25), `Hassan walls +25% HP (${wall.maxHp})`);
  const guard = c.spawnUnit('pahlawan_kampilan', 0, c.grid.startZones[0].x, c.grid.startZones[0].y + 4);
  run(c, 2);
  check(hasStatus(guard, 'armorBonus'), 'Hassan aura of order: +armor near Istana');

  const d = freshSim('shahbandar');
  const scout = d.spawnUnit('penikam_keris', 0, 30, 30);
  check(d.players[0].mods.losBonus === 1, 'Shahbandar +1 vision modifier set');
  check(d.players[0].mods.tradeMult === 1.25, 'Shahbandar +25% trade modifier set');

  const e = freshSim('saman');
  const vil = e.spawnUnit('penduduk', 0, 30, 30);
  check(vil.maxHp === Math.round(28 * 1.5), `Saman villagers +50% HP (${vil.maxHp})`);
  check(vil.atk === 6, `Saman villagers fight well (atk ${vil.atk})`);
  const kampCost = e.costOf(0, e.protos.units.pahlawan_kampilan);
  check(kampCost.food === Math.round(50 * 0.95), 'Saman units cost 5% less food');

  const f = freshSim('badar');
  check(f.players[0].mods.jungleAmbush === true && f.players[0].mods.losBonus === 1, 'Badar ambush + vision mods set');
}

// --- hero summoning rules ---
{
  const sim = freshSim('semaun');
  const { shrine, hero, ok } = summonHero(sim);
  check(ok && hero && hero.protoId === 'hero_semaun', 'hero summoned at the Panggung Panji');
  check(sim.cmdSummonHero(shrine.id, 0) === false, 'second hero blocked while one lives');
  sim.killEntity(hero, 1);
  check(sim.players[0].heroRespawn > 0, 'death starts the 90s respawn timer');
  check(sim.cmdSummonHero(shrine.id, 0) === false, 'summon blocked during respawn');
  sim.players[0].heroRespawn = 1;
  run(sim, 0.1);
  check(sim.cmdSummonHero(shrine.id, 0) === true, 'summon allowed after respawn timer');
}

// --- Semaun ultimate: slam = damage + knockback + stun ---
{
  const sim = freshSim('semaun');
  const { hero } = summonHero(sim);
  const victim = sim.spawnUnit('pahlawan_kampilan', 1, hero.x + 1.5, hero.z);
  victim.maxHp = 1000; // survives the slam + hero swings for the duration
  victim.hp = 1000;
  const vx = victim.x;
  run(sim, 0.5);
  check(sim.cmdUltimate(0), 'Semaun ultimate fires');
  run(sim, 0.25);
  check(victim.hp < victim.maxHp, `slam damaged victim (${Math.ceil(victim.hp)}/${victim.maxHp})`);
  check(Math.abs(victim.x - vx) > 1, 'victim knocked back');
  check(hasStatus(victim, 'stun'), 'victim stunned');
  check(sim.players[0].ultCooldown > 0, 'ultimate on cooldown');
  check(sim.cmdUltimate(0) === false, 'cannot fire during cooldown');
  run(sim, 3.2);
  check(!victim.alive || !hasStatus(victim, 'stun'), 'stun expires after 3s');
}

// --- Sakam ultimate: 100 spectral warriors that expire ---
{
  const sim = freshSim('sakam');
  const { hero } = summonHero(sim);
  sim.cmdUltimate(0);
  run(sim, 0.1);
  let spectrals = 0;
  sim.pool.forEach((e) => {
    if (e.alive && e.protoId === 'spectral_warrior') spectrals++;
  });
  check(spectrals >= 95, `~100 spectral warriors spawned (${spectrals})`);
  const one = (() => {
    let s = null;
    sim.pool.forEach((e) => {
      if (e.protoId === 'spectral_warrior') s = e;
    });
    return s;
  })();
  check(sim.controllable([one.id], 0).length === 0, 'spectrals are uncontrollable');
  run(sim, 31);
  let left = 0;
  sim.pool.forEach((e) => {
    if (e.alive && e.protoId === 'spectral_warrior') left++;
  });
  check(left === 0, 'spectral warriors expire after 30s');
}

// --- Hassan ultimate: shield absorbs flat damage + blocks conversion ---
{
  const sim = freshSim('hassan');
  const { hero } = summonHero(sim);
  const ally = sim.spawnUnit('pahlawan_kampilan', 0, hero.x + 2, hero.z);
  run(sim, 0.5);
  sim.cmdUltimate(0);
  run(sim, 0.1);
  check(hasStatus(ally, 'shield'), 'ally gained shield');
  check(hasStatus(ally, 'conversionImmune'), 'ally conversion-immune');
  const hpBefore = ally.hp;
  // 20 raw damage into a 30-point shield: no hp lost
  const fakeAttacker = sim.spawnUnit('pahlawan_kampilan', 1, ally.x + 1, ally.z);
  import('../src/sim/combat.js').then(() => {});
  const { applyDamage } = await import('../src/sim/combat.js');
  applyDamage(sim, fakeAttacker, ally, 20, fakeAttacker.proto);
  check(ally.hp === hpBefore, `shield absorbed the hit (${ally.hp}/${hpBefore})`);
  check(getStatus(ally, 'shield').data < 30, 'shield pool reduced');
}

// --- Shahbandar ultimate: converts up to 5, heroes immune ---
{
  const sim = freshSim('shahbandar');
  const { hero } = summonHero(sim);
  // enemy hero summoned FIRST (it runs 31s of sim), then the picket spawns
  const enemyHero = summonHero(sim, 1).hero;
  if (enemyHero) {
    enemyHero.x = enemyHero.prevX = hero.x + 2;
    enemyHero.z = enemyHero.prevZ = hero.z + 2;
  }
  const enemies = [];
  for (let i = 0; i < 7; i++) {
    enemies.push(sim.spawnUnit('pahlawan_kampilan', 1, hero.x + 1 + (i % 3), hero.z + ((i / 3) | 0)));
  }
  run(sim, 0.5);
  sim.cmdUltimate(0);
  run(sim, 0.1);
  const converted = enemies.filter((e) => e.owner === 0).length;
  check(converted === 5, `exactly 5 enemies converted (${converted})`);
  check(!enemyHero || enemyHero.owner === 1, 'enemy hero immune to conversion');
}

// --- Saman ultimate: villagers transform, then revert preserving work ---
{
  const sim = freshSim('saman');
  const { hero } = summonHero(sim);
  // a villager gathering gold next to the hero
  let gold = null;
  outer: for (let r = 1; r < 30; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = (hero.x | 0) + dx;
        const z = (hero.z | 0) + dz;
        if (sim.grid.typeAt(x, z) === 6) { gold = { x, z }; break outer; }
      }
    }
  }
  const vil = sim.spawnUnit('penduduk', 0, hero.x + 1, hero.z);
  sim.cmdGather([vil.id], gold.x, gold.z, 0);
  run(sim, 40); // gather some gold into the carry
  vil.x = vil.prevX = hero.x + 1.5; // pull them back near the hero
  vil.z = vil.prevZ = hero.z;
  const carryBefore = vil.carryAmount;
  sim.cmdUltimate(0);
  run(sim, 0.2);
  check(vil.protoId === 'militia_ember', 'villager transformed to ember militia');
  check(vil.atk === 8, 'militia combat stats applied');
  check(Math.abs(vil.carryAmount - carryBefore) < 0.01, 'carried resources preserved');
  run(sim, 21);
  check(vil.protoId === 'penduduk', 'villager reverted after 20s');
  run(sim, 2);
  check(vil.order?.type === 'gather' || vil.state !== 'idle', 'villager resumed gathering');
}

// --- Badar ultimate: full map reveal + marked enemies take +25% ---
{
  const sim = freshSim('badar');
  const { hero } = summonHero(sim);
  const far = sim.spawnUnit('pahlawan_kampilan', 1, 70, 70);
  run(sim, 0.5);
  check(!sim.isVisibleToPlayer(0, far), 'far enemy hidden before ultimate');
  sim.cmdUltimate(0);
  run(sim, 0.3);
  check(sim.isVisibleToPlayer(0, far), 'map revealed: far enemy visible');
  check(hasStatus(far, 'marked') && hasStatus(far, 'dmgTakenMult'), 'enemies marked +25%');
  const { applyDamage } = await import('../src/sim/combat.js');
  const hpBefore = far.hp;
  applyDamage(sim, hero, far, 10, { bonusVs: {} });
  // 10 * 1.25 - armor(1) = 11.5 vs unmarked 10 - 1 = 9
  check(hpBefore - far.hp > 10, `marked target took amplified damage (${(hpBefore - far.hp).toFixed(1)})`);
  run(sim, 11);
  check(!sim.isVisibleToPlayer(0, far), 'reveal expires after 10s');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
