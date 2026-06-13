import { GRID, TICK_RATE, TileType } from './constants.js';
import { generateWorld } from './worldgen.js';
import { mulberry32 } from './rng.js';
import { EntityPool, UNIT_PROTOS, BUILDING_PROTOS } from './entities.js';
import { Pathfinder } from './pathfinding.js';
import { SpatialHash, movementSystem, formationOffset } from './movement.js';
import { economySystem, economyArrive, RES_OF_TILE } from './economy.js';
import { combatSystem } from './combat.js';
import { FogSystem } from './fog.js';
import { statusSystem } from './statuses.js';
import { heroSystem, cmdSummonHero, cmdUltimate, onHeroDeath, heroOf } from './heroes.js';
import { AIController, aiSystem } from './ai.js';
import factionsData from '../data/factions.json' with { type: 'json' };
import erasData from '../data/eras.json' with { type: 'json' };

export const ERAS = erasData.eras;
const POP_HARD_CAP = 130;
export const MONUMENT_TICKS = 5 * 60 * TICK_RATE; // defend the wonder 5 minutes

const DEFAULT_MODS = {
  infHpMult: 1, buildTimberMult: 1, trainTimeMult: 1, speedMult: 1,
  wallHpMult: 1, auraArmor: 0, auraRadius: 0, tradeMult: 1, losBonus: 0,
  vilHpMult: 1, vilAtkMult: 1, foodCostMult: 1, jungleAmbush: false,
  meleeAtk: 0, rangedAtk: 0, unitArmor: 0, gatherMult: 1,
};

function makePlayer(index, factionId) {
  const faction = factionsData[factionId];
  return {
    index,
    factionId,
    faction,
    resources: { food: 560, timber: 510, gold: 330, camphor: 80 },
    gathered: { food: 0, timber: 0, gold: 0, camphor: 0 },
    pop: 0,
    popCap: 0,
    era: 1,
    eraResearch: null, // {ticksLeft, total}
    techs: new Set(),
    mods: { ...DEFAULT_MODS, ...(faction?.mods ?? {}) },
    heroAlive: false,
    heroRespawn: 0,    // ticks until the shrine may summon again
    ultCooldown: 0,
    monumentSince: -1, // tick when a completed Mahkota Monument appeared
    unitsLost: 0,
    unitsKilled: 0,
    defeated: false,
    revealAll: 0,      // ticks of full map vision (Badar ultimate)
  };
}

// The simulation. Owns ALL game state; fixed 20 Hz step; no Three.js, ever.
// The render layer reads entity state directly and drains `events` for
// one-shot happenings (deaths, attacks, VFX, sounds).
export class Sim {
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = opts.seed ?? 1337;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.tick = 0;
    this.grid = generateWorld(this.seed);
    this.pool = new EntityPool();
    this.entities = this.pool.list; // legacy alias for the debug overlay
    this.pathfinder = new Pathfinder(this.grid);
    this.hash = new SpatialHash();
    this.fog = new FogSystem();
    this.events = [];
    this.protos = { units: UNIT_PROTOS, buildings: BUILDING_PROTOS };
    this.winner = -1;

    this.players = [
      makePlayer(0, opts.playerFaction ?? 'semaun'),
      makePlayer(1, opts.aiFaction ?? 'badar'),
    ];

    if (opts.testUnits) this.spawnTestArmies();
    else this.spawnStartingBases();
    this.fog.update(this);

    // The AI plays player 1 when a difficulty is set (matches); pure sim
    // tests construct without one and stay AI-free.
    this.ai = opts.difficulty ? new AIController(this, 1, opts.difficulty) : null;
    this.victoryEnabled = !opts.testUnits;
    this.statsHistory = []; // [{tick, scores: [p0, p1]}] sampled every 5s
  }

  militaryScore(owner) {
    let score = 0;
    this.pool.forEach((e) => {
      if (e.kind !== 'unit' || e.owner !== owner) return;
      if (!e.proto.tags.includes('military') && !e.proto.hero) return;
      for (const v of Object.values(e.proto.cost)) score += v;
    });
    return score;
  }

  isVisibleToPlayer(viewer, e) {
    return this.fog.entityVisible(viewer, e);
  }

  spawnStartingBases() {
    for (let owner = 0; owner < 2; owner++) {
      const s = this.grid.startZones[owner];
      this.spawnBuilding('istana', owner, s.x - 1, s.y - 1, true);
      for (let i = 0; i < 3; i++) {
        this.spawnUnit('penduduk', owner, s.x - 0.6 + i * 0.9, s.y + 2.6);
      }
    }
    // The enemy kingdom is guarded by a champion BOSS from the start (its
    // faction hero, hardened). Slaying it razes their capital and wins the
    // match — no need to grind to the Empire era. Player has no boss; they
    // lose the normal way (their Istana destroyed).
    this.spawnBoss(1);
  }

  spawnBoss(owner) {
    const player = this.players[owner];
    const s = this.grid.startZones[owner];
    const boss = this.spawnUnit(player.faction.hero, owner, s.x + 1.5, s.y + 1.5);
    boss.isBoss = true;
    boss.maxHp = Math.round(boss.maxHp * 1.7);
    boss.hp = boss.maxHp;
    boss.stance = 'hold'; // defends the capital; the player must come to it
    boss.guardX = boss.x;
    boss.guardZ = boss.z;
    player.heroAlive = true; // occupy the hero slot so the AI won't summon a 2nd
    this.boss = this.boss || {};
    this.boss[owner] = boss.id;
    return boss;
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  spawnTestArmies() {
    const mix = [
      'pahlawan_kampilan', 'pahlawan_kampilan', 'pahlawan_kampilan', 'pahlawan_kampilan',
      'pahlawan_kampilan', 'pahlawan_kampilan', 'pahlawan_kampilan', 'pahlawan_kampilan',
      'pemanah', 'pemanah', 'pemanah', 'pemanah',
      'penikam_keris', 'penikam_keris', 'penikam_keris', 'penikam_keris',
      'penduduk', 'penduduk', 'penduduk', 'penduduk',
    ];
    for (let owner = 0; owner < 2; owner++) {
      const s = this.grid.startZones[owner];
      for (let i = 0; i < mix.length; i++) {
        const ox = (i % 5) * 0.9 - 1.8;
        const oz = ((i / 5) | 0) * 0.9 - 1.3;
        this.spawnUnit(mix[i], owner, s.x + 0.5 + ox, s.y + 0.5 + oz);
      }
    }
  }

  spawnUnit(protoId, owner, x, z) {
    const p = UNIT_PROTOS[protoId];
    if (!p) throw new Error(`unknown unit proto ${protoId}`);
    const player = this.players[owner];
    const mods = player?.mods ?? DEFAULT_MODS;
    const e = this.pool.spawn();
    e.kind = 'unit';
    e.proto = p;
    e.protoId = protoId;
    e.owner = owner;
    e.x = e.prevX = x;
    e.z = e.prevZ = z;
    e.facing = this.rng() * Math.PI * 2;
    // collision/personal-space radius, sized to match the 1.3x visual models
    // so units keep apart instead of overlapping
    e.radius = p.domain === 'water' ? 0.55 : p.hero ? 0.5 : 0.4;

    let hp = p.hp;
    if (p.tags.includes('infantry')) hp *= mods.infHpMult;
    if (p.tags.includes('villager')) hp *= mods.vilHpMult;
    e.maxHp = Math.round(hp);
    e.hp = e.maxHp;
    // armor/attack store BASE values; blacksmith tech bonuses come from
    // player.mods at damage-calc time so they apply retroactively
    e.armor = p.armor;
    e.atk = p.tags.includes('villager') ? Math.round(p.atk * mods.vilAtkMult) : p.atk;
    e.range = p.range;
    e.atkTicks = p.atkTicks;
    e.windupTicks = p.windupTicks;
    e.speedPerTick = p.speedPerTick * mods.speedMult;
    e.lifespan = p.lifespanTicks;
    e.animSeed = e.id;
    e.statuses = [];
    e.state = 'idle';
    if (player) player.pop += p.pop;
    this.emit('spawn', { id: e.id });
    return e;
  }

  // --- Buildings, costs, population ---

  // Effective cost after faction modifiers.
  costOf(owner, proto) {
    const mods = this.players[owner].mods;
    const out = {};
    for (const [res, amt] of Object.entries(proto.cost)) {
      let v = amt;
      if (proto.kind === 'building' && res === 'timber') v *= mods.buildTimberMult;
      if (proto.kind === 'unit' && res === 'food') v *= mods.foodCostMult;
      out[res] = Math.round(v);
    }
    return out;
  }

  canAfford(owner, cost) {
    const r = this.players[owner].resources;
    return Object.entries(cost).every(([res, amt]) => (r[res] ?? 0) >= amt);
  }

  deduct(owner, cost) {
    const r = this.players[owner].resources;
    for (const [res, amt] of Object.entries(cost)) r[res] -= amt;
  }

  refund(owner, cost) {
    const r = this.players[owner].resources;
    for (const [res, amt] of Object.entries(cost)) r[res] += amt;
  }

  canPlace(protoId, tx, tz) {
    const p = BUILDING_PROTOS[protoId];
    if (!p) return false;
    const grid = this.grid;
    let touchesWater = false;
    for (let dz = 0; dz < p.size; dz++) {
      for (let dx = 0; dx < p.size; dx++) {
        const x = tx + dx;
        const z = tz + dz;
        if (x < 1 || z < 1 || x >= GRID - 1 || z >= GRID - 1) return false;
        if (grid.occupied[grid.idx(x, z)]) return false;
        const t = grid.typeAt(x, z);
        if (t !== TileType.GRASS && t !== TileType.EARTH && t !== TileType.SAND) return false;
      }
    }
    if (p.shore) {
      for (let dz = -1; dz <= p.size; dz++) {
        for (let dx = -1; dx <= p.size; dx++) {
          const t = grid.typeAt(tx + dx, tz + dz);
          if (t === TileType.WATER || t === TileType.FORD) touchesWater = true;
        }
      }
      if (!touchesWater) return false;
    }
    return true;
  }

  spawnBuilding(protoId, owner, tx, tz, complete = false) {
    const p = BUILDING_PROTOS[protoId];
    const mods = this.players[owner]?.mods;
    const e = this.pool.spawn();
    e.kind = 'building';
    e.proto = p;
    e.protoId = protoId;
    e.owner = owner;
    e.size = p.size;
    e.tileX = tx;
    e.tileZ = tz;
    e.x = e.prevX = tx + p.size / 2;
    e.z = e.prevZ = tz + p.size / 2;
    e.radius = p.size * 0.55;
    let hp = p.hp;
    if (mods && (p.tags.includes('wall') || p.tags.includes('tower'))) hp *= mods.wallHpMult;
    e.maxHp = Math.round(hp);
    e.complete = complete;
    e.hp = complete ? e.maxHp : Math.max(1, Math.round(e.maxHp * 0.08));
    e.buildProgress = complete ? p.buildTicks : 0;
    e.queue = [];
    e.builders = 0;
    e.statuses = [];
    if (p.attack) {
      e.atk = p.attack.atk;
      e.range = p.attack.range;
      e.atkTicks = Math.round(p.attack.atkSpeed * TICK_RATE);
    }
    const grid = this.grid;
    for (let dz = 0; dz < p.size; dz++) {
      for (let dx = 0; dx < p.size; dx++) {
        grid.occupied[grid.idx(tx + dx, tz + dz)] = e.id + 1;
      }
    }
    this.pathfinder.cache.clear(); // occupancy changed
    // shove any unit standing in the footprint to the nearest free tile,
    // and repath units whose in-flight path crosses the new foundation
    this.pool.forEach((u) => {
      if (u.kind !== 'unit') return;
      const ux = u.x | 0;
      const uz = u.z | 0;
      if (ux >= tx && ux < tx + p.size && uz >= tz && uz < tz + p.size) {
        const ni = this.pathfinder.nearestPassable(ux, uz, u.proto.domain, 5);
        if (ni >= 0) {
          u.x = u.prevX = (ni % GRID) + 0.5;
          u.z = u.prevZ = ((ni / GRID) | 0) + 0.5;
          u.path = null;
          u.pathI = 0;
        }
      } else if (u.path) {
        for (let i = u.pathI; i < u.path.length; i++) {
          const wx = u.path[i].x | 0;
          const wz = u.path[i].z | 0;
          if (wx >= tx && wx < tx + p.size && wz >= tz && wz < tz + p.size) {
            const dest = u.path[u.path.length - 1];
            this.requestPathTo(u, dest.x, dest.z);
            break;
          }
        }
      }
    });
    if (complete) this.recomputePopCap(owner);
    this.emit('spawn', { id: e.id });
    return e;
  }

  // A house/HQ shelters residents (= its pop value). The pop capacity it
  // provides scales with its HP fraction, so residents "drain" as the
  // building is damaged and are fully lost when it's destroyed.
  recomputePopCap(owner) {
    let cap = 0;
    this.pool.forEach((e) => {
      if (e.kind === 'building' && e.owner === owner && e.complete && e.proto.pop) {
        cap += e.proto.pop * Math.max(0, e.hp / e.maxHp);
      }
    });
    this.players[owner].popCap = Math.min(Math.floor(cap), POP_HARD_CAP);
  }

  // Residents currently sheltered by a building (for the HUD).
  residentsOf(e) {
    if (!e.proto.pop) return null;
    return { now: Math.floor(e.proto.pop * Math.max(0, e.hp / e.maxHp)), max: e.proto.pop };
  }

  releaseBuilders(b) {
    this.pool.forEach((e) => {
      if (e.kind === 'unit' && e.order?.type === 'build' && e.order.targetId === b.id) {
        e.order = null;
        e.state = 'idle';
      }
    });
  }

  // Queue an individual path request (economy trips, AI moves).
  requestPathTo(e, tx, tz) {
    const stamp = (e.pathStamp = (e.pathStamp ?? 0) + 1);
    e.path = null;
    e.pathI = 0;
    this.pathfinder.request({
      resolve: (sim, pf) => {
        if (!e.alive || e.pathStamp !== stamp) return;
        e.path = pf.findPath(e.x | 0, e.z | 0, tx | 0, tz | 0, e.proto.domain);
        e.pathI = 0;
        if (!e.path) sim.onPathDone(e);
      },
    });
  }

  deliverUnit(building, protoId) {
    const proto = UNIT_PROTOS[protoId];
    const domain = proto.domain;
    const grid = this.grid;
    // spiral outward from the footprint for a free spawn tile
    for (let r = 1; r <= 6; r++) {
      for (let dz = -r; dz < building.size + r; dz++) {
        for (let dx = -r; dx < building.size + r; dx++) {
          if (dx > -r && dx < building.size + r - 1 && dz > -r && dz < building.size + r - 1) continue;
          const x = building.tileX + dx;
          const z = building.tileZ + dz;
          if (!grid.passable(x, z, domain)) continue;
          const u = this.spawnUnit(protoId, building.owner, x + 0.5, z + 0.5);
          this.emit('train-done', { id: u.id, protoId, owner: building.owner, x: u.x, z: u.z });
          if (building.rallyX >= 0) this.cmdMove([u.id], building.rallyX, building.rallyZ, building.owner);
          return u;
        }
      }
    }
    return null; // fully blocked — unit is lost (refund instead)
  }

  finishResearch(building, tq) {
    const player = this.players[building.owner];
    if (tq.kind === 'era') {
      player.era++;
      this.emit('era-up', { owner: building.owner, era: player.era });
    } else if (tq.kind === 'tech') {
      const eff = tq.tech.effect;
      if (eff.meleeAtk) player.mods.meleeAtk += eff.meleeAtk;
      if (eff.rangedAtk) player.mods.rangedAtk += eff.rangedAtk;
      if (eff.unitArmor) player.mods.unitArmor += eff.unitArmor;
      if (eff.gatherMult) player.mods.gatherMult += eff.gatherMult;
      player.techs.add(tq.tech.id);
      this.emit('tech-done', { owner: building.owner, techId: tq.tech.id });
    }
  }

  // --- Commands (issued by input/UI for player 0, by the AI for player 1) ---

  controllable(ids, issuer) {
    const out = [];
    for (const id of ids) {
      const e = this.pool.get(id);
      if (e && e.kind === 'unit' && e.owner === issuer && !e.proto.uncontrollable) out.push(e);
    }
    return out;
  }

  cmdMove(ids, x, z, issuer = 0, orderType = 'move') {
    const movers = this.controllable(ids, issuer);
    if (movers.length === 0) return;
    this.emit('order', { x, z, orderType, issuer });
    for (const domain of ['land', 'water']) {
      const group = movers.filter((e) => e.proto.domain === domain);
      if (group.length === 0) continue;
      this.routeGroup(group, x, z, domain, orderType);
    }
  }

  cmdAttackMove(ids, x, z, issuer = 0) {
    this.cmdMove(ids, x, z, issuer, 'attackmove');
  }

  cmdStop(ids, issuer = 0) {
    for (const e of this.controllable(ids, issuer)) {
      e.path = null;
      e.pathI = 0;
      e.order = null;
      e.resumeOrder = null;
      e.targetId = -1;
      e.state = 'idle';
    }
  }

  cmdStance(ids, stance, issuer = 0) {
    for (const e of this.controllable(ids, issuer)) e.stance = stance;
  }

  // Context-sensitive right-click: attack enemies, gather resources under
  // the cursor, repair/finish own buildings, work farms — otherwise move.
  cmdContext(ids, x, z, targetId, issuer = 0) {
    const t = targetId >= 0 ? this.pool.get(targetId) : null;
    if (t && t.owner >= 0 && t.owner !== issuer) {
      this.cmdAttack(ids, targetId, issuer);
      return;
    }

    const units = this.controllable(ids, issuer);
    const villagers = units.filter((e) => e.proto.tags.includes('villager'));
    const fishers = units.filter((e) => e.proto.fisher || e.proto.tags.includes('fisher'));
    const rest = (used) => units.filter((e) => !used.includes(e)).map((e) => e.id);

    if (t && t.kind === 'building' && t.owner === issuer) {
      if (t.proto.farm && t.complete && villagers.length > 0) {
        this.cmdFarm(villagers.map((e) => e.id), t.id, issuer);
        const others = rest(villagers);
        if (others.length) this.cmdMove(others, x, z, issuer);
        return;
      }
      if ((!t.complete || t.hp < t.maxHp) && villagers.length > 0) {
        this.cmdRepair(villagers.map((e) => e.id), t.id, issuer);
        const others = rest(villagers);
        if (others.length) this.cmdMove(others, x, z, issuer);
        return;
      }
    }

    // own pangkalan + traders selected -> set up a trade route
    if (t && t.kind === 'building' && t.protoId === 'pangkalan' && t.owner === issuer) {
      const traders = units.filter((e) => e.proto.trade);
      if (traders.length > 0) {
        this.cmdTrade(traders.map((e) => e.id), t.id, issuer);
        const others = rest(traders);
        if (others.length) this.cmdMove(others, x, z, issuer);
        return;
      }
    }

    let tx = x | 0;
    let tz = z | 0;
    // Tall props (tree canopies) displace the ground-ray a tile or two
    // behind their trunk tile, so clicks "on a tree" land on plain ground.
    // Snap to the nearest resource node within 2 tiles of the click.
    const isNode = (xx, zz) => {
      const t = this.grid.typeAt(xx, zz);
      return RES_OF_TILE[t] !== undefined && this.grid.resources[this.grid.idx(xx, zz)] > 0;
    };
    if (villagers.length > 0 && !isNode(tx, tz)) {
      let best = null;
      let bestD = Infinity;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!isNode(tx + dx, tz + dz)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = { x: tx + dx, z: tz + dz };
          }
        }
      }
      if (best) {
        tx = best.x;
        tz = best.z;
      }
    }
    const ti = this.grid.idx(tx, tz);
    const tileT = this.grid.typeAt(tx, tz);
    if (RES_OF_TILE[tileT] !== undefined && this.grid.resources[ti] > 0 && villagers.length > 0) {
      this.cmdGather(villagers.map((e) => e.id), tx, tz, issuer);
      const others = rest(villagers);
      if (others.length) this.cmdMove(others, x, z, issuer);
      return;
    }
    // fish ripples are flat, but give boats the same 1-tile grace
    if (fishers.length > 0) {
      let fishTile = this.grid.fishTiles.has(ti) ? { x: tx, z: tz } : null;
      if (!fishTile) {
        for (let dz = -1; dz <= 1 && !fishTile; dz++) {
          for (let dx = -1; dx <= 1 && !fishTile; dx++) {
            if (this.grid.fishTiles.has(this.grid.idx(tx + dx, tz + dz))) {
              fishTile = { x: tx + dx, z: tz + dz };
            }
          }
        }
      }
      if (fishTile) {
        this.cmdGather(fishers.map((e) => e.id), fishTile.x, fishTile.z, issuer);
        const others = rest(fishers);
        if (others.length) this.cmdMove(others, x, z, issuer);
        return;
      }
    }

    this.cmdMove(ids, x, z, issuer);
  }

  cmdGather(ids, tx, tz, issuer = 0) {
    const ti = this.grid.idx(tx, tz);
    const isFish = this.grid.fishTiles.has(ti);
    const tileType = this.grid.typeAt(tx, tz);
    for (const e of this.controllable(ids, issuer)) {
      const villager = e.proto.tags.includes('villager');
      const fisher = e.proto.tags.includes('fisher');
      if (isFish ? !fisher : !villager) continue;
      e.order = { type: 'gather', tileType: isFish ? -1 : tileType };
      e.gatherTile = ti;
      const newType = isFish ? 'food' : RES_OF_TILE[tileType];
      if (e.carryType !== newType) e.carryAmount = 0; // can't mix loads
      e.carryType = newType;
      e.targetId = -1;
      e.state = 'toGather';
      this.requestPathTo(e, tx, tz);
    }
  }

  cmdFarm(ids, farmId, issuer = 0) {
    const farm = this.pool.get(farmId);
    if (!farm || !farm.proto.farm) return;
    for (const e of this.controllable(ids, issuer)) {
      if (!e.proto.tags.includes('villager')) continue;
      e.order = { type: 'farm', farmId };
      if (e.carryType !== 'food') e.carryAmount = 0;
      e.carryType = 'food';
      e.state = 'toGather';
      this.requestPathTo(e, farm.x, farm.z);
    }
  }

  cmdRepair(ids, targetId, issuer = 0) {
    const b = this.pool.get(targetId);
    if (!b || b.kind !== 'building' || b.owner !== issuer) return;
    for (const e of this.controllable(ids, issuer)) {
      if (!e.proto.tags.includes('villager')) continue;
      e.order = { type: 'build', targetId };
      e.state = 'toBuild';
      this.requestPathTo(e, b.x, b.z);
    }
  }

  cmdBuild(ids, protoId, tx, tz, issuer = 0) {
    const p = BUILDING_PROTOS[protoId];
    const player = this.players[issuer];
    if (!p || p.era > player.era) return false;
    if (!this.canPlace(protoId, tx, tz)) return false;
    const cost = this.costOf(issuer, p);
    if (!this.canAfford(issuer, cost)) return false;
    this.deduct(issuer, cost);
    const b = this.spawnBuilding(protoId, issuer, tx, tz, false);
    this.cmdRepair(ids, b.id, issuer);
    return true;
  }

  cmdTrain(buildingId, protoId, issuer = 0) {
    const b = this.pool.get(buildingId);
    const p = UNIT_PROTOS[protoId];
    const player = this.players[issuer];
    if (!b || b.owner !== issuer || !b.complete || !p) return false;
    if (!b.proto.trains.includes(protoId)) return false;
    if (p.era > player.era) return false;
    if (b.queue.length >= 5) return false;
    if (p.pop > 0 && player.pop + p.pop > player.popCap) return false;
    const cost = this.costOf(issuer, p);
    if (!this.canAfford(issuer, cost)) return false;
    this.deduct(issuer, cost);
    let ticks = p.trainTicks;
    if (p.tags.includes('military')) ticks = Math.round(ticks * player.mods.trainTimeMult);
    b.queue.push({ protoId, ticksLeft: ticks, total: ticks });
    return true;
  }

  cmdSetRally(buildingId, x, z, issuer = 0) {
    const b = this.pool.get(buildingId);
    if (!b || b.owner !== issuer || b.kind !== 'building') return;
    b.rallyX = x;
    b.rallyZ = z;
  }

  // Tear down one of your own buildings: workers dismantle it over a few
  // seconds (dust), then it's removed and ~40% of its cost is refunded.
  cmdDemolish(buildingId, issuer = 0) {
    const b = this.pool.get(buildingId);
    if (!b || b.owner !== issuer || b.kind !== 'building' || b.demolishing) return false;
    b.demolishing = true;
    // send a few idle workers over to "tear it down" (cosmetic crew)
    const crew = [];
    this.pool.forEach((u) => {
      if (crew.length >= 3) return;
      if (u.kind === 'unit' && u.owner === issuer && u.proto.tags.includes('villager') &&
          u.state === 'idle' && !u.order) {
        crew.push(u.id);
      }
    });
    for (const id of crew) {
      const u = this.pool.get(id);
      this.requestPathTo(u, b.x, b.z);
    }
    this.emit('demolish-start', { id: b.id, x: b.x, z: b.z });
    return true;
  }

  demolitionSystem() {
    this.pool.forEach((e) => {
      if (e.kind !== 'building' || !e.demolishing || !e.alive) return;
      // dismantle over ~3.5s
      e.hp -= e.maxHp / (3.5 * 20);
      if (this.tick % 6 === 0) this.emit('demolish-dust', { x: e.x, z: e.z, size: e.size });
      if (e.hp <= 0) {
        const cost = this.costOf(e.owner, e.proto);
        const r = this.players[e.owner].resources;
        for (const [res, amt] of Object.entries(cost)) r[res] = (r[res] ?? 0) + Math.round(amt * 0.4);
        this.killEntity(e, -1);
      }
    });
  }

  cmdResearchEra(buildingId, issuer = 0) {
    const b = this.pool.get(buildingId);
    const player = this.players[issuer];
    if (!b || b.owner !== issuer || b.protoId !== 'istana' || !b.complete) return false;
    if (b.techQueue || player.era >= 4 || player.eraResearch) return false;
    const era = ERAS[player.era]; // next era (1-indexed ids)
    if (!this.canAfford(issuer, era.cost)) return false;
    this.deduct(issuer, era.cost);
    const ticks = Math.round(era.time * TICK_RATE);
    b.techQueue = { kind: 'era', ticksLeft: ticks, total: ticks };
    return true;
  }

  cmdSummonHero(buildingId, issuer = 0) {
    return cmdSummonHero(this, buildingId, issuer);
  }

  cmdUltimate(issuer = 0) {
    return cmdUltimate(this, issuer);
  }

  heroOf(owner) {
    return heroOf(this, owner);
  }

  cmdResearchTech(buildingId, techId, issuer = 0) {
    const b = this.pool.get(buildingId);
    const player = this.players[issuer];
    if (!b || b.owner !== issuer || !b.complete || b.techQueue) return false;
    const tech = b.proto.techs.find((t) => t.id === techId);
    if (!tech || player.techs.has(techId) || tech.era > player.era) return false;
    if (!this.canAfford(issuer, tech.cost)) return false;
    this.deduct(issuer, tech.cost);
    const ticks = Math.round(tech.time * TICK_RATE);
    b.techQueue = { kind: 'tech', tech, ticksLeft: ticks, total: ticks };
    return true;
  }

  cmdAttack(ids, targetId, issuer = 0) {
    const t = this.pool.get(targetId);
    if (!t) return;
    const armed = [];
    const unarmed = [];
    for (const e of this.controllable(ids, issuer)) {
      (e.atk > 0 ? armed : unarmed).push(e);
    }
    for (const e of armed) {
      e.order = { type: 'attack', targetId };
      e.targetId = targetId;
      e.state = 'moving';
      this.requestPathTo(e, t.x, t.z);
    }
    if (unarmed.length > 0) {
      this.cmdMove(unarmed.map((e) => e.id), t.x, t.z, issuer);
    }
  }

  cmdTrade(ids, targetId, issuer = 0) {
    const target = this.pool.get(targetId);
    if (!target || target.protoId !== 'pangkalan' || !target.complete || target.owner !== issuer) return;
    for (const e of this.controllable(ids, issuer)) {
      if (!e.proto.trade) continue;
      let home = null;
      let bestD = Infinity;
      this.pool.forEach((b) => {
        if (b.kind !== 'building' || b.protoId !== 'pangkalan' || !b.complete) return;
        if (b.owner !== issuer || b.id === targetId) return;
        const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2;
        if (d < bestD) {
          bestD = d;
          home = b;
        }
      });
      if (!home) continue; // trade needs two pangkalan
      e.order = { type: 'trade', targetId, homeId: home.id };
      e.tradeGoing = true;
      e.state = 'moving';
      this.requestPathTo(e, target.x, target.z);
    }
  }

  // One A* request per group: units join the shared path at their nearest
  // waypoint and fan out into a formation ring at the destination.
  routeGroup(group, x, z, domain, orderType) {
    const tx = x | 0;
    const tz = z | 0;
    for (const e of group) {
      e.order = { type: orderType, x, z };
      e.targetId = -1;
      e.state = 'moving';
    }
    if (group.length <= 3) {
      for (const e of group) {
        this.pathfinder.request({
          resolve: (sim, pf) => {
            if (!e.alive || e.order?.x !== x) return;
            e.path = pf.findPath(e.x | 0, e.z | 0, tx, tz, domain);
            e.pathI = 0;
            if (!e.path) {
              e.order = null;
              e.state = 'idle';
            }
          },
        });
      }
      return;
    }

    let cx = 0;
    let cz = 0;
    for (const e of group) {
      cx += e.x;
      cz += e.z;
    }
    cx = (cx / group.length) | 0;
    cz = (cz / group.length) | 0;
    const ids = group.map((e) => e.id);
    this.pathfinder.request({
      resolve: (sim, pf) => {
        const path = pf.findPath(cx, cz, tx, tz, domain);
        let i = 0;
        for (const id of ids) {
          const e = sim.pool.get(id);
          if (!e || e.order?.x !== x) continue;
          if (!path) {
            e.order = null;
            e.state = 'idle';
            continue;
          }
          // join at the nearest waypoint
          let best = 0;
          let bestD = Infinity;
          for (let w = 0; w < path.length; w++) {
            const d = (path[w].x - e.x) ** 2 + (path[w].z - e.z) ** 2;
            if (d < bestD) {
              bestD = d;
              best = w;
            }
          }
          e.path = path;
          e.pathI = best;
          const [ox, oz] = formationOffset(i++);
          e.order.ox = ox;
          e.order.oz = oz;
        }
      },
    });
  }

  // Called by the movement system when a unit exhausts its path.
  onPathDone(e) {
    if (economyArrive(this, e)) return;
    const o = e.order;
    if (!o) {
      e.state = 'idle';
      return;
    }
    if ((o.type === 'move' || o.type === 'attackmove') && o.ox !== undefined && !o.offsetDone) {
      o.offsetDone = true;
      const fx = o.x + o.ox;
      const fz = o.z + o.oz;
      if (this.grid.passable(fx | 0, fz | 0, e.proto.domain)) {
        e.path = [{ x: fx, z: fz }];
        e.pathI = 0;
        return;
      }
    }
    if (o.type === 'move' || o.type === 'attackmove') {
      e.order = null;
      e.state = 'idle';
    } else {
      // economy orders (gather/build/trade) take over in their systems
      e.state = 'idle';
    }
  }

  step() {
    this.tick++;
    // snapshot previous positions for render interpolation
    this.pool.forEach((e) => {
      e.prevX = e.x;
      e.prevZ = e.z;
    });

    statusSystem(this);
    this.pathfinder.processQueue(this);
    this.hash.rebuild(this.pool);
    movementSystem(this);
    economySystem(this);
    combatSystem(this);
    this.demolitionSystem();
    heroSystem(this);
    aiSystem(this);
    // residents drain/restore with building HP — refresh the cap periodically
    if (this.tick % 10 === 0) {
      this.recomputePopCap(0);
      this.recomputePopCap(1);
    }
    if (this.tick % 5 === 0) this.fog.update(this);
    if (this.victoryEnabled && this.winner < 0 && this.tick % 25 === 0 && this.tick > 100) {
      this.checkVictory();
    }
    if (this.victoryEnabled && this.tick % 100 === 0) {
      this.statsHistory.push({
        tick: this.tick,
        scores: [this.militaryScore(0), this.militaryScore(1)],
      });
    }
    for (const p of this.players) {
      if (p.revealAll > 0) p.revealAll--;
    }

    // era research progress lives on the istana's techQueue; mirror a
    // simple flag for the HUD
    for (const p of this.players) {
      p.eraResearch = null;
    }
    this.pool.forEach((e) => {
      if (e.kind === 'building' && e.techQueue?.kind === 'era') {
        this.players[e.owner].eraResearch = e.techQueue;
      }
    });

    // lifespan-limited units (spectral warriors)
    this.pool.forEach((e) => {
      if (e.lifespan > 0) {
        e.lifespan--;
        if (e.lifespan === 0) this.killEntity(e, -1);
      }
    });
  }

  // Two ways to win: destroy every enemy Istana (foundations count — you can
  // rebuild before the last one falls), or build and defend a Mahkota
  // Monument for 5 minutes.
  checkVictory() {
    const istanas = [0, 0];
    const monuments = [false, false];
    this.pool.forEach((e) => {
      if (e.kind !== 'building' || e.owner < 0) return;
      if (e.protoId === 'istana') istanas[e.owner]++;
      if (e.protoId === 'mahkota_monument' && e.complete) monuments[e.owner] = true;
    });

    for (let owner = 0; owner < 2; owner++) {
      const player = this.players[owner];
      if (monuments[owner]) {
        if (player.monumentSince < 0) {
          player.monumentSince = this.tick;
          this.emit('monument-started', { owner });
        }
        if (this.tick - player.monumentSince >= MONUMENT_TICKS) {
          this.winner = owner;
          this.emit('game-over', { winner: owner, byMonument: true });
          return;
        }
      } else if (player.monumentSince >= 0) {
        player.monumentSince = -1;
        this.emit('monument-lost', { owner });
      }
    }

    for (let owner = 0; owner < 2; owner++) {
      if (istanas[owner] === 0) this.players[owner].defeated = true;
    }
    if (this.players[0].defeated || this.players[1].defeated) {
      this.winner = this.players[0].defeated ? 1 : 0;
      this.emit('game-over', { winner: this.winner });
    }
  }

  killEntity(e, killerOwner) {
    if (!e.alive) return;
    const player = this.players[e.owner];
    if (player && e.kind === 'unit') {
      player.pop -= e.proto.pop;
      player.unitsLost++;
    }
    if (e.kind === 'unit' && e.proto.hero) onHeroDeath(this, e);
    if (e.kind === 'building') {
      const grid = this.grid;
      for (let dz = 0; dz < e.size; dz++) {
        for (let dx = 0; dx < e.size; dx++) {
          const i = grid.idx(e.tileX + dx, e.tileZ + dz);
          if (grid.occupied[i] === e.id + 1) grid.occupied[i] = 0;
        }
      }
      this.pathfinder.cache.clear();
      this.releaseBuilders(e);
      // a hero still in the summoning queue is released, not lost
      if (player && e.queue) {
        for (const item of e.queue) {
          if (UNIT_PROTOS[item.protoId]?.hero) player.heroAlive = false;
        }
      }
    }
    if (killerOwner >= 0 && killerOwner !== e.owner) {
      this.players[killerOwner].unitsKilled++;
    }
    this.emit('death', {
      id: e.id, protoId: e.protoId, kind: e.kind,
      x: e.x, z: e.z, owner: e.owner, size: e.size,
    });
    this.pool.kill(e);
    if (e.kind === 'building' && player) this.recomputePopCap(e.owner);

    // Conquest: the moment a player's last Istana falls they are defeated —
    // checked here (not just on the periodic tick) so the enemy can't dodge
    // the loss by instantly replanting a town-hall foundation.
    if (e.kind === 'building' && e.protoId === 'istana' && this.victoryEnabled && this.winner < 0) {
      let remaining = 0;
      this.pool.forEach((b) => {
        if (b.alive && b.owner === e.owner && b.protoId === 'istana') remaining++;
      });
      if (remaining === 0) {
        this.players[e.owner].defeated = true;
        this.winner = e.owner === 0 ? 1 : 0;
        this.emit('game-over', { winner: this.winner });
      }
    }

    // Slaying the enemy champion (boss) razes their capital and wins the
    // match outright — destroying their Istana(s) triggers the conquest path.
    if (e.kind === 'unit' && e.isBoss && this.victoryEnabled && this.winner < 0) {
      this.emit('boss-slain', { owner: e.owner, x: e.x, z: e.z });
      const istanas = [];
      this.pool.forEach((b) => {
        if (b.alive && b.owner === e.owner && b.protoId === 'istana') istanas.push(b);
      });
      for (const ist of istanas) this.killEntity(ist, killerOwner); // → victory
      if (this.winner < 0) {
        this.players[e.owner].defeated = true;
        this.winner = e.owner === 0 ? 1 : 0;
        this.emit('game-over', { winner: this.winner });
      }
    }
  }
}
