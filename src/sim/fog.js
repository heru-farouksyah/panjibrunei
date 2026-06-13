import { GRID, TileType } from './constants.js';

// 3-state fog of war per player: unexplored (0) / explored (1) / visible (2).
// Recomputed on a coarse tick (every 5 sim ticks) for performance.
export class FogSystem {
  constructor() {
    this.visible = [new Uint8Array(GRID * GRID), new Uint8Array(GRID * GRID)];
    this.explored = [new Uint8Array(GRID * GRID), new Uint8Array(GRID * GRID)];
    this.offsets = new Map(); // radius -> [dx, dz, ...]
    this.version = 0;
  }

  offsetsFor(r) {
    let o = this.offsets.get(r);
    if (!o) {
      o = [];
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz <= r * r + 1) o.push(dx, dz);
        }
      }
      this.offsets.set(r, o);
    }
    return o;
  }

  update(sim) {
    for (let owner = 0; owner < 2; owner++) {
      const vis = this.visible[owner];
      const exp = this.explored[owner];
      const player = sim.players[owner];
      if (player.revealAll > 0) {
        vis.fill(1);
        exp.fill(1);
        continue;
      }
      vis.fill(0);
      const losBonus = player.mods.losBonus ?? 0;
      sim.pool.forEach((e) => {
        if (e.owner !== owner) return;
        if (e.kind !== 'unit' && e.kind !== 'building') return;
        const r = Math.round((e.proto.los ?? 4) + (e.kind === 'unit' ? losBonus : 0));
        const cx = e.x | 0;
        const cz = e.z | 0;
        const o = this.offsetsFor(r);
        for (let i = 0; i < o.length; i += 2) {
          const x = cx + o[i];
          const z = cz + o[i + 1];
          if (x >= 0 && z >= 0 && x < GRID && z < GRID) {
            const idx = z * GRID + x;
            vis[idx] = 1;
            exp[idx] = 1;
          }
        }
      });
    }

    // jungle-ambush flags (Badar): hidden while in/next to jungle and not
    // having fought recently
    sim.pool.forEach((e) => {
      if (e.kind !== 'unit') return;
      const mods = sim.players[e.owner]?.mods;
      if (!mods?.jungleAmbush) {
        e.hiddenInJungle = false;
        return;
      }
      if (sim.tick - e.lastCombatTick < 60 || sim.tick - e.lastAttackedTick < 60) {
        e.hiddenInJungle = false;
        return;
      }
      e.hiddenInJungle = this.nearJungle(sim.grid, e.x | 0, e.z | 0);
    });

    this.version++;
  }

  nearJungle(grid, x, z) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (grid.typeAt(x + dx, z + dz) === TileType.JUNGLE) return true;
      }
    }
    return false;
  }

  tileVisible(owner, x, z) {
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return false;
    return this.visible[owner][z * GRID + x] === 1;
  }

  tileExplored(owner, x, z) {
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return false;
    return this.explored[owner][z * GRID + x] === 1;
  }

  // Can `viewer` (player index) see entity `e` right now?
  // Buildings stay visible once their tile is explored (AoE-style);
  // units need current vision and ambushed units stay hidden.
  entityVisible(viewer, e) {
    if (e.owner === viewer) return true;
    if (e.kind === 'building') return this.tileExplored(viewer, e.x | 0, e.z | 0);
    if (e.hiddenInJungle) return false;
    return this.tileVisible(viewer, e.x | 0, e.z | 0);
  }
}
