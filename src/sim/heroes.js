import { TICK_RATE } from './constants.js';
import { UNIT_PROTOS } from './entities.js';
import { addStatus, hasStatus } from './statuses.js';
import { applyDamage } from './combat.js';

export const HERO_RESPAWN_TICKS = 90 * TICK_RATE;

// Hero summoning (Panggung Panji) + the six faction ultimates.
// Stuns, shields, conversion immunity and temp transforms all go through
// the generic StatusEffect system — nothing here is hard-coded per entity.

export function heroOf(sim, owner) {
  let hero = null;
  sim.pool.forEach((e) => {
    if (e.kind === 'unit' && e.owner === owner && e.proto.hero) hero = e;
  });
  return hero;
}

export function cmdSummonHero(sim, buildingId, issuer) {
  const b = sim.pool.get(buildingId);
  const player = sim.players[issuer];
  if (!b || b.owner !== issuer || b.protoId !== 'panggung_panji' || !b.complete) return false;
  if (player.era < 3) return false;
  if (player.heroAlive || player.heroRespawn > 0) return false;
  if (b.queue.length > 0) return false;
  const protoId = player.faction.hero;
  const proto = UNIT_PROTOS[protoId];
  const cost = sim.costOf(issuer, proto);
  if (!sim.canAfford(issuer, cost)) return false;
  sim.deduct(issuer, cost);
  b.queue.push({ protoId, ticksLeft: proto.trainTicks, total: proto.trainTicks });
  player.heroAlive = true; // reserved from this moment (one alive at a time)
  return true;
}

export function heroSystem(sim) {
  // respawn timers tick down at the shrine
  for (const player of sim.players) {
    if (player.heroRespawn > 0) player.heroRespawn--;
    if (player.ultCooldown > 0) player.ultCooldown--;
  }

  // Hassan "aura of order": +2 armor near the hero or any Istana.
  // Re-stamped as short-lived armorBonus statuses on a coarse tick.
  if (sim.tick % 10 !== 0) return;
  for (const player of sim.players) {
    const aura = player.mods.auraArmor;
    if (!aura) continue;
    const radius = player.mods.auraRadius ?? 7;
    const sources = [];
    sim.pool.forEach((e) => {
      if (e.owner !== player.index) return;
      if (e.kind === 'building' && e.protoId === 'istana' && e.complete) sources.push(e);
      if (e.kind === 'unit' && e.proto.hero) sources.push(e);
    });
    for (const src of sources) {
      sim.hash.near(src.x, src.z, radius, (u) => {
        if (u.owner !== player.index) return;
        if (hasStatus(u, 'armorBonus')) return; // no stacking
        addStatus(u, 'armorBonus', 12, aura);
      });
    }
  }
}

// Called by sim.killEntity when a hero dies.
export function onHeroDeath(sim, e) {
  const player = sim.players[e.owner];
  player.heroAlive = false;
  player.heroRespawn = HERO_RESPAWN_TICKS;
  sim.emit('hero-died', { owner: e.owner, x: e.x, z: e.z });
}

export function cmdUltimate(sim, issuer) {
  const player = sim.players[issuer];
  const hero = heroOf(sim, issuer);
  if (!hero || player.ultCooldown > 0) return false;
  if (hasStatus(hero, 'stun')) return false;
  const ult = player.faction.ult;
  ULTIMATES[ult.id]?.(sim, player, hero);
  player.ultCooldown = Math.round(ult.cooldown * TICK_RATE);
  sim.emit('ultimate', { ultId: ult.id, owner: issuer, x: hero.x, z: hero.z });
  return true;
}

const ULTIMATES = {
  // Semaun: ground slam — AoE damage + knockback + 3s stun around the hero.
  kekuatan_gergasi(sim, player, hero) {
    const RADIUS = 4;
    const victims = [];
    sim.hash.near(hero.x, hero.z, RADIUS, (u) => {
      if (u.owner !== player.index && u.owner >= 0) victims.push(u);
    });
    for (const v of victims) {
      // knockback away from the hero, clamped to passable ground
      const dx = v.x - hero.x;
      const dz = v.z - hero.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = v.x + (dx / d) * 2;
      const nz = v.z + (dz / d) * 2;
      if (sim.grid.passable(nx | 0, nz | 0, v.proto.domain)) {
        v.x = nx;
        v.z = nz;
      }
      v.path = null;
      v.pathI = 0;
      addStatus(v, 'stun', 3 * TICK_RATE);
      applyDamage(sim, hero, v, 40, hero.proto);
    }
  },

  // Sakam: summon 100 spectral warriors — weak, 30s lifespan, uncontrollable.
  serbuan_berani_mati(sim, player, hero) {
    let spawned = 0;
    for (let ring = 1; ring <= 6 && spawned < 100; ring++) {
      const slots = ring * 10;
      for (let i = 0; i < slots && spawned < 100; i++) {
        const a = (i / slots) * Math.PI * 2 + ring;
        const x = hero.x + Math.cos(a) * ring * 0.9;
        const z = hero.z + Math.sin(a) * ring * 0.9;
        if (!sim.grid.passable(x | 0, z | 0, 'land')) continue;
        const s = sim.spawnUnit('spectral_warrior', player.index, x, z);
        s.stance = 'aggressive';
        spawned++;
      }
    }
  },

  // Hassan: 15s — shields + attack speed + conversion immunity in a big radius.
  perintah_adil(sim, player, hero) {
    const RADIUS = 9;
    const DUR = 15 * TICK_RATE;
    sim.hash.near(hero.x, hero.z, RADIUS, (u) => {
      if (u.owner !== player.index) return;
      addStatus(u, 'shield', DUR, 30);
      addStatus(u, 'atkSpeedMult', DUR, 0.8);
      addStatus(u, 'conversionImmune', DUR, 1);
      sim.emit('shielded', { id: u.id });
    });
  },

  // Shahbandar: permanently convert up to 5 enemy non-hero units in radius.
  lidah_pujangga(sim, player, hero) {
    const RADIUS = 6;
    const candidates = [];
    sim.hash.near(hero.x, hero.z, RADIUS, (u) => {
      if (u.owner === player.index || u.owner < 0) return;
      if (u.proto.hero || u.proto.uncontrollable) return;
      if (hasStatus(u, 'conversionImmune')) return;
      candidates.push(u);
    });
    candidates.sort(
      (a, b) =>
        (a.x - hero.x) ** 2 + (a.z - hero.z) ** 2 -
        ((b.x - hero.x) ** 2 + (b.z - hero.z) ** 2)
    );
    for (const u of candidates.slice(0, 5)) {
      const oldPlayer = sim.players[u.owner];
      if (oldPlayer) oldPlayer.pop -= u.proto.pop;
      u.owner = player.index;
      player.pop += u.proto.pop; // may overflow the cap, AoE-style
      u.order = null;
      u.targetId = -1;
      u.path = null;
      u.state = 'idle';
      sim.emit('converted', { id: u.id, x: u.x, z: u.z });
    }
  },

  // Saman: 20s — nearby villagers become ember militia, then revert.
  bara_perjuangan(sim, player, hero) {
    const RADIUS = 9;
    const DUR = 20 * TICK_RATE;
    const militia = UNIT_PROTOS.militia_ember;
    sim.hash.near(hero.x, hero.z, RADIUS, (u) => {
      if (u.owner !== player.index || !u.proto.tags.includes('villager')) return;
      if (hasStatus(u, 'transform')) return;
      const saved = {
        proto: u.proto,
        protoId: u.protoId,
        maxHp: u.maxHp,
        atk: u.atk,
        range: u.range,
        atkTicks: u.atkTicks,
        windupTicks: u.windupTicks,
        speedPerTick: u.speedPerTick,
        gatherTile: u.order?.type === 'gather' ? u.gatherTile : -1,
        farmId: u.order?.type === 'farm' ? u.order.farmId : -1,
      };
      const frac = Math.max(0.1, u.hp / u.maxHp);
      u.proto = militia;
      u.protoId = 'militia_ember';
      u.maxHp = militia.hp;
      u.hp = Math.round(militia.hp * frac);
      u.atk = militia.atk;
      u.range = militia.range;
      u.atkTicks = militia.atkTicks;
      u.windupTicks = militia.windupTicks;
      u.speedPerTick = militia.speedPerTick * player.mods.speedMult;
      u.order = null;
      u.path = null;
      u.targetId = -1;
      u.state = 'idle';
      u.stance = 'aggressive';
      addStatus(u, 'transform', DUR, saved);
      sim.emit('transformed', { id: u.id });
    });
  },

  // Badar: reveal the whole map 10s; mark all enemies (+25% damage taken, 15s).
  mata_strategi(sim, player) {
    player.revealAll = 10 * TICK_RATE;
    sim.pool.forEach((u) => {
      if (u.kind !== 'unit' || u.owner === player.index || u.owner < 0) return;
      addStatus(u, 'dmgTakenMult', 15 * TICK_RATE, 1.25);
      addStatus(u, 'marked', 15 * TICK_RATE, 1);
      sim.emit('marked', { id: u.id });
    });
  },
};
