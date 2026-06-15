import { GRID, TICK_RATE, TileType } from './constants.js';

// Gather rates in resource units per second (divided by TICK_RATE per tick).
// Tuned up from the original phase-3 values for a brisker early game.
const RATES = {
  sago: 1.2,
  timber: 1.2,
  gold: 1.05,
  camphor: 0.45,
  farm: 0.85,
  fish: 1.6,
};

export const RES_OF_TILE = {
  [TileType.SAGO]: 'food',
  [TileType.JUNGLE]: 'timber',
  [TileType.GOLD]: 'gold',
  [TileType.CAMPHOR]: 'camphor',
};

function rateOfTile(t) {
  switch (t) {
    case TileType.SAGO: return RATES.sago;
    case TileType.JUNGLE: return RATES.timber;
    case TileType.GOLD: return RATES.gold;
    case TileType.CAMPHOR: return RATES.camphor;
    default: return 0;
  }
}

export function carryCapOf(e) {
  const base = e.proto.carry ?? 10;
  return e.carryType === 'camphor' ? Math.ceil(base / 2) : base;
}

// Nearest completed friendly building that accepts `resType`.
export function findDropoff(sim, e, resType) {
  let best = null;
  let bestD = Infinity;
  sim.pool.forEach((b) => {
    if (b.kind !== 'building' || b.owner !== e.owner || !b.complete) return;
    const drop = b.proto.dropoff;
    if (!drop || !drop.includes(resType)) return;
    // boats can only reach shoreline dropoffs (pangkalan)
    if (e.proto.domain === 'water' && !b.proto.shore) return;
    const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  });
  return best;
}

// Nearest tile of the same resource type near (x, z), for auto-rollover
// when a node depletes.
function findNearbyNode(sim, x, z, tileType, radius = 9) {
  const grid = sim.grid;
  let best = -1;
  let bestD = Infinity;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = (x | 0) + dx;
      const tz = (z | 0) + dz;
      if (!grid.inBounds(tx, tz)) continue;
      if (grid.typeAt(tx, tz) !== tileType) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = grid.idx(tx, tz);
      }
    }
  }
  return best;
}

function startGatherTrip(sim, e) {
  // Walk to the assigned node (path resolves to nearest passable tile).
  const G = sim.grid.size;
  const tx = e.gatherTile % G;
  const tz = (e.gatherTile / G) | 0;
  e.state = 'toGather';
  sim.requestPathTo(e, tx, tz);
}

function startDropoffTrip(sim, e) {
  const drop = findDropoff(sim, e, e.carryType);
  if (!drop) {
    e.state = 'idle';
    e.order = null;
    return;
  }
  e.dropoffId = drop.id;
  e.state = 'toDropoff';
  sim.requestPathTo(e, drop.x | 0, drop.z | 0);
}

// Called from sim.onPathDone for economy orders.
export function economyArrive(sim, e) {
  const o = e.order;
  if (!o) return false;
  const grid = sim.grid;

  if (o.type === 'gather') {
    if (e.state === 'toGather') {
      const tx = e.gatherTile % grid.size;
      const tz = (e.gatherTile / grid.size) | 0;
      const near = Math.hypot(e.x - (tx + 0.5), e.z - (tz + 0.5)) < (e.proto.domain === 'water' ? 1.1 : 1.6);
      const stillThere = grid.resources[e.gatherTile] > 0;
      if (near && stillThere) {
        e.state = 'gathering';
        e.facing = Math.atan2(tx + 0.5 - e.x, tz + 0.5 - e.z);
      } else if (stillThere && !o.retried) {
        o.retried = true;
        startGatherTrip(sim, e);
      } else {
        rolloverOrIdle(sim, e);
      }
      return true;
    }
    if (e.state === 'toDropoff') {
      const b = sim.pool.get(e.dropoffId);
      if (b && Math.hypot(e.x - b.x, e.z - b.z) < b.size / 2 + 1.6) {
        deposit(sim, e);
        if (e.gatherTile >= 0 && grid.resources[e.gatherTile] > 0) startGatherTrip(sim, e);
        else rolloverOrIdle(sim, e);
      } else {
        startDropoffTrip(sim, e); // building died or we stopped short
      }
      return true;
    }
  }

  if (o.type === 'farm') {
    const farm = sim.pool.get(o.farmId);
    if (e.state === 'toGather') {
      if (farm && farm.complete && Math.hypot(e.x - farm.x, e.z - farm.z) < farm.size / 2 + 1.4) {
        e.state = 'gathering';
      } else {
        e.order = null;
        e.state = 'idle';
      }
      return true;
    }
    if (e.state === 'toDropoff') {
      const b = sim.pool.get(e.dropoffId);
      if (b && Math.hypot(e.x - b.x, e.z - b.z) < b.size / 2 + 1.6) {
        deposit(sim, e);
        if (farm && farm.complete) {
          e.state = 'toGather';
          sim.requestPathTo(e, farm.x | 0, farm.z | 0);
        } else {
          e.order = null;
          e.state = 'idle';
        }
      } else {
        startDropoffTrip(sim, e);
      }
      return true;
    }
  }

  if (o.type === 'trade') {
    const target = sim.pool.get(o.targetId);
    const home = sim.pool.get(o.homeId);
    if (!target || !home) {
      e.order = null;
      e.state = 'idle';
      return true;
    }
    if (e.tradeGoing) {
      // reached the far pangkalan: turn around
      e.tradeGoing = false;
      sim.requestPathTo(e, home.x | 0, home.z | 0);
    } else {
      // home again: bank gold scaled by route length
      const dist = Math.hypot(target.x - home.x, target.z - home.z);
      const player = sim.players[e.owner];
      const income = Math.max(4, Math.round(dist * 1.1 * player.mods.tradeMult));
      const banked = sim.addResource(e.owner, 'gold', income);
      sim.emit('trade', { x: e.x, z: e.z, amount: banked });
      e.tradeGoing = true;
      sim.requestPathTo(e, target.x | 0, target.z | 0);
    }
    return true;
  }

  if (o.type === 'build') {
    const b = sim.pool.get(o.targetId);
    if (b && Math.hypot(e.x - b.x, e.z - b.z) < b.size / 2 + 1.5) {
      e.state = 'building';
    } else if (b && !o.retried) {
      o.retried = true;
      sim.requestPathTo(e, b.x | 0, b.z | 0);
    } else {
      e.order = null;
      e.state = 'idle';
    }
    return true;
  }

  return false;
}

function rolloverOrIdle(sim, e) {
  const o = e.order;
  const tileType = o?.tileType;
  if (tileType !== undefined) {
    const next = findNearbyNode(sim, e.x, e.z, tileType);
    if (next >= 0) {
      e.gatherTile = next;
      startGatherTrip(sim, e);
      return;
    }
  }
  // carry whatever we hold home first
  if (e.carryAmount > 0.5) {
    e.order = { type: 'gather', tileType: tileType ?? -1 };
    e.gatherTile = -1;
    startDropoffTrip(sim, e);
    return;
  }
  e.order = null;
  e.state = 'idle';
}

function deposit(sim, e) {
  if (e.carryAmount > 0) {
    // banked is clamped to storage capacity; the overflow is wasted
    sim.addResource(e.owner, e.carryType, Math.round(e.carryAmount));
  }
  e.carryAmount = 0;
}

export function economySystem(sim) {
  const grid = sim.grid;

  sim.pool.forEach((e) => {
    if (!e.alive) return;

    // --- workers actively gathering ---
    if (e.kind === 'unit' && e.state === 'gathering' && e.order) {
      const mods = sim.players[e.owner].mods;
      if (e.order.type === 'farm') {
        const farm = sim.pool.get(e.order.farmId);
        if (!farm || !farm.complete) {
          e.order = null;
          e.state = 'idle';
          return;
        }
        e.carryType = 'food';
        e.carryAmount += (farm.proto.farm.rate / TICK_RATE) * mods.gatherMult;
      } else {
        const ti = e.gatherTile;
        const isFish = grid.fishTiles.has(ti);
        if (ti < 0 || grid.resources[ti] <= 0) {
          rolloverOrIdle(sim, e);
          return;
        }
        const tileType = grid.types[ti];
        const rate = ((isFish ? RATES.fish : rateOfTile(tileType)) / TICK_RATE) * mods.gatherMult;
        const take = Math.min(rate, grid.resources[ti]);
        grid.resources[ti] -= take;
        e.carryType = isFish ? 'food' : RES_OF_TILE[tileType];
        e.carryAmount += take;
        if (grid.resources[ti] <= 0) depleteNode(sim, ti, isFish);
      }
      if (e.carryAmount >= carryCapOf(e)) startDropoffTrip(sim, e);
      return;
    }

    // --- builders ---
    if (e.kind === 'unit' && e.state === 'building' && e.order) {
      const b = sim.pool.get(e.order.targetId);
      if (!b || b.kind !== 'building') {
        e.order = null;
        e.state = 'idle';
        return;
      }
      if (!b.complete) {
        b.builders = (b.builders ?? 0) + 1;
      } else if (b.hp < b.maxHp) {
        b.hp = Math.min(b.maxHp, b.hp + 0.6); // repair
      } else {
        e.order = null;
        e.state = 'idle';
      }
      return;
    }

    // --- buildings: construction progress, queues, research ---
    if (e.kind === 'building') {
      if (!e.complete) {
        const n = e.builders ?? 0;
        if (n > 0) {
          // first builder full speed, each extra +50%
          const work = 1 + (n - 1) * 0.5;
          e.buildProgress += work;
          e.hp = Math.min(e.maxHp, e.hp + (e.maxHp * 0.8 * work) / e.proto.buildTicks);
          if (e.buildProgress >= e.proto.buildTicks) {
            e.complete = true;
            e.hp = e.maxHp;
            sim.recomputePopCap(e.owner);
            sim.emit('building-done', { id: e.id, protoId: e.protoId, owner: e.owner, x: e.x, z: e.z });
            sim.releaseBuilders(e);
          }
        }
        e.builders = 0;
        return;
      }

      // surau: heal nearby friendlies + camphor trickle
      if (e.proto.heal && sim.tick % 10 === e.id % 10) {
        const { radius, rate } = e.proto.heal;
        sim.hash.near(e.x, e.z, radius, (u) => {
          if (u.owner === e.owner && u.hp < u.maxHp) {
            u.hp = Math.min(u.maxHp, u.hp + rate * 0.5); // every half second
          }
        });
      }
      // passive income: the capital and kampong houses generate a steady
      // trickle of resources. Generalized over all resource types.
      if (e.proto.trickle) {
        for (const [res, perSec] of Object.entries(e.proto.trickle)) {
          sim.addResource(e.owner, res, perSec / TICK_RATE); // clamped to cap
        }
      }

      // research (era advancement / blacksmith techs) blocks the train queue
      if (e.techQueue) {
        e.techQueue.ticksLeft--;
        if (e.techQueue.ticksLeft <= 0) {
          sim.finishResearch(e, e.techQueue);
          e.techQueue = null;
        }
        return;
      }

      if (e.queue && e.queue.length > 0) {
        const item = e.queue[0];
        // stall when housed: the unit waits in queue until pop room frees up
        const proto = sim.protos.units[item.protoId];
        const player = sim.players[e.owner];
        if (item.ticksLeft <= 0) {
          if (proto.pop === 0 || player.pop + proto.pop <= player.popCap) {
            e.queue.shift();
            sim.deliverUnit(e, item.protoId);
          }
        } else {
          item.ticksLeft--;
        }
      }
    }
  });
}

function depleteNode(sim, tileIdx, isFish) {
  const grid = sim.grid;
  const x = tileIdx % grid.size;
  const z = (tileIdx / grid.size) | 0;
  if (isFish) {
    grid.fishTiles.delete(tileIdx);
    sim.emit('node-depleted', { x, z, fish: true });
    return;
  }
  const old = grid.types[tileIdx];
  grid.types[tileIdx] = TileType.GRASS;
  sim.pathfinder.cache.clear(); // jungle clearing opens new paths
  sim.emit('node-depleted', { x, z, oldType: old });
}
