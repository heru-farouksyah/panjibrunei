// SIMULATION (Phase 1 = the logical map only; entities/economy arrive in later
// phases). Everything here is pure grid data — no Three.js. The presentation
// layer reads this through gridToWorld().  (§3)

import { GRID_W, GRID_H } from './config.js';

export const TYPE = { DEEP: 0, RIVER: 1, LANE: 2, JUNGLE: 3, BASE: 4, TURRET: 5, EPIC: 6 };

// Build the 2-lane map: bases at each end, a top + bottom lane, a river band
// down the middle with the Epic pit, and jungle camps flanking the lanes.
export function createMap() {
  const W = GRID_W, H = GRID_H;
  const type = new Uint8Array(W * H);
  const height = new Float32Array(W * H);        // seabed/island height (water sits at 0)
  const at = (c, r) => r * W + c;

  const midR = (H - 1) / 2;
  const bases = [{ c: 7, r: Math.round(midR), team: 0 }, { c: W - 8, r: Math.round(midR), team: 1 }];
  const laneRows = [7, H - 8];                    // top + bottom lanes
  const lanes = laneRows.map((lr) => { const p = []; for (let c = bases[0].c; c <= bases[1].c; c++) p.push({ c, r: lr }); return p; });
  const turrets = [];
  for (const lr of laneRows) for (const f of [0.26, 0.5, 0.74]) {
    const c = Math.round(bases[0].c + (bases[1].c - bases[0].c) * f);
    turrets.push({ c, r: lr, team: f < 0.5 ? 0 : 1 });
  }
  const epic = { c: Math.round((W - 1) / 2), r: Math.round(midR) };
  const camps = [{ c: 22, r: 14 }, { c: W - 23, r: 14 }, { c: 22, r: H - 15 }, { c: W - 23, r: H - 15 }];

  // base heightfield: deep water everywhere, a calmer/deeper river band centre
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    let t = TYPE.DEEP, h = -3.4 - Math.cos((c / W) * Math.PI) * 0.6;
    if (Math.abs(r - midR) < 3.2) { t = TYPE.RIVER; h = -3.8; }
    type[at(c, r)] = t; height[at(c, r)] = h;
  }
  // lanes = shallow routes (lighter water reads as a path)
  for (const lr of laneRows) for (let c = bases[0].c - 1; c <= bases[1].c + 1; c++)
    for (let dr = -1; dr <= 1; dr++) { const rr = lr + dr, i = at(c, rr); if (rr >= 0 && rr < H) { type[i] = TYPE.LANE; height[i] = -1.0; } }

  // raise structures into islands above the waterline
  const raise = (c, r, rad, h, t) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const fall = 1 - Math.hypot(dc, dr) / (rad + 0.001); if (fall <= 0) continue; const i = at(cc, rr); const nh = h * Math.min(1, fall * 1.4); if (nh > height[i]) { height[i] = nh; type[i] = t; } } };
  for (const b of bases) raise(b.c, b.r, 5.5, 1.7, TYPE.BASE);
  for (const t of turrets) raise(t.c, t.r, 1.8, 1.0, TYPE.TURRET);
  for (const cmp of camps) raise(cmp.c, cmp.r, 2.6, 0.7, TYPE.JUNGLE);
  // Epic: a ring island around a central pit (arena over the river)
  raise(epic.c, epic.r, 4.2, 0.9, TYPE.JUNGLE);
  raise(epic.c, epic.r, 2.0, -3.0, TYPE.EPIC);

  return { W, H, type, height, at, bases, lanes, laneRows, turrets, camps, epic };
}
