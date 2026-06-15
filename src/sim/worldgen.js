import { GRID, TileType, WATER_LEVEL, NODE_AMOUNT, FISH_AMOUNT } from './constants.js';
import { Grid } from './grid.js';
import { mulberry32, hash2, fbm } from './rng.js';

const RIVER_SAMPLES = 256;
const FORD_TS = [0.34, 0.67];      // where the two fords sit along the river
const FORD_HALF_T = 0.022;         // ford strip half-width in river param t

const BED_DEPTH = -0.55;           // river bed at channel center
const FORD_BED = 0.27;             // ford bar pokes just above WATER_LEVEL
const BANK_H = 0.5;                // land height right at the channel edge

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildRiver(seed, size) {
  const points = [];
  const phase = hash2(seed, 11, 7) * Math.PI * 2;
  for (let i = 0; i <= RIVER_SAMPLES; i++) {
    const t = i / RIVER_SAMPLES;
    const x = t * size;
    const y =
      size / 2 +
      Math.sin(t * Math.PI * 2 * 1.1 + phase) * 9 +
      (fbm(seed + 31, t * 5, 0.5, 3) - 0.5) * 14;
    points.push({ x, y, t });
  }
  const widthAt = (t) =>
    2.5 + Math.sin(t * 6.3 + phase) * 0.5 + (fbm(seed + 47, t * 8, 3.7, 2) - 0.5) * 1.2;
  const isFordT = (t) => FORD_TS.some((f) => Math.abs(t - f) < FORD_HALF_T);
  return { points, widthAt, isFordT };
}

function riverInfo(river, x, y) {
  let best = Infinity;
  let bestT = 0;
  for (const p of river.points) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bestT = p.t;
    }
  }
  return { dist: Math.sqrt(best), t: bestT };
}

function placeCluster(grid, rng, river, cx, cy, radius, type, count) {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < 200) {
    const ang = rng() * Math.PI * 2;
    const r = rng() * radius;
    const x = Math.round(cx + Math.cos(ang) * r);
    const y = Math.round(cy + Math.sin(ang) * r);
    if (!grid.inBounds(x, y)) continue;
    const t = grid.typeAt(x, y);
    if (t !== TileType.GRASS && t !== TileType.EARTH) continue;
    grid.setType(x, y, type);
    placed++;
  }
}

export function generateWorld(seed = 1337, numZones = 2, size = GRID) {
  const rng = mulberry32(seed);
  const grid = new Grid(size);
  const river = buildRiver(seed, size);

  // Start zones spread around the map (player + rival kingdoms). Only as many
  // as there are players are generated, so a 2-player map is identical to the
  // classic layout (keeps seeded sim tests stable).
  const M = 18;
  const CANDIDATES = [
    { x: M, y: M },               // 0 player — NW
    { x: size - M, y: size - M }, // 1 — SE (farthest)
    { x: size - M, y: M },        // 2 — NE
    { x: M, y: size - M },        // 3 — SW
    { x: size / 2, y: M - 2 },    // 4 — N-centre
  ];
  const starts = CANDIDATES.slice(0, Math.max(2, Math.min(5, numZones)));
  grid.startZones = starts;

  // --- Heightfield (vertex grid, (size+1)^2) ---
  const n = size + 1;
  for (let vz = 0; vz < n; vz++) {
    for (let vx = 0; vx < n; vx++) {
      let h =
        0.45 +
        fbm(seed, vx * 0.045, vz * 0.045, 4) * 2.4 +
        fbm(seed + 7, vx * 0.16, vz * 0.16, 2) * 0.3;

      // Gentle plateaus at the start zones so bases sit on level ground.
      for (const s of starts) {
        const d = Math.hypot(vx - s.x, vz - s.y);
        if (d < 11) h = lerp(1.0, h, smoothstep(6, 11, d));
      }

      // Carve the river: bed at center, rising to low banks, then blending
      // back into the rolling terrain over a sandy margin.
      const { dist, t } = riverInfo(river, vx, vz);
      const w = river.widthAt(t);
      const bed = river.isFordT(t)
        ? FORD_BED + (fbm(seed + 53, vx * 0.3, vz * 0.3, 2) - 0.5) * 0.06
        : BED_DEPTH;
      if (dist < w) {
        const u = dist / w;
        h = lerp(bed, BANK_H, u * u);
      } else if (dist < w + 2.8) {
        h = lerp(BANK_H + 0.06, Math.max(h, BANK_H), smoothstep(w, w + 2.8, dist));
      }

      grid.vertexHeights[vz * n + vx] = h;
    }
  }

  // --- Tile classification ---
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const { dist, t } = riverInfo(river, cx, cy);
      const w = river.widthAt(t);
      let type;
      if (dist < w * 0.94) {
        type = river.isFordT(t) ? TileType.FORD : TileType.WATER;
      } else if (dist < w + 1.7) {
        type = TileType.SAND;
      } else if (fbm(seed + 13, cx * 0.08, cy * 0.08, 3) > 0.63) {
        type = TileType.EARTH;
      } else {
        type = TileType.GRASS;
      }
      grid.setType(x, y, type);
    }
  }

  // --- Jungle clusters (dense, tropical — but clear of river + start zones) ---
  const jungleClusters = 24;
  for (let i = 0; i < jungleClusters; i++) {
    let guard = 0;
    while (guard++ < 60) {
      const cx = 4 + rng() * (size - 8);
      const cy = 4 + rng() * (size - 8);
      const { dist, t } = riverInfo(river, cx, cy);
      if (dist < river.widthAt(t) + 3.5) continue;
      if (starts.some((s) => Math.hypot(cx - s.x, cy - s.y) < 13)) continue;
      const r = 2.5 + rng() * 3.5;
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          if (!grid.inBounds(x, y)) continue;
          const edge = (fbm(seed + 71, x * 0.35, y * 0.35, 2) - 0.5) * 2.4;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + edge > r) continue;
          const tt = grid.typeAt(x, y);
          if (tt === TileType.GRASS || tt === TileType.EARTH) {
            grid.setType(x, y, TileType.JUNGLE);
          }
        }
      }
      break;
    }
  }

  // --- Resource patches near each start zone + neutral middle ---
  for (const s of starts) {
    // sago grove: the early food source, close to base
    const sa = rng() * Math.PI * 2;
    placeCluster(grid, rng, river, s.x + Math.cos(sa) * 7, s.y + Math.sin(sa) * 7, 1.8, TileType.SAGO, 5);
    // small timber grove close to base
    const ja = rng() * Math.PI * 2;
    placeCluster(grid, rng, river, s.x + Math.cos(ja) * 8, s.y + Math.sin(ja) * 8, 2.2, TileType.JUNGLE, 7);
    // gold mine rocks
    const ga = rng() * Math.PI * 2;
    placeCluster(grid, rng, river, s.x + Math.cos(ga) * 11, s.y + Math.sin(ga) * 11, 2.0, TileType.GOLD, 4);
    // camphor grove, farther out
    const ca = rng() * Math.PI * 2;
    placeCluster(grid, rng, river, s.x + Math.cos(ca) * 16, s.y + Math.sin(ca) * 16, 2.2, TileType.CAMPHOR, 3);
  }
  // neutral contested resources near (but not in) the river midline
  placeCluster(grid, rng, river, size * 0.5 + 9, size * 0.32, 2.5, TileType.GOLD, 4);
  placeCluster(grid, rng, river, size * 0.5 - 9, size * 0.68, 2.5, TileType.GOLD, 4);
  placeCluster(grid, rng, river, size * 0.32, size * 0.5, 2.5, TileType.CAMPHOR, 4);
  placeCluster(grid, rng, river, size * 0.68, size * 0.5, 2.5, TileType.CAMPHOR, 4);

  // Keep a clear ring at the exact start tiles (build space).
  for (const s of starts) {
    for (let y = s.y - 4; y <= s.y + 4; y++) {
      for (let x = s.x - 4; x <= s.x + 4; x++) {
        if (!grid.inBounds(x, y)) continue;
        const tt = grid.typeAt(x, y);
        if (tt === TileType.JUNGLE || tt === TileType.GOLD ||
            tt === TileType.CAMPHOR || tt === TileType.SAGO) {
          grid.setType(x, y, TileType.GRASS);
        }
      }
    }
  }

  // --- Resource amounts on node tiles ---
  for (let i = 0; i < size * size; i++) {
    const amount = NODE_AMOUNT[grid.types[i]];
    if (amount) grid.resources[i] = amount;
  }

  // --- Fish spots: spread along the river, min spacing so they're contested ---
  const fishPlaced = [];
  for (let y = 2; y < size - 2; y += 2) {
    for (let x = 2; x < size - 2; x += 2) {
      if (grid.typeAt(x, y) !== TileType.WATER) continue;
      if (hash2(seed + 200, x, y) > 0.1) continue;
      if (fishPlaced.some((f) => Math.hypot(f.x - x, f.y - y) < 7)) continue;
      fishPlaced.push({ x, y });
      const i = grid.idx(x, y);
      grid.fishTiles.add(i);
      grid.resources[i] = FISH_AMOUNT;
      grid.props.push({
        type: 'fish_spot',
        x: x + 0.5,
        z: y + 0.5,
        rot: hash2(seed + 201, x, y) * Math.PI * 2,
        scale: 1,
      });
    }
  }

  // --- Prop placements (deterministic, consumed by the render layer) ---
  const props = grid.props;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = grid.typeAt(x, y);
      const h = hash2(seed + 91, x, y);
      if (t === TileType.JUNGLE) {
        const count = 2 + Math.floor(hash2(seed + 92, x, y) * 2);
        for (let i = 0; i < count; i++) {
          props.push({
            type: 'jungle_tree',
            x: x + 0.15 + hash2(seed + 100 + i, x, y) * 0.7,
            z: y + 0.15 + hash2(seed + 110 + i, x, y) * 0.7,
            rot: hash2(seed + 120 + i, x, y) * Math.PI * 2,
            scale: 0.85 + hash2(seed + 130 + i, x, y) * 0.5,
          });
        }
      } else if (t === TileType.GRASS && h < 0.015) {
        if (grid.startZones.some((s) => Math.hypot(x - s.x, y - s.y) < 6)) continue;
        props.push({
          type: 'jungle_tree',
          x: x + 0.3 + h * 20,
          z: y + 0.3 + hash2(seed + 93, x, y) * 0.4,
          rot: hash2(seed + 94, x, y) * Math.PI * 2,
          scale: 0.8 + hash2(seed + 95, x, y) * 0.45,
        });
      } else if (t === TileType.CAMPHOR) {
        for (let i = 0; i < 3; i++) {
          props.push({
            type: 'camphor_tree',
            x: x + 0.15 + hash2(seed + 140 + i, x, y) * 0.7,
            z: y + 0.15 + hash2(seed + 150 + i, x, y) * 0.7,
            rot: hash2(seed + 160 + i, x, y) * Math.PI * 2,
            scale: 0.9 + hash2(seed + 170 + i, x, y) * 0.35,
          });
        }
      } else if (t === TileType.GOLD) {
        props.push({
          type: 'gold_rock',
          x: x + 0.5,
          z: y + 0.5,
          rot: hash2(seed + 180, x, y) * Math.PI * 2,
          scale: 0.9 + hash2(seed + 190, x, y) * 0.35,
        });
      } else if (t === TileType.SAGO) {
        for (let i = 0; i < 2; i++) {
          props.push({
            type: 'sago_palm',
            x: x + 0.2 + hash2(seed + 210 + i, x, y) * 0.6,
            z: y + 0.2 + hash2(seed + 220 + i, x, y) * 0.6,
            rot: hash2(seed + 230 + i, x, y) * Math.PI * 2,
            scale: 0.85 + hash2(seed + 240 + i, x, y) * 0.35,
          });
        }
      }
    }
  }

  grid.waterLevel = WATER_LEVEL;
  return grid;
}
