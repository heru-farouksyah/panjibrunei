// Combat (Phase 5): minion waves down the lanes, turrets, the hero as a combat
// unit, attacks + death + last-hit gold + billboarded HP bars. Logical state
// (positions/HP/targeting) lives on plain unit objects; meshes mirror them.  (§3, §7.2-§7.4)

import * as THREE from 'three';
import { gridToWorld } from './config.js';
import { buildMinion } from './units.js';

export function createCombat({ scene, map, hero, addVfx, onGold, onMatchEnd, onXp }) {
  const units = []; let gold = 200; let waveT = 5;
  let matchOver = false, heroDead = false, heroRespawnT = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function makeHpBar(team) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.24), new THREE.MeshBasicMaterial({ color: 0x0c1a22, transparent: true, opacity: 0.82, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.15), new THREE.MeshBasicMaterial({ color: team === 0 ? 0x46d06a : 0xff5246, depthTest: false })); fill.position.z = 0.01;
    g.add(bg); g.add(fill); g.renderOrder = 999; bg.renderOrder = 999; fill.renderOrder = 1000; return { g, fill };
  }
  function add(u) { u.alive = true; u.atkT = 0; u.stun = u.stun || 0; u.slow = u.slow || 0; const hb = makeHpBar(u.team); u._hp = hb; scene.add(hb.g); if (u.mesh) scene.add(u.mesh); units.push(u); return u; }

  function spawnMinion(team, lane) {
    const path = map.lanes[lane].map((p) => { const w = gridToWorld(p.c, p.r); return new THREE.Vector3(w.x, 0.4, w.z); });
    if (team === 1) path.reverse();
    const s = path[0], mesh = buildMinion(team);
    return add({ team, kind: 'minion', x: s.x, z: s.z, y: 0.4, hp: 90, maxHp: 90, dmg: 9, rng: 5.5, aggro: 9, atkCd: 1.0, speed: 7, path, wp: 1, value: 14, mesh });
  }
  // turrets are combat units (no movement)
  for (const t of map.turrets) { const w = gridToWorld(t.c, t.r); add({ team: t.team, kind: 'turret', x: w.x, z: w.z, y: 4, hp: 700, maxHp: 700, dmg: 28, rng: 14, aggro: 14, atkCd: 1.1, speed: 0, value: 120, mesh: null }); }
  // the hero (position synced from hero.pos; auto basic-attack)
  const heroUnit = add({ team: 0, kind: 'hero', x: hero.pos.x, z: hero.pos.z, y: 0.6, hp: 760, maxHp: 760, dmg: 24, rng: 7.5, aggro: 7.5, atkCd: 0.85, speed: 0, value: 0, mesh: null, _isHero: true, lifesteal: 0 });
  const baseHp = 760, baseDmg = 24, baseAtkCd = 0.85; let lvlHp = 0, lvlDmg = 0, itemHp = 0, itemDmg = 0, itemAtkMul = 1;
  function recompute() { const oldMax = heroUnit.maxHp; heroUnit.maxHp = baseHp + lvlHp + itemHp; heroUnit.dmg = baseDmg + lvlDmg + itemDmg; heroUnit.atkCd = baseAtkCd / itemAtkMul; if (heroUnit.maxHp > oldMax) heroUnit.hp += heroUnit.maxHp - oldMax; }
  function setHeroLevel(lvl) { lvlHp = (lvl - 1) * 55; lvlDmg = (lvl - 1) * 4; recompute(); }
  function buffHero({ hp = 0, dmg = 0, atkMul = 1, lifesteal = 0 } = {}) { itemHp += hp; itemDmg += dmg; itemAtkMul *= atkMul; heroUnit.lifesteal += lifesteal; recompute(); }
  function spend(n) { if (gold < n) return false; gold -= n; onGold?.(gold); return true; }
  // base Cores — destroy the enemy's to WIN; invulnerable until that team's turrets fall
  const cores = map.bases.map((b) => { const w = gridToWorld(b.c, b.r); return add({ team: b.team, kind: 'core', x: w.x, z: w.z, y: 6, hp: 2200, maxHp: 2200, dmg: 0, rng: 0, aggro: 0, atkCd: 99, speed: 0, value: 0, mesh: null, invuln: true, _core: b._core }); });

  function enemiesNear(x, z, r, team = 0) { const out = []; for (const u of units) { if (!u.alive || u.team === team) continue; if (Math.hypot(u.x - x, u.z - z) <= r) out.push(u); } return out; }
  function tracer(a, b, color) {
    tmp.set(a.x, a.y + 0.5, a.z); tmp2.set(b.x, b.y + 0.5, b.z); const len = tmp.distanceTo(tmp2);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.copy(tmp).lerp(tmp2, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp2.clone().sub(tmp).normalize());
    addVfx(m, 0.13, (dt, o) => { m.material.opacity = 0.85 * (1 - o.t / o.life); });
  }
  function hit(u, dmg, opts = {}) {
    if (!u || !u.alive || matchOver) return;
    if (u.kind === 'core' && u.invuln) return;                     // turrets must fall first
    u.hp -= dmg;
    if (opts.stun) u.stun = Math.max(u.stun, opts.stun);
    if (opts.slow) u.slow = Math.max(u.slow, opts.slow);
    if (opts.knockback && u.kind === 'minion') { u.x += opts.knockback.x * 2.6; u.z += opts.knockback.z * 2.6; }
    if (opts.pull && u.kind === 'minion') { const dx = opts.pull.x - u.x, dz = opts.pull.z - u.z, d = Math.hypot(dx, dz) || 1; u.x += dx / d * 4; u.z += dz / d * 4; }
    if (u.hp <= 0) kill(u, opts.from, opts.byHero);
  }
  function kill(u, from, byHero) {
    if (u._isHero) { heroDead = true; heroRespawnT = 5; hero.mesh.visible = false; return; }   // respawn timer
    if (u.kind === 'core') {
      u.alive = false; if (u._core) u._core.visible = false; scene.remove(u._hp.g);
      const ex = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.95, depthWrite: false })); ex.position.set(u.x, 6, u.z); addVfx(ex, 0.9, (dt, o) => { ex.scale.setScalar(1 + o.t * 7); ex.material.opacity = 0.95 * (1 - o.t / o.life); });
      if (!matchOver) { matchOver = true; onMatchEnd?.(u.team === 1); }                          // enemy Core down → player wins
      return;
    }
    u.alive = false; scene.remove(u._hp.g); if (u.mesh) scene.remove(u.mesh);
    const sink = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.6, 16), new THREE.MeshBasicMaterial({ color: 0xdfeefc, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); sink.rotation.x = -Math.PI / 2; sink.position.set(u.x, 0.2, u.z); addVfx(sink, 0.5, (dt, o) => { sink.scale.setScalar(1 + o.t * 2); sink.material.opacity = 0.7 * (1 - o.t / o.life); });
    if ((byHero || (from && from._isHero))) { gold += u.value; onGold?.(gold); }
    if (Math.hypot(heroUnit.x - u.x, heroUnit.z - u.z) < 14) onXp?.(u.kind === 'turret' ? 85 : 22);   // XP for nearby kills
  }
  function attack(att, tgt) { tracer(att, tgt, att.team === 0 ? 0xbfe8ff : 0xffb0a0); hit(tgt, att.dmg, { from: att }); if (att._isHero && att.lifesteal > 0) att.hp = Math.min(att.maxHp, att.hp + att.dmg * att.lifesteal); }

  function update(dt, cam) {
    if (matchOver) return;
    if (heroDead) { heroRespawnT -= dt; if (heroRespawnT <= 0) { heroDead = false; heroUnit.hp = heroUnit.maxHp; const b = map.bases[0], w = gridToWorld(b.c + 5, b.r); hero.pos.set(w.x, 0.55, w.z); hero.target.copy(hero.pos); hero.mesh.visible = true; } }
    else { heroUnit.x = hero.pos.x; heroUnit.z = hero.pos.z; }
    // turret-gating: a team's Core is vulnerable only once all its turrets are gone
    const turr = [0, 0]; for (const u of units) if (u.alive && u.kind === 'turret') turr[u.team]++;
    for (const cr of cores) cr.invuln = turr[cr.team] > 0;
    // base healing: regen fast near your own Core
    if (!heroDead) { const b = map.bases[0], w = gridToWorld(b.c, b.r); if (Math.hypot(hero.pos.x - w.x, hero.pos.z - w.z) < 12) heroUnit.hp = Math.min(heroUnit.maxHp, heroUnit.hp + 90 * dt); }
    waveT -= dt; if (waveT <= 0) { waveT = 16; for (const team of [0, 1]) for (let lane = 0; lane < map.lanes.length; lane++) for (let i = 0; i < 2; i++) { const m = spawnMinion(team, lane); m.x += (Math.random() - 0.5) * 2.2; m.z += (Math.random() - 0.5) * 2.2; } }
    for (const u of units) {
      if (!u.alive) continue;
      if (u.stun > 0) u.stun -= dt; if (u.slow > 0) u.slow -= dt; u.atkT -= dt;
      let tgt = null, td = u.aggro; for (const e of units) { if (!e.alive || e.team === u.team) continue; if (e.kind === 'core' && e.invuln) continue; if (e.kind === 'hero' && heroDead) continue; const d = Math.hypot(e.x - u.x, e.z - u.z); if (d < td) { td = d; tgt = e; } }
      const stunned = u.stun > 0;
      if (u.kind === 'hero') { if (!heroDead && tgt && td <= u.rng && u.atkT <= 0 && !hero.rooted) { attack(u, tgt); u.atkT = u.atkCd; } }
      else if (u.kind === 'turret' || u.kind === 'core') { if (u.kind === 'turret' && tgt && td <= u.rng && u.atkT <= 0) { attack(u, tgt); u.atkT = u.atkCd; } }
      else if (!stunned) {
        if (tgt && td <= u.rng && u.atkT <= 0) { attack(u, tgt); u.atkT = u.atkCd; }
        else { const sp = u.speed * (u.slow > 0 ? 0.55 : 1); let dx, dz; if (tgt && td <= u.aggro) { dx = tgt.x - u.x; dz = tgt.z - u.z; } else { const wpt = u.path[u.wp]; if (wpt) { if (Math.hypot(wpt.x - u.x, wpt.z - u.z) < 1.6) u.wp = Math.min(u.path.length - 1, u.wp + 1); dx = u.path[u.wp].x - u.x; dz = u.path[u.wp].z - u.z; } else { dx = dz = 0; } } const d = Math.hypot(dx, dz) || 1; u.x += dx / d * sp * dt; u.z += dz / d * sp * dt; if (u.mesh && (dx || dz)) u.mesh.rotation.y = Math.atan2(-dz, dx); }
      }
      if (u.mesh) u.mesh.position.set(u.x, u.y, u.z);
      const hb = u._hp, frac = Math.max(0, u.hp / u.maxHp); const hy = u.kind === 'core' ? 9.5 : (u.kind === 'turret' ? 7 : (u.kind === 'hero' ? 3.6 : 2.4)); hb.g.position.set(u.x, hy, u.z); hb.g.quaternion.copy(cam.quaternion); hb.fill.scale.x = frac; hb.fill.position.x = -0.7 * (1 - frac); hb.fill.material.color.setHex(u.kind === 'core' && u.invuln ? 0x6b7b86 : (u.team === 0 ? 0x46d06a : 0xff5246)); hb.g.visible = (u.hp < u.maxHp || u.kind === 'hero' || u.kind === 'core') && !(u.kind === 'hero' && heroDead); hb.g.scale.x = u.kind === 'core' ? 1.6 : 1;
    }
    for (let i = units.length - 1; i >= 0; i--) if (!units[i].alive) units.splice(i, 1);
  }

  const debug = {
    killTurrets: (team) => { for (const u of units) if (u.alive && u.kind === 'turret' && u.team === team) { u.hp = 0; kill(u, heroUnit, true); } },
    damageCore: (team, dmg) => { const cr = cores.find((c) => c.team === team); if (cr) hit(cr, dmg, { byHero: true }); },
    killHero: () => { heroUnit.hp = 0; kill(heroUnit); },
    turretsLeft: (team) => units.filter((u) => u.alive && u.kind === 'turret' && u.team === team).length,
    coreInvuln: (team) => cores.find((c) => c.team === team)?.invuln,
    grantGold: (n) => { gold += n; onGold?.(gold); },
  };
  return { update, enemiesNear, hit, debug, setHeroLevel, buffHero, spend, get gold() { return gold; }, get heroHp() { return heroUnit.hp; }, get heroMaxHp() { return heroUnit.maxHp; }, get heroDmg() { return heroUnit.dmg; }, get heroDead() { return heroDead; }, get respawnIn() { return Math.ceil(heroRespawnT); }, get over() { return matchOver; }, count: () => units.length };
}
