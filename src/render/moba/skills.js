// Hero kits (ML-style): a passive flavour + 2 skills + an ultimate, each with a
// cooldown + Powder cost, skill leveling, and water-surface telegraphs/VFX.  (§7.3, §8.3)
//
// The shared ENGINE (Powder, XP/leveling, cooldowns, timers) lives in makeKit().
// Each hero supplies a fresh `skills` array; every skill is { key,name,letter,cd,
// cost,t,level,max,desc, cast(ctx) }. ctx = { hero, s, f(forward dir), p(hero.pos),
// addVfx, enemiesNear, hit, after, ring(ringMat), THREE }.

import * as THREE from 'three';

const ringMat = (c, o = 0.6) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false });

// ---- shared kit engine -----------------------------------------------------
export function makeKit(skills, { hero, addVfx, enemiesNear = () => [], hit = () => {}, onLevel = () => {} }) {
  const powderMax = 100; let powder = 100, powderRegen = 12;
  let heroLevel = 1, points = 1, xp = 0;
  const xpNeed = () => 100 + (heroLevel - 1) * 70;
  function gainXp(n) { if (heroLevel >= 15) return; xp += n; while (heroLevel < 15 && xp >= xpNeed()) { xp -= xpNeed(); heroLevel++; points++; onLevel(heroLevel); } }
  const timers = [];
  const after = (d, fn) => timers.push({ d, fn });
  const fwd = () => ({ x: Math.cos(hero.yaw), z: -Math.sin(hero.yaw) });   // ship +x forward → world dir
  const cdOf = (s) => s.cd * (1 - 0.05 * (s.level - 1));
  function tryCast(i) {
    const s = skills[i]; if (!s || s.t > 0 || powder < s.cost) return false;
    powder -= s.cost; s.t = cdOf(s);
    s.cast({ hero, s, f: fwd(), p: hero.pos, addVfx, enemiesNear, hit, after, ring: ringMat, THREE });
    return true;
  }
  function levelUp(i) { const s = skills[i]; if (!s || points <= 0 || s.level >= s.max) return false; s.level++; points--; return true; }
  function tick(dt) {
    powder = Math.min(powderMax, powder + dt * powderRegen);
    for (const s of skills) if (s.t > 0) s.t = Math.max(0, s.t - dt);
    for (let j = timers.length - 1; j >= 0; j--) { timers[j].d -= dt; if (timers[j].d <= 0) { timers[j].fn(); timers.splice(j, 1); } }
  }
  const boostPowder = (m) => { powderRegen *= m; };
  return { skills, cdOf, tryCast, levelUp, tick, gainXp, boostPowder, get powder() { return powder; }, powderMax, get heroLevel() { return heroLevel; }, get points() { return points; }, get xp() { return xp; }, get xpNeed() { return xpNeed(); } };
}

// ---- Bahtera (Traditional TANK): Ram dash, Boarding Hook, Broadside volley -----
export const bahteraSkills = () => [
  { key: 'ram', name: 'Ram', letter: 'R', cd: 6, cost: 25, t: 0, level: 1, max: 4, desc: 'Dash forward, knock back', cast: (c) => {
    const { hero, s, f, addVfx, enemiesNear, hit, after, ring, THREE } = c;
    hero.dash = { dx: f.x, dz: f.z, spd: 34, t: 0.32 };
    for (let k = 0; k < 4; k++) after(k * 0.05, () => { const r = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 20), ring(0x9fe8ff, 0.5)); r.rotation.x = -Math.PI / 2; r.position.set(hero.pos.x, 0.2, hero.pos.z); addVfx(r, 0.5, (dt, o) => { r.scale.setScalar(1 + (o.t / o.life) * 2); r.material.opacity = 0.5 * (1 - o.t / o.life); }); });
    after(0.34, () => { const ex = hero.pos.x + f.x * 2, ez = hero.pos.z + f.z * 2; const sh = new THREE.Mesh(new THREE.RingGeometry(0.5, 3 + s.level * 0.4, 28), ring(0xfff0c0, 0.7)); sh.rotation.x = -Math.PI / 2; sh.position.set(ex, 0.22, ez); addVfx(sh, 0.5, (dt, o) => { sh.scale.setScalar(1 + (o.t / o.life) * 1.5); sh.material.opacity = 0.7 * (1 - o.t / o.life); }); hero.target.copy(hero.pos); for (const e of enemiesNear(ex, ez, 4.6, 0)) hit(e, 70 + s.level * 22, { knockback: { x: f.x, z: f.z }, stun: 0.4, byHero: true }); });
  } },
  { key: 'hook', name: 'Boarding Hook', letter: 'H', cd: 8, cost: 30, t: 0, level: 1, max: 4, desc: 'Pull nearest, slow', cast: (c) => {
    const { hero, s, f, p, addVfx, enemiesNear, hit, THREE } = c;
    const range = 10 + s.level * 1.2;
    const hook = new THREE.Group();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), new THREE.MeshBasicMaterial({ color: 0xcfcfcf })); line.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6, roughness: 0.4 })); head.rotation.z = -Math.PI / 2;
    hook.add(line); hook.add(head); hook.position.set(p.x, 0.7, p.z); hook.rotation.y = hero.yaw;
    addVfx(hook, 0.7, (dt, o) => { const u = o.t / o.life; const reach = (u < 0.5 ? u * 2 : (1 - u) * 2) * range; line.scale.x = Math.max(0.1, reach); line.position.x = reach / 2; head.position.x = reach; });
    const cand = enemiesNear(p.x, p.z, range, 0).filter((e) => { const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1; return (dx / d) * f.x + (dz / d) * f.z > 0.2; }).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    if (cand[0]) hit(cand[0], 60 + s.level * 18, { pull: { x: p.x, z: p.z }, slow: 1.6, byHero: true });
  } },
  { key: 'ult', name: 'Broadside', letter: 'B', cd: 28, cost: 60, t: 0, level: 1, max: 3, desc: 'Channel → cannon fan + stun', cast: (c) => {
    const { hero, s, addVfx, enemiesNear, hit, after, ring, THREE } = c;
    hero.rooted = true;
    const arc = new THREE.Mesh(new THREE.RingGeometry(2, 9 + s.level, 24, 1, -Math.PI / 3, Math.PI * 2 / 3), ring(0xffb060, 0.35)); arc.rotation.x = -Math.PI / 2;
    const place = () => { arc.position.set(hero.pos.x, 0.21, hero.pos.z); arc.rotation.z = -hero.yaw; };
    place(); addVfx(arc, 1.2, (dt, o) => { place(); arc.material.opacity = 0.2 + 0.18 * Math.sin(o.t * 12); });
    after(1.2, () => {
      hero.rooted = false; const hp = hero.pos.clone(), yaw = hero.yaw;
      for (let k = -2; k <= 2; k++) { const ang = yaw + k * 0.28, dir = { x: Math.cos(ang), z: -Math.sin(ang) }; const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.5, roughness: 0.4 })); ball.position.set(hp.x, 0.9, hp.z); addVfx(ball, 0.8, (dt, o) => { const d = o.t * 22; ball.position.set(hp.x + dir.x * d, 0.9 + Math.sin((o.t / o.life) * Math.PI) * 2.6, hp.z + dir.z * d); }); }
      const st = new THREE.Mesh(new THREE.RingGeometry(1, 7, 28), ring(0xffe080, 0.6)); st.rotation.x = -Math.PI / 2; st.position.set(hp.x + Math.cos(yaw) * 5, 0.22, hp.z - Math.sin(yaw) * 5); addVfx(st, 0.6, (dt, o) => { st.scale.setScalar(1 + (o.t / o.life) * 1.4); st.material.opacity = 0.6 * (1 - o.t / o.life); });
      for (const e of enemiesNear(hp.x, hp.z, 11 + s.level, 0)) { const dx = e.x - hp.x, dz = e.z - hp.z, d = Math.hypot(dx, dz) || 1; if ((dx / d) * Math.cos(yaw) + (dz / d) * (-Math.sin(yaw)) > 0.25) hit(e, 120 + s.level * 40, { stun: 1.0, byHero: true }); }
    });
  } },
];

// ---- Meriam (Traditional ARTILLERY): Barrage AoE, Chain Shot line, Bombardment ult --
export const meriamSkills = () => [
  { key: 'barrage', name: 'Barrage', letter: 'Q', cd: 6, cost: 25, t: 0, level: 1, max: 4, desc: 'Lob shells at a spot ahead', cast: (c) => {
    const { f, p, s, addVfx, enemiesNear, hit, after, ring, THREE } = c;
    const tx = p.x + f.x * 14, tz = p.z + f.z * 14, R = 4 + s.level * 0.5;
    const tel = new THREE.Mesh(new THREE.RingGeometry(0.4, R, 24), ring(0xffc060, 0.4)); tel.rotation.x = -Math.PI / 2; tel.position.set(tx, 0.22, tz); addVfx(tel, 0.7, (dt, o) => { tel.material.opacity = 0.4 * (1 - o.t / o.life); });
    for (let k = 0; k < 5; k++) after(k * 0.05, () => { const ox = tx + (Math.cos(k) * 4), oz = tz + (Math.sin(k * 2) * 4); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.5, roughness: 0.4 })); const sx = p.x, sz = p.z; addVfx(ball, 0.5, (dt, o) => { const u = o.t / o.life; ball.position.set(sx + (ox - sx) * u, 0.9 + Math.sin(u * Math.PI) * 5, sz + (oz - sz) * u); }); });
    after(0.55, () => { const bl = new THREE.Mesh(new THREE.RingGeometry(0.4, R, 24), ring(0xff8030, 0.7)); bl.rotation.x = -Math.PI / 2; bl.position.set(tx, 0.22, tz); addVfx(bl, 0.45, (dt, o) => { bl.scale.setScalar(1 + o.t * 2); bl.material.opacity = 0.7 * (1 - o.t / o.life); }); for (const e of enemiesNear(tx, tz, R, 0)) hit(e, 75 + s.level * 22, { byHero: true }); });
  } },
  { key: 'chain', name: 'Chain Shot', letter: 'W', cd: 7, cost: 28, t: 0, level: 1, max: 4, desc: 'Piercing line, slows', cast: (c) => {
    const { hero, f, p, s, addVfx, enemiesNear, hit, THREE } = c;
    const len = 13; const proj = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshStandardMaterial({ color: 0x44484c, metalness: 0.6, roughness: 0.4 }));
    const sx = p.x, sz = p.z; addVfx(proj, 0.45, (dt, o) => { const u = o.t / o.life; proj.position.set(sx + f.x * len * u, 0.7, sz + f.z * len * u); });
    for (const e of enemiesNear(p.x, p.z, len, 0)) { const dx = e.x - p.x, dz = e.z - p.z; const along = dx * f.x + dz * f.z, perp = Math.abs(dx * f.z - dz * f.x); if (along > 0 && along < len && perp < 2.2) hit(e, 58 + s.level * 18, { slow: 1.8, byHero: true }); }
  } },
  { key: 'bombard', name: 'Bombardment', letter: 'B', cd: 30, cost: 60, t: 0, level: 1, max: 3, desc: 'Heavy delayed shelling + stun', cast: (c) => {
    const { f, p, s, addVfx, enemiesNear, hit, after, ring, THREE } = c;
    const tx = p.x + f.x * 12, tz = p.z + f.z * 12, R = 8 + s.level;
    const tel = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R, 40), ring(0xff5030, 0.5)); tel.rotation.x = -Math.PI / 2; tel.position.set(tx, 0.22, tz); addVfx(tel, 1.35, (dt, o) => { tel.material.opacity = 0.3 + 0.2 * Math.sin(o.t * 10); });
    for (let k = 0; k < 10; k++) after(0.6 + 0.06 * k, () => { const ox = tx + Math.cos(k * 1.7) * R * 0.8, oz = tz + Math.sin(k * 2.3) * R * 0.8; const fl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, depthWrite: false })); fl.position.set(ox, 0.4, oz); addVfx(fl, 0.4, (dt, o) => { fl.scale.setScalar(1 + o.t * 3); fl.material.opacity = 0.9 * (1 - o.t / o.life); }); });
    after(1.35, () => { for (const e of enemiesNear(tx, tz, R, 0)) hit(e, 140 + s.level * 45, { stun: 0.8, byHero: true }); });
  } },
];

// ---- Hammerhead (Modern ASSASSIN): Torpedo Dash, Sawblade spin, Apex leap ult ----
export const hammerheadSkills = () => [
  { key: 'torpedo', name: 'Torpedo Dash', letter: 'Q', cd: 5, cost: 22, t: 0, level: 1, max: 4, desc: 'Dash, damage + slow', cast: (c) => {
    const { hero, s, f, addVfx, enemiesNear, hit, after, ring, THREE } = c;
    hero.dash = { dx: f.x, dz: f.z, spd: 40, t: 0.3 };
    for (let k = 0; k < 5; k++) after(k * 0.04, () => { const w = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.0, 16), ring(0x7fdfff, 0.5)); w.rotation.x = -Math.PI / 2; w.position.set(hero.pos.x, 0.2, hero.pos.z); addVfx(w, 0.4, (dt, o) => { w.scale.setScalar(1 + o.t * 2); w.material.opacity = 0.5 * (1 - o.t / o.life); }); });
    after(0.32, () => { for (const e of enemiesNear(hero.pos.x, hero.pos.z, 4, 0)) hit(e, 80 + s.level * 26, { slow: 1.0, byHero: true }); });
  } },
  { key: 'saw', name: 'Sawblade', letter: 'W', cd: 7, cost: 26, t: 0, level: 1, max: 4, desc: 'Spin, hit all around', cast: (c) => {
    const { hero, s, addVfx, enemiesNear, hit, ring, THREE } = c;
    const R = 4 + s.level * 0.4; const saw = new THREE.Mesh(new THREE.RingGeometry(R - 0.6, R, 28), ring(0xcfe8ff, 0.6)); saw.rotation.x = -Math.PI / 2;
    const place = () => saw.position.set(hero.pos.x, 0.22, hero.pos.z); place(); addVfx(saw, 0.5, (dt, o) => { place(); saw.rotation.z += dt * 16; saw.material.opacity = 0.6 * (1 - o.t / o.life); });
    for (const e of enemiesNear(hero.pos.x, hero.pos.z, R, 0)) hit(e, 55 + s.level * 16, { byHero: true });
  } },
  { key: 'apex', name: 'Apex Strike', letter: 'B', cd: 26, cost: 55, t: 0, level: 1, max: 3, desc: 'Leap to a foe, burst + slow', cast: (c) => {
    const { hero, s, f, p, addVfx, enemiesNear, hit, after, ring, THREE } = c;
    const cand = enemiesNear(p.x, p.z, 12, 0).filter((e) => { const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1; return (dx / d) * f.x + (dz / d) * f.z > 0; }).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const tgt = cand[0];
    if (tgt) { const dx = tgt.x - p.x, dz = tgt.z - p.z, D = Math.hypot(dx, dz) || 1; hero.dash = { dx: dx / D, dz: dz / D, spd: Math.min(48, D / 0.3), t: 0.3 }; hero.target.copy(hero.pos); }
    else hero.dash = { dx: f.x, dz: f.z, spd: 38, t: 0.3 };
    after(0.32, () => {
      const e2 = enemiesNear(hero.pos.x, hero.pos.z, 4.5, 0).sort((a, b) => Math.hypot(a.x - hero.pos.x, a.z - hero.pos.z) - Math.hypot(b.x - hero.pos.x, b.z - hero.pos.z))[0];
      if (e2) hit(e2, 180 + s.level * 50, { slow: 1.5, byHero: true });
      const fl = new THREE.Mesh(new THREE.RingGeometry(0.5, 4, 24), ring(0xff7050, 0.7)); fl.rotation.x = -Math.PI / 2; fl.position.set(hero.pos.x, 0.22, hero.pos.z); addVfx(fl, 0.5, (dt, o) => { fl.scale.setScalar(1 + o.t * 2); fl.material.opacity = 0.7 * (1 - o.t / o.life); });
    });
  } },
];
