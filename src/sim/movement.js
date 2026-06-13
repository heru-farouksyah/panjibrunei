import { GRID, TileType } from './constants.js';

// Spatial hash over 2x2-tile buckets, rebuilt each tick. Used by movement
// separation and (later) combat target acquisition.
export class SpatialHash {
  constructor() {
    this.buckets = new Map();
  }

  rebuild(pool) {
    this.buckets.clear();
    pool.forEach((e) => {
      if (e.kind !== 'unit') return;
      const key = ((e.x | 0) >> 1) * 64 + ((e.z | 0) >> 1);
      let arr = this.buckets.get(key);
      if (!arr) {
        arr = [];
        this.buckets.set(key, arr);
      }
      arr.push(e);
    });
  }

  // Visit units within `r` of (x, z).
  near(x, z, r, fn) {
    const bx0 = ((x - r) | 0) >> 1;
    const bx1 = ((x + r) | 0) >> 1;
    const bz0 = ((z - r) | 0) >> 1;
    const bz1 = ((z + r) | 0) >> 1;
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        const arr = this.buckets.get(bx * 64 + bz);
        if (!arr) continue;
        for (const e of arr) {
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz <= r * r) fn(e);
        }
      }
    }
  }
}

function hasStatus(e, type) {
  if (!e.statuses) return false;
  for (const s of e.statuses) if (s.type === type) return true;
  return false;
}

export function speedMultOf(e) {
  let m = 1;
  if (e.statuses) {
    for (const s of e.statuses) {
      if (s.type === 'speedMult') m *= s.data;
    }
  }
  return m;
}

// Follow paths + local-avoidance separation. One A* path per order; units
// steer around each other instead of re-planning. Idle units actively YIELD
// (step out of the lane) when a moving unit needs their tile, and movers that
// stay jammed for a while skip ahead or re-plan around the obstruction.
export function movementSystem(sim) {
  const { pool, grid, hash } = sim;

  // --- 1. path following ---
  pool.forEach((e) => {
    if (e.kind !== 'unit' || !e.path) return;
    if (hasStatus(e, 'stun')) return;

    const wp = e.path[e.pathI];
    if (!wp) {
      e.path = null;
      return;
    }
    let dx = wp.x - e.x;
    let dz = wp.z - e.z;
    const dist = Math.hypot(dx, dz);
    const step = e.speedPerTick * speedMultOf(e);

    if (dist <= Math.max(step, 0.08)) {
      e.x = wp.x;
      e.z = wp.z;
      e.pathI++;
      if (e.pathI >= e.path.length) {
        e.path = null;
        e.pathI = 0;
        e.stuckTicks = 0;
        e.lastWpDist = undefined;
        sim.onPathDone(e);
      }
    } else {
      e.x += (dx / dist) * step;
      e.z += (dz / dist) * step;
      e.facing = Math.atan2(dx, dz);
      if (e.state === 'idle') e.state = 'moving';
    }
  });

  // --- 2. separation + active yield ---
  pool.forEach((e) => {
    if (e.kind !== 'unit') return;
    const moving = e.path !== null;
    const busy = e.state === 'gathering' || e.state === 'building';
    let pushX = 0;
    let pushZ = 0;
    let yielding = false;

    hash.near(e.x, e.z, e.radius + 0.7, (o) => {
      if (o === e || o.proto.domain !== e.proto.domain) return;
      let dx = e.x - o.x;
      let dz = e.z - o.z;
      let d = Math.hypot(dx, dz);
      const minD = e.radius + o.radius;
      if (d >= minD) return;
      if (d < 1e-4) {
        const a = (e.id * 2.399) % (Math.PI * 2);
        dx = Math.sin(a);
        dz = Math.cos(a);
        d = 0.001;
      }
      let w = (minD - d) / minD;
      // The other unit is moving and I am not: get out of its way decisively.
      if (!moving && o.path) {
        w *= 2.6;
        yielding = true;
      }
      pushX += (dx / d) * w;
      pushZ += (dz / d) * w;
    });

    if (pushX !== 0 || pushZ !== 0) {
      const len = Math.hypot(pushX, pushZ);
      // idle units yielding to traffic clear the lane fast; idle units spread
      // out firmly so they don't pile up; workers keep a little spacing but
      // stay on their node; movers nudge modestly.
      const cap = yielding ? 0.18 : busy ? 0.05 : moving ? 0.07 : 0.13;
      const mv = Math.min(cap, len * 0.12);
      const ux = (pushX / len) * mv;
      const uz = (pushZ / len) * mv;
      const domain = e.proto.domain;
      if (grid.passable((e.x + ux) | 0, (e.z + uz) | 0, domain)) {
        e.x += ux;
        e.z += uz;
      } else if (grid.passable((e.x + ux) | 0, e.z | 0, domain)) {
        e.x += ux;
      } else if (grid.passable(e.x | 0, (e.z + uz) | 0, domain)) {
        e.z += uz;
      }
    }

    e.x = Math.max(0.2, Math.min(GRID - 0.2, e.x));
    e.z = Math.max(0.2, Math.min(GRID - 0.2, e.z));
  });

  // --- 3. unjam stalled movers: skip a waypoint, then re-plan ---
  pool.forEach((e) => {
    if (e.kind !== 'unit' || !e.path) return;
    const wp = e.path[e.pathI];
    if (!wp) return;
    const d = Math.hypot(wp.x - e.x, wp.z - e.z);
    // made no meaningful progress toward the waypoint this tick?
    if (e.lastWpDist !== undefined && d > e.lastWpDist - e.speedPerTick * 0.35) {
      e.stuckTicks = (e.stuckTicks || 0) + 1;
    } else {
      e.stuckTicks = 0;
    }
    e.lastWpDist = d;

    if (e.stuckTicks === 16 && e.pathI < e.path.length - 1) {
      e.pathI++; // give up on the blocked node, aim at the next one
      e.lastWpDist = undefined;
    } else if (e.stuckTicks >= 40) {
      const dest = e.path[e.path.length - 1];
      e.stuckTicks = 0;
      e.lastWpDist = undefined;
      sim.requestPathTo(e, dest.x, dest.z); // route around the jam
    }
  });
}

// Formation offsets for group move destinations (ring spiral around target).
export function formationOffset(i) {
  if (i === 0) return [0, 0];
  const ring = Math.ceil((Math.sqrt(i + 1) - 1) / 2);
  const ringStart = (2 * ring - 1) ** 2;
  const slot = i - ringStart;
  const perimeter = 8 * ring;
  const ang = (slot / perimeter) * Math.PI * 2;
  // wider spacing so the bigger unit models land in a loose, non-overlapping
  // formation rather than packing on top of each other
  return [Math.cos(ang) * ring * 0.95, Math.sin(ang) * ring * 0.95];
}
