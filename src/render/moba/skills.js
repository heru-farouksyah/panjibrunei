// Hero kit framework (ML-style): passive + 2 skills + ultimate, with cooldowns,
// a Powder resource, skill leveling, and water-surface telegraphs/VFX.  (§7.3, §8.3)
// Phase 4: no enemies yet, so abilities fire their VFX/telegraphs into the water;
// Phase 5 (minions/turrets) gives them things to actually hit. Values = placeholders.

import * as THREE from 'three';

const ringMat = (c, o = 0.6) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false });

// hero: { pos, yaw, target, dash, rooted } ; addVfx(mesh, life, update(dt,o))
export function makeBahteraKit({ hero, addVfx }) {
  const powderMax = 100; let powder = 100;
  let heroLevel = 1, points = 1, levelT = 0;
  const skills = [
    { key: 'ram', name: 'Ram', letter: 'R', cd: 6, cost: 25, t: 0, level: 1, max: 4, desc: 'Dash + knock back' },
    { key: 'hook', name: 'Boarding Hook', letter: 'H', cd: 8, cost: 30, t: 0, level: 1, max: 4, desc: 'Pull + slow' },
    { key: 'ult', name: 'Broadside', letter: 'B', cd: 28, cost: 60, t: 0, level: 1, max: 3, desc: 'Arc volley + stun' },
  ];
  const timers = [];
  const after = (d, fn) => timers.push({ d, fn });
  const fwd = () => ({ x: Math.cos(hero.yaw), z: -Math.sin(hero.yaw) });   // ship +x forward → world dir
  const cdOf = (s) => s.cd * (1 - 0.05 * (s.level - 1));

  function tryCast(i) {
    const s = skills[i]; if (!s || s.t > 0 || powder < s.cost) return false;
    powder -= s.cost; s.t = cdOf(s);
    const f = fwd(), p = hero.pos;
    if (s.key === 'ram') {
      hero.dash = { dx: f.x, dz: f.z, spd: 34, t: 0.32 };
      for (let k = 0; k < 4; k++) after(k * 0.05, () => { const r = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 20), ringMat(0x9fe8ff, 0.5)); r.rotation.x = -Math.PI / 2; r.position.set(hero.pos.x, 0.2, hero.pos.z); addVfx(r, 0.5, (dt, o) => { r.scale.setScalar(1 + (o.t / o.life) * 2); r.material.opacity = 0.5 * (1 - o.t / o.life); }); });
      after(0.34, () => { const ex = hero.pos.x + f.x * 2, ez = hero.pos.z + f.z * 2; const sh = new THREE.Mesh(new THREE.RingGeometry(0.5, 3 + s.level * 0.4, 28), ringMat(0xfff0c0, 0.7)); sh.rotation.x = -Math.PI / 2; sh.position.set(ex, 0.22, ez); addVfx(sh, 0.5, (dt, o) => { sh.scale.setScalar(1 + (o.t / o.life) * 1.5); sh.material.opacity = 0.7 * (1 - o.t / o.life); }); hero.target.copy(hero.pos); });
    } else if (s.key === 'hook') {
      const range = 10 + s.level * 1.2;
      const hook = new THREE.Group();
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), new THREE.MeshBasicMaterial({ color: 0xcfcfcf })); line.rotation.z = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6, roughness: 0.4 })); head.rotation.z = -Math.PI / 2;
      hook.add(line); hook.add(head); hook.position.set(p.x, 0.7, p.z); hook.rotation.y = hero.yaw;
      addVfx(hook, 0.7, (dt, o) => { const u = o.t / o.life; const reach = (u < 0.5 ? u * 2 : (1 - u) * 2) * range; line.scale.x = Math.max(0.1, reach); line.position.x = reach / 2; head.position.x = reach; });
    } else {
      hero.rooted = true;
      const arc = new THREE.Mesh(new THREE.RingGeometry(2, 9 + s.level, 24, 1, -Math.PI / 3, Math.PI * 2 / 3), ringMat(0xffb060, 0.35)); arc.rotation.x = -Math.PI / 2;
      const place = () => { arc.position.set(hero.pos.x, 0.21, hero.pos.z); arc.rotation.z = -hero.yaw; };
      place(); addVfx(arc, 1.2, (dt, o) => { place(); arc.material.opacity = 0.2 + 0.18 * Math.sin(o.t * 12); });
      after(1.2, () => {
        hero.rooted = false; const hp = hero.pos.clone(), yaw = hero.yaw;
        for (let k = -2; k <= 2; k++) { const ang = yaw + k * 0.28, dir = { x: Math.cos(ang), z: -Math.sin(ang) }; const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.5, roughness: 0.4 })); ball.position.set(hp.x, 0.9, hp.z); addVfx(ball, 0.8, (dt, o) => { const d = o.t * 22; ball.position.set(hp.x + dir.x * d, 0.9 + Math.sin((o.t / o.life) * Math.PI) * 2.6, hp.z + dir.z * d); }); }
        const st = new THREE.Mesh(new THREE.RingGeometry(1, 7, 28), ringMat(0xffe080, 0.6)); st.rotation.x = -Math.PI / 2; st.position.set(hp.x + Math.cos(yaw) * 5, 0.22, hp.z - Math.sin(yaw) * 5); addVfx(st, 0.6, (dt, o) => { st.scale.setScalar(1 + (o.t / o.life) * 1.4); st.material.opacity = 0.6 * (1 - o.t / o.life); });
      });
    }
    return true;
  }
  function levelUp(i) { const s = skills[i]; if (!s || points <= 0 || s.level >= s.max) return false; s.level++; points--; return true; }
  function tick(dt) {
    powder = Math.min(powderMax, powder + dt * 12);
    for (const s of skills) if (s.t > 0) s.t = Math.max(0, s.t - dt);
    for (let j = timers.length - 1; j >= 0; j--) { timers[j].d -= dt; if (timers[j].d <= 0) { timers[j].fn(); timers.splice(j, 1); } }
    levelT += dt; if (levelT >= 9 && heroLevel < 15) { levelT = 0; heroLevel++; points++; }   // placeholder XP until Phase 7
  }
  return { skills, cdOf, tryCast, levelUp, tick, get powder() { return powder; }, powderMax, get heroLevel() { return heroLevel; }, get points() { return points; } };
}
