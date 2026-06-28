// Shared grid ⇄ world config for the naval MOBA (Defence of Kampong Ayer).
// SIMULATION owns truth in grid coords; PRESENTATION owns this single transform.
// Terrain on XZ, Y up, water at Y≈0.  (§3 / §5 of the spec.)

export const TILE = 2.5;            // world units per grid tile
export const GRID_W = 84;           // logical grid columns (lane length axis = x) — bigger arena
export const GRID_H = 54;           // logical grid rows       (cross axis      = z)
export const WATER_Y = 0;

export const MAP_W = GRID_W * TILE;
export const MAP_H = GRID_H * TILE;

// grid (col,row) → world (x,y,z). Map is centred on the origin.
export function gridToWorld(c, r, y = WATER_Y) {
  return { x: (c - (GRID_W - 1) / 2) * TILE, y, z: (r - (GRID_H - 1) / 2) * TILE };
}

// world (x,z) → nearest grid (col,row). Inverse of gridToWorld (for raycast picking, §3).
export function worldToGrid(x, z) {
  return {
    c: Math.round(x / TILE + (GRID_W - 1) / 2),
    r: Math.round(z / TILE + (GRID_H - 1) / 2),
  };
}
