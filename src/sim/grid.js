import { GRID, TileType } from './constants.js';

// Logical tile grid. Owns tile types and the heightfield (vertex heights are
// (GRID+1)^2 so the render layer can build a mesh without recomputing).
export class Grid {
  constructor() {
    this.size = GRID;
    this.types = new Uint8Array(GRID * GRID);
    this.vertexHeights = new Float32Array((GRID + 1) * (GRID + 1));
    this.startZones = []; // [{x, y}] tile coords, player first
    this.props = [];      // [{type, x, z, rot, scale}] world-space placements
    this.occupied = new Int32Array(GRID * GRID);  // building entity id + 1, 0 = free
    this.resources = new Float32Array(GRID * GRID); // remaining amount on node tiles
    this.fishTiles = new Set(); // tile indices of water tiles holding fish
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  idx(x, y) {
    return y * this.size + x;
  }

  typeAt(x, y) {
    if (!this.inBounds(x, y)) return TileType.WATER;
    return this.types[this.idx(x, y)];
  }

  setType(x, y, t) {
    if (this.inBounds(x, y)) this.types[this.idx(x, y)] = t;
  }

  vertexHeight(vx, vy) {
    const n = this.size + 1;
    vx = Math.max(0, Math.min(this.size, vx));
    vy = Math.max(0, Math.min(this.size, vy));
    return this.vertexHeights[vy * n + vx];
  }

  // Bilinear terrain height at world coords (x = tile x, z = tile y).
  heightAt(x, z) {
    const cx = Math.max(0, Math.min(this.size - 1e-4, x));
    const cz = Math.max(0, Math.min(this.size - 1e-4, z));
    const ix = Math.floor(cx);
    const iz = Math.floor(cz);
    const fx = cx - ix;
    const fz = cz - iz;
    const h00 = this.vertexHeight(ix, iz);
    const h10 = this.vertexHeight(ix + 1, iz);
    const h01 = this.vertexHeight(ix, iz + 1);
    const h11 = this.vertexHeight(ix + 1, iz + 1);
    return (
      h00 * (1 - fx) * (1 - fz) +
      h10 * fx * (1 - fz) +
      h01 * (1 - fx) * fz +
      h11 * fx * fz
    );
  }

  isWater(x, y) {
    return this.typeAt(x, y) === TileType.WATER;
  }

  occupiedBy(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.occupied[this.idx(x, y)] - 1; // -1 = free
  }

  // Land units cross everything except deep water, jungle and resource rocks.
  isLandPassable(x, y) {
    if (!this.inBounds(x, y)) return false;
    if (this.occupied[this.idx(x, y)]) return false;
    const t = this.types[this.idx(x, y)];
    return t !== TileType.WATER && t !== TileType.JUNGLE &&
           t !== TileType.GOLD && t !== TileType.CAMPHOR && t !== TileType.SAGO;
  }

  isWaterPassable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const t = this.types[this.idx(x, y)];
    return t === TileType.WATER || t === TileType.FORD;
  }

  passable(x, y, domain) {
    return domain === 'water' ? this.isWaterPassable(x, y) : this.isLandPassable(x, y);
  }
}
