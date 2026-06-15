import { GRID, TICK_RATE, TileType } from './constants.js';

// Fire system: burning ground tiles and burning buildings. Fire spreads to
// adjacent flammable tiles and structures, damages whatever it touches, and
// burns out into scorched earth — unless a firefighter (Balai Bomba) douses
// it first. Ignited by fire arrows, thrown firebombs and Lela siege shots.

const FIRE_TICK = 10;                  // update twice a second
const TILE_BURN = Math.round(4 * TICK_RATE);
const BUILD_BURN = Math.round(11 * TICK_RATE);
const TILE_DPS = 7;                    // damage/sec to units standing in fire
const BUILD_DPS = 11;                  // damage/sec to a burning building
// per burning tile, per update, chance to spread to ONE random neighbour.
// Kept sub-critical (<1 over a tile's life) so grass fires stay localized and
// always burn out — burning BUILDINGS are the lasting threat.
const SPREAD_CHANCE = 0.1;
const MAX_TILES = 260;                 // runaway guard

function flammable(grid, x, z) {
  if (!grid.inBounds(x, z)) return false;
  if (grid.occupied[grid.idx(x, z)]) return false; // buildings burn separately
  // only fresh vegetation burns; scorched EARTH is spent fuel, so fires die
  // out once they run out of grass/jungle rather than wandering forever
  const t = grid.types[grid.idx(x, z)];
  return t === TileType.GRASS || t === TileType.JUNGLE ||
         t === TileType.SAGO || t === TileType.CAMPHOR;
}

export class FireSystem {
  constructor(size = GRID) {
    this.tiles = new Map(); // tileIdx -> ticksLeft
    this.rng = 0;
    this.size = size; // grid stride for tile indices
  }

  rand() {
    // tiny deterministic LCG so spread is reproducible per sim
    this.rng = (this.rng * 1103515245 + 12345) & 0x7fffffff;
    return this.rng / 0x7fffffff;
  }

  burningTileCount() {
    return this.tiles.size;
  }

  isBurning(x, z) {
    return this.tiles.has((z | 0) * this.size + (x | 0));
  }

  // Ignite tiles (and any building) around a point.
  ignite(sim, x, z, radius = 0) {
    const grid = sim.grid;
    const cx = x | 0;
    const cz = z | 0;
    const r = Math.max(0, Math.round(radius));
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        const tx = cx + dx;
        const tz = cz + dz;
        if (flammable(grid, tx, tz) && this.tiles.size < MAX_TILES) {
          this.tiles.set(tz * this.size + tx, TILE_BURN);
        }
      }
    }
    // ignite buildings whose footprint is within the blast
    sim.pool.forEach((b) => {
      if (b.kind !== 'building') return;
      if (Math.hypot(b.x - x, b.z - z) <= r + b.size * 0.5 + 0.6) {
        this.igniteBuilding(sim, b);
      }
    });
  }

  igniteBuilding(sim, b) {
    if (!b.alive || b.kind !== 'building') return;
    if (!b.burning || b.burning < BUILD_BURN * 0.5) {
      const wasBurning = b.burning > 0;
      b.burning = BUILD_BURN;
      if (!wasBurning) sim.emit('ignite', { id: b.id, x: b.x, z: b.z });
    }
  }

  douse(sim, x, z, radius) {
    const r = radius;
    // extinguish ground fire
    for (const idx of [...this.tiles.keys()]) {
      const tx = idx % this.size;
      const tz = (idx / this.size) | 0;
      if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) <= r) this.tiles.delete(idx);
    }
    // and cool burning buildings
    sim.pool.forEach((b) => {
      if (b.kind === 'building' && b.burning > 0 &&
          Math.hypot(b.x - x, b.z - z) <= r + b.size * 0.5) {
        b.burning = 0;
      }
    });
  }

  update(sim) {
    if (sim.tick % FIRE_TICK !== 0) return;
    const grid = sim.grid;
    const dtSec = FIRE_TICK / TICK_RATE;

    // --- ground fire: damage occupants, spread, burn out ---
    const newFires = [];
    for (const [idx, ticks] of this.tiles) {
      const tx = idx % this.size;
      const tz = (idx / this.size) | 0;
      // damage units standing in/next to the flames
      sim.hash.near(tx + 0.5, tz + 0.5, 0.9, (u) => {
        sim.fireDamage(u, TILE_DPS * dtSec, -1);
      });
      // maybe spread to ONE random adjacent flammable tile (sub-critical)
      if (this.rand() < SPREAD_CHANCE && this.tiles.size + newFires.length < MAX_TILES) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const [dx, dz] = dirs[(this.rand() * 4) | 0];
        const nx = tx + dx;
        const nz = tz + dz;
        if (flammable(grid, nx, nz) && !this.tiles.has(nz * this.size + nx)) {
          newFires.push(nz * this.size + nx);
        }
      }
      // ignite buildings adjacent to this fire tile
      sim.pool.forEach((b) => {
        if (b.kind === 'building' && Math.hypot(b.x - (tx + 0.5), b.z - (tz + 0.5)) < b.size * 0.5 + 1.1) {
          this.igniteBuilding(sim, b);
        }
      });
      const left = ticks - FIRE_TICK;
      if (left <= 0) {
        this.tiles.delete(idx);
        // burnt vegetation becomes scorched earth (spent fuel); a burnt
        // resource grove is consumed by the flames
        const t = grid.types[idx];
        if (t === TileType.JUNGLE || t === TileType.SAGO || t === TileType.CAMPHOR) {
          grid.resources[idx] = 0;
          sim.emit('node-depleted', { x: tx, z: tz, oldType: t });
          grid.types[idx] = TileType.EARTH;
          sim.pathfinder.cache.clear(); // these were impassable; paths opened up
        } else {
          grid.types[idx] = TileType.EARTH;
        }
        sim.emit('fire-out', { x: tx + 0.5, z: tz + 0.5 });
      } else {
        this.tiles.set(idx, left);
      }
    }
    for (const idx of newFires) this.tiles.set(idx, TILE_BURN);

    // --- building fire: burn down, spread to neighbours ---
    sim.pool.forEach((b) => {
      if (b.kind !== 'building' || !b.alive || !b.burning || b.burning <= 0) return;
      sim.fireDamage(b, BUILD_DPS * dtSec, -1);
      if (!b.alive) return;
      // occasionally throw embers to adjacent ground + neighbouring buildings
      if (this.rand() < 0.18) this.ignite(sim, b.x, b.z, Math.ceil(b.size / 2) + 1);
      b.burning -= FIRE_TICK;
      sim.emit('burning', { id: b.id, x: b.x, z: b.z });
    });

    // --- firefighters (Balai Bomba) douse nearby fire ---
    sim.pool.forEach((b) => {
      if (b.kind === 'building' && b.complete && b.proto.douse) {
        this.douse(sim, b.x, b.z, b.proto.douse.radius);
      }
    });
  }
}
