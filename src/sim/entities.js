import { TICK_RATE } from './constants.js';
import unitsData from '../data/units.json' with { type: 'json' };
import buildingsData from '../data/buildings.json' with { type: 'json' };

// Proto tables, with seconds converted to ticks and speeds to per-tick.
export const UNIT_PROTOS = {};
export const BUILDING_PROTOS = {};

for (const [id, u] of Object.entries(unitsData)) {
  if (id.startsWith('_')) continue;
  UNIT_PROTOS[id] = {
    ...u,
    id,
    kind: 'unit',
    trainTicks: Math.round((u.trainTime ?? 1) * TICK_RATE),
    atkTicks: Math.max(1, Math.round((u.atkSpeed ?? 2) * TICK_RATE)),
    windupTicks: Math.round((u.windup ?? 0) * TICK_RATE),
    speedPerTick: (u.speed ?? 1) / TICK_RATE,
    lifespanTicks: u.lifespan ? Math.round(u.lifespan * TICK_RATE) : 0,
    tags: u.tags ?? [],
    bonusVs: u.bonusVs ?? {},
    cost: u.cost ?? {},
  };
}

for (const [id, b] of Object.entries(buildingsData)) {
  if (id.startsWith('_')) continue;
  BUILDING_PROTOS[id] = {
    ...b,
    id,
    kind: 'building',
    buildTicks: Math.round((b.buildTime ?? 10) * TICK_RATE),
    atkTicks: Math.max(1, Math.round((b.atkSpeed ?? 2) * TICK_RATE)),
    tags: ['building', ...(b.tags ?? [])],
    bonusVs: {},
    cost: b.cost ?? {},
    trains: b.trains ?? [],
    techs: b.techs ?? [],
  };
}

// One flat entity shape for everything (units, buildings, projectiles).
// Pooled: slots are reused, `alive` gates them. Reset must touch EVERY field.
// Exported so save/load can rebuild pool slots at their original ids.
export function blankEntity(id) {
  return {
    id,
    alive: false,
    kind: 'unit',
    proto: null,       // proto object reference
    protoId: '',
    owner: -1,
    // spatial
    x: 0, z: 0, prevX: 0, prevZ: 0, facing: 0, radius: 0.3,
    tileX: 0, tileZ: 0, // building anchor tile (top-left) for buildings
    size: 1,            // building footprint (size x size tiles)
    // life
    hp: 0, maxHp: 0, armor: 0,
    // movement
    speedPerTick: 0, path: null, pathI: 0, repathCooldown: 0,
    // order: {type, x, z, targetId, protoId, data}
    order: null, resumeOrder: null, state: 'idle', stance: 'aggressive',
    // combat
    atk: 0, range: 0, atkTicks: 20, windupTicks: 0, cooldown: 0, windup: -1,
    targetId: -1, scanCooldown: 0, lastAttackedTick: -1e9, lastCombatTick: -1e9,
    // projectile
    projTargetId: -1, projDmg: 0, projOwnerEnt: -1, projArc: false, projT: 0,
    projX0: 0, projZ0: 0, projX1: 0, projZ1: 0, projSplash: 0,
    // gathering / economy
    carryType: '', carryAmount: 0, gatherTile: -1, gatherProgress: 0,
    dropoffId: -1, buildTargetId: -1, farmId: -1,
    tradeHomeId: -1, tradeTargetId: -1, tradeGoing: false,
    // building-specific
    buildProgress: 0, complete: false, queue: null, rallyX: -1, rallyZ: -1,
    techQueue: null,
    // status effects: [{type, ticksLeft, data}]
    statuses: null,
    // misc
    lifespan: 0, animSeed: 0, killedBy: -1,
  };
}

export class EntityPool {
  constructor() {
    this.list = [];
    this.free = [];
  }

  spawn() {
    let e;
    if (this.free.length > 0) {
      const id = this.free.pop();
      e = blankEntity(id);
      this.list[id] = e;
    } else {
      e = blankEntity(this.list.length);
      this.list.push(e);
    }
    e.alive = true;
    return e;
  }

  get(id) {
    const e = this.list[id];
    return e && e.alive ? e : null;
  }

  kill(e) {
    if (!e.alive) return;
    e.alive = false;
    this.free.push(e.id);
  }

  // Iterate alive entities. Callback may kill entities; spawning during
  // iteration is also safe (new slots are appended or reuse dead ones).
  forEach(fn) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.alive) fn(e);
    }
  }
}
