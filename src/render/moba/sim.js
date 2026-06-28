// SIMULATION (Phase 1 = the logical map only; entities/economy arrive later).
// Pure grid data — no Three.js. Presentation reads it through gridToWorld(). (§3)
// 2 lanes that CURVE out (a lens shape) around a wide central river + Epic arena.

import { GRID_W, GRID_H } from './config.js';

export const TYPE = { DEEP: 0, RIVER: 1, LANE: 2, JUNGLE: 3, BASE: 4, TURRET: 5, EPIC: 6 };

export function createMap() {
  const W = GRID_W, H = GRID_H;
  const type = new Uint8Array(W * H);
  const height = new Float32Array(W * H);
  const at = (c, r) => r * W + c;
  const midR = (H - 1) / 2;
  const c0 = 7, c1 = W - 8;

  const bases = [{ c: c0, r: Math.round(midR), team: 0 }, { c: c1, r: Math.round(midR), team: 1 }];
  const bow = midR - 5;                                   // how far the lanes arc toward the edges
  const laneRow = (side, u) => midR + side * bow * Math.sin(u * Math.PI);   // side -1 = top lane, +1 = bottom

  const lanes = [-1, 1].map((side) => { const p = []; for (let c = c0; c <= c1; c++) { const u = (c - c0) / (c1 - c0); p.push({ c, r: Math.round(laneRow(side, u)) }); } return p; });
  const turrets = [];
  [-1, 1].forEach((side, li) => { for (const u of [0.27, 0.5, 0.73]) { const c = Math.round(c0 + (c1 - c0) * u); turrets.push({ c, r: Math.round(laneRow(side, u)), team: u < 0.5 ? 0 : 1, lane: li }); } });
  const epic = { c: Math.round((W - 1) / 2), r: Math.round(midR) };
  const camps = [{ c: 24, r: 11 }, { c: W - 25, r: 11 }, { c: 24, r: H - 12 }, { c: W - 25, r: H - 12 }];

  // base heightfield: deep water, with a wider/deeper river band down the middle
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    let t = TYPE.DEEP, h = -3.4 - Math.cos((c / W) * Math.PI) * 0.5;
    if (Math.abs(r - midR) < 4.5) { t = TYPE.RIVER; h = -4.0; }
    type[at(c, r)] = t; height[at(c, r)] = h;
  }
  // rasterize the curved lanes as shallow routes (width 3)
  const paint = (c, r, t, h) => { if (c < 0 || r < 0 || c >= W || r >= H) return; const i = at(c, r); type[i] = t; height[i] = h; };
  for (const path of lanes) for (const p of path) for (let dr = -1; dr <= 1; dr++) paint(p.c, p.r + dr, TYPE.LANE, -0.9);

  // raise islands above the waterline
  const raise = (c, r, rad, h, t) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const f = 1 - Math.hypot(dc, dr) / (rad + 0.001); if (f <= 0) continue; const i = at(cc, rr); const nh = h * Math.min(1, f * 1.4); if ((h > 0 && nh > height[i]) || (h < 0 && nh < height[i])) { height[i] = nh; type[i] = t; } } };
  for (const b of bases) raise(b.c, b.r, 6, 1.9, TYPE.BASE);
  for (const t of turrets) raise(t.c, t.r, 2.0, 1.0, TYPE.TURRET);
  for (const cmp of camps) raise(cmp.c, cmp.r, 2.6, 0.7, TYPE.JUNGLE);
  // Epic: a ring island arena around a central pit, sitting in the river
  raise(epic.c, epic.r, 5.4, 1.1, TYPE.JUNGLE);
  raise(epic.c, epic.r, 2.6, -3.4, TYPE.EPIC);

  return { W, H, type, height, at, bases, lanes, laneRow, turrets, camps, epic };
}
