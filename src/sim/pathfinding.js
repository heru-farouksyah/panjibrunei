import { GRID } from './constants.js';

const DIAG = Math.SQRT2;
const MAX_EXPANSIONS = 6000;
const CACHE_MAX = 300;

class BinaryHeap {
  constructor() {
    this.items = [];   // node indices
    this.scores = [];  // f-scores, parallel
  }
  get size() {
    return this.items.length;
  }
  push(item, score) {
    this.items.push(item);
    this.scores.push(score);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const lastI = this.items.pop();
    const lastS = this.scores.pop();
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.scores[0] = lastS;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.scores[l] < this.scores[m]) m = l;
        if (r < this.items.length && this.scores[r] < this.scores[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  swap(a, b) {
    const ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    const ts = this.scores[a];
    this.scores[a] = this.scores[b];
    this.scores[b] = ts;
  }
  clear() {
    this.items.length = 0;
    this.scores.length = 0;
  }
}

// A* over the tile grid with a per-tick request budget and an LRU path cache,
// so 200 simultaneous orders can't spike a tick.
export class Pathfinder {
  constructor(grid) {
    this.grid = grid;
    this.queue = [];
    this.budgetPerTick = 6;
    this.cache = new Map(); // key -> waypoint array (shared, read-only)
    // Reusable search state, generation-stamped to avoid clearing.
    this.g = new Float32Array(GRID * GRID);
    this.parent = new Int32Array(GRID * GRID);
    this.openStamp = new Int32Array(GRID * GRID);
    this.closedStamp = new Int32Array(GRID * GRID);
    this.generation = 0;
    this.heap = new BinaryHeap();
  }

  // Nearest passable tile to (tx, tz), spiraling outward. Returns index or -1.
  nearestPassable(tx, tz, domain, maxR = 6) {
    if (this.grid.passable(tx, tz, domain)) return tz * GRID + tx;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = tx + dx;
          const z = tz + dz;
          if (this.grid.passable(x, z, domain)) return z * GRID + x;
        }
      }
    }
    return -1;
  }

  findPath(sx, sz, tx, tz, domain) {
    sx |= 0; sz |= 0; tx |= 0; tz |= 0;
    const key = `${domain}:${sx},${sz}>${tx},${tz}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      // refresh LRU position
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const targetIdx = this.nearestPassable(tx, tz, domain);
    if (targetIdx < 0) return null;
    const goalX = targetIdx % GRID;
    const goalZ = (targetIdx / GRID) | 0;

    const grid = this.grid;
    const gen = ++this.generation;
    const heap = this.heap;
    heap.clear();

    const startIdx = sz * GRID + sx;
    this.g[startIdx] = 0;
    this.parent[startIdx] = -1;
    this.openStamp[startIdx] = gen;
    heap.push(startIdx, 0);

    let bestIdx = startIdx;
    let bestH = Math.hypot(goalX - sx, goalZ - sz);
    let found = false;
    let expansions = 0;

    while (heap.size > 0 && expansions < MAX_EXPANSIONS) {
      const cur = heap.pop();
      if (this.closedStamp[cur] === gen) continue;
      this.closedStamp[cur] = gen;
      expansions++;

      if (cur === targetIdx) {
        found = true;
        bestIdx = cur;
        break;
      }

      const cx = cur % GRID;
      const cz = (cur / GRID) | 0;
      const h = octile(goalX - cx, goalZ - cz);
      if (h < bestH) {
        bestH = h;
        bestIdx = cur;
      }

      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!grid.passable(nx, nz, domain)) continue;
          // no cutting corners diagonally
          if (dx !== 0 && dz !== 0 &&
              (!grid.passable(cx + dx, cz, domain) || !grid.passable(cx, cz + dz, domain))) {
            continue;
          }
          const ni = nz * GRID + nx;
          if (this.closedStamp[ni] === gen) continue;
          const step = dx !== 0 && dz !== 0 ? DIAG : 1;
          const ng = this.g[cur] + step;
          if (this.openStamp[ni] === gen && ng >= this.g[ni]) continue;
          this.g[ni] = ng;
          this.parent[ni] = cur;
          this.openStamp[ni] = gen;
          // weighted A* (1.2): far fewer expansions, near-optimal paths
          heap.push(ni, ng + 1.2 * octile(goalX - nx, goalZ - nz));
        }
      }
    }

    // Reconstruct from goal (or closest approach if unreachable).
    const path = [];
    let node = found ? targetIdx : bestIdx;
    while (node !== -1 && node !== startIdx) {
      path.push({ x: (node % GRID) + 0.5, z: ((node / GRID) | 0) + 0.5 });
      node = this.parent[node];
    }
    path.reverse();
    if (path.length === 0) return null;

    this.cache.set(key, path);
    if (this.cache.size > CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value);
    }
    return path;
  }

  // Queue a path request; resolved within the per-tick budget, FIFO.
  request(req) {
    this.queue.push(req);
  }

  processQueue(sim) {
    let budget = this.budgetPerTick;
    while (budget > 0 && this.queue.length > 0) {
      const req = this.queue.shift();
      budget--;
      req.resolve(sim, this);
    }
  }
}

function octile(dx, dz) {
  dx = Math.abs(dx);
  dz = Math.abs(dz);
  return Math.max(dx, dz) + (DIAG - 1) * Math.min(dx, dz);
}
