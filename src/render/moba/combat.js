// Combat (Phase 5): minion waves down the lanes, turrets, the hero as a combat
// unit, attacks + death + last-hit gold + billboarded HP bars. Logical state
// (positions/HP/targeting) lives on plain unit objects; meshes mirror them.  (§3, §7.2-§7.4)

import * as THREE from 'three';
import { gridToWorld } from './config.js';
import { buildMinion, buildBahtera, buildNaga, buildCampMob } from './units.js';

export function createCombat({ scene, map, hero, addVfx, onGold, onMatchEnd, onXp, heroStats = {} }) {
  const units = []; let gold = 200; let waveT = 5;
  let matchOver = false, heroDead = false, heroRespawnT = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function makeHpBar(team) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.24), new THREE.MeshBasicMaterial({ color: 0x0c1a22, transparent: true, opacity: 0.82, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.15), new THREE.MeshBasicMaterial({ color: team === 0 ? 0x46d06a : 0xff5246, depthTest: false })); fill.position.z = 0.01;
    g.add(bg); g.add(fill); g.renderOrder = 999; bg.renderOrder = 999; fill.renderOrder = 1000; return { g, fill };
  }
  function add(u) { u.alive = true; u.atkT = 0; u.stun = u.stun || 0; u.slow = u.slow || 0; u.shield = u.shield || 0; u.shieldT = u.shieldT || 0; const hb = makeHpBar(u.team); u._hp = hb; scene.add(hb.g); if (u.mesh) scene.add(u.mesh); units.push(u); return u; }

  function spawnMinion(team, lane) {
    const path = map.lanes[lane].map((p) => { const w = gridToWorld(p.c, p.r); return new THREE.Vector3(w.x, 0.4, w.z); });
    if (team === 1) path.reverse();
    const s = path[0], mesh = buildMinion(team);
    return add({ team, kind: 'minion', x: s.x, z: s.z, y: 0.4, hp: 90, maxHp: 90, dmg: 9, rng: 5.5, aggro: 9, atkCd: 1.0, speed: 7, path, wp: 1, value: 14, mesh });
  }
  // turrets are combat units (no movement)
  for (const t of map.turrets) { const w = gridToWorld(t.c, t.r); add({ team: t.team, kind: 'turret', x: w.x, z: w.z, y: 4, hp: 700, maxHp: 700, dmg: 28, rng: 14, aggro: 14, atkCd: 1.1, speed: 0, value: 120, mesh: null }); }
  // the hero (position synced from hero.pos; auto basic-attack)
  const HS = { hp: 760, dmg: 24, rng: 7.5, atkCd: 0.85, ...heroStats };
  const heroUnit = add({ team: 0, kind: 'hero', x: hero.pos.x, z: hero.pos.z, y: 0.6, hp: HS.hp, maxHp: HS.hp, dmg: HS.dmg, rng: HS.rng, aggro: HS.rng, atkCd: HS.atkCd, speed: 0, value: 0, mesh: null, _isHero: true, lifesteal: 0 });
  const baseHp = HS.hp, baseDmg = HS.dmg, baseAtkCd = HS.atkCd; let lvlHp = 0, lvlDmg = 0, itemHp = 0, itemDmg = 0, itemAtkMul = 1;
  function recompute() { const oldMax = heroUnit.maxHp; heroUnit.maxHp = baseHp + lvlHp + itemHp; heroUnit.dmg = baseDmg + lvlDmg + itemDmg; heroUnit.atkCd = baseAtkCd / itemAtkMul; if (heroUnit.maxHp > oldMax) heroUnit.hp += heroUnit.maxHp - oldMax; }
  function setHeroLevel(lvl) { lvlHp = (lvl - 1) * 55; lvlDmg = (lvl - 1) * 4; recompute(); }
  function buffHero({ hp = 0, dmg = 0, atkMul = 1, lifesteal = 0 } = {}) { itemHp += hp; itemDmg += dmg; itemAtkMul *= atkMul; heroUnit.lifesteal += lifesteal; recompute(); }
  function spend(n) { if (gold < n) return false; gold -= n; onGold?.(gold); return true; }
  // base Cores — destroy the enemy's to WIN; invulnerable until that team's turrets fall
  const cores = map.bases.map((b) => { const w = gridToWorld(b.c, b.r); return add({ team: b.team, kind: 'core', x: w.x, z: w.z, y: 6, hp: 2200, maxHp: 2200, dmg: 0, rng: 0, aggro: 0, atkCd: 99, speed: 0, value: 0, mesh: null, invuln: true, _core: b._core }); });
  // HERO bots (Phase 8) — 3v3: ally bots fight alongside the player, enemy bots oppose.
  // Each pushes its lane toward the foe base, duels in aggro, retreats + heals when low.
  function spawnBot(team, lane, opts = {}) {
    const path = map.lanes[lane].map((p) => { const w = gridToWorld(p.c, p.r); return new THREE.Vector3(w.x, 0.6, w.z); });
    if (team === 1) path.reverse();                                  // both push toward the FOE base
    const sw = opts.startWp || 0, s = path[Math.min(sw, path.length - 1)], hp = opts.hp || 690;
    return add({ team, kind: 'hero', x: s.x, z: s.z, y: 0.6, hp, maxHp: hp, dmg: opts.dmg || 21, rng: 7.5, aggro: 9.5, atkCd: 0.92, speed: 9.5, path, wp: sw + 1, value: team === 1 ? 300 : 60, mesh: buildBahtera(team), _isBot: true, down: false, retreat: false, respawnT: 0 });
  }
  // Sea-Naga — the Epic neutral in the central pit. Slay it for your team's Blessing.
  const ew = gridToWorld(map.epic.c, map.epic.r);
  const naga = add({ team: 2, kind: 'epic', x: ew.x, z: ew.z, y: 1.6, hp: 3200, maxHp: 3200, dmg: 58, rng: 9, aggro: 9, atkCd: 1.4, speed: 0, value: 0, mesh: buildNaga(), _isEpic: true, down: false, respawnT: 0 });
  let nagaBuff = { team: -1, t: 0 };                                 // Blessing: +40% hero dmg for the slayer's team
  // jungle camps — neutral crabs on the four corners; clear for gold + XP, they respawn
  const camps = map.camps.map((cmp) => { const w = gridToWorld(cmp.c, cmp.r); return add({ team: 2, kind: 'camp', x: w.x, z: w.z, y: 0.8, hp: 560, maxHp: 560, dmg: 17, rng: 6.5, aggro: 6, atkCd: 1.3, speed: 0, value: 75, mesh: buildCampMob(), _isCamp: true, down: false, respawnT: 0, path: [] }); });
  const allyBots = [spawnBot(0, 0, { hp: 680, dmg: 20 }), spawnBot(0, 1, { hp: 680, dmg: 20 })];
  const botHero = spawnBot(1, 0, { hp: 730, dmg: 23 });               // lead rival (debug ref)
  const enemyBots = [botHero, spawnBot(1, 1, { hp: 690, dmg: 21 }), spawnBot(1, 0, { hp: 680, dmg: 20, startWp: 3 })];
  function botStep(u, dt, tgt, td) {
    const bw = gridToWorld(map.bases[u.team].c, map.bases[u.team].r);
    const atBase = Math.hypot(u.x - bw.x, u.z - bw.z) < 12;
    if (atBase) u.hp = Math.min(u.maxHp, u.hp + 95 * dt);                       // heal at home base
    if (u.hp < u.maxHp * 0.3 && !atBase) u.retreat = true;                      // wounded → fall back
    if (u.hp > u.maxHp * 0.85) u.retreat = false;                              // healed → re-engage
    let dx = 0, dz = 0;
    if (u.retreat) { dx = bw.x - u.x; dz = bw.z - u.z; }                        // head home
    else if (tgt && td <= u.rng) { if (u.atkT <= 0) { attack(u, tgt); u.atkT = u.atkCd; } return; }   // in range → hold + fire
    else if (tgt && td <= u.aggro) { dx = tgt.x - u.x; dz = tgt.z - u.z; }      // chase
    else { const wpt = u.path[u.wp]; if (wpt) { if (Math.hypot(wpt.x - u.x, wpt.z - u.z) < 1.8) u.wp = Math.min(u.path.length - 1, u.wp + 1); dx = u.path[u.wp].x - u.x; dz = u.path[u.wp].z - u.z; } }   // push lane
    const d = Math.hypot(dx, dz) || 1; u.x += dx / d * u.speed * dt; u.z += dz / d * u.speed * dt;
    if (u.mesh && (dx || dz)) u.mesh.rotation.y = Math.atan2(-dz, dx);
  }

  function enemiesNear(x, z, r, team = 0) { const out = []; for (const u of units) { if (!u.alive || u.down || u.team === team) continue; if (Math.hypot(u.x - x, u.z - z) <= r) out.push(u); } return out; }
  function alliesNear(x, z, r, team = 0) { const out = []; for (const u of units) { if (!u.alive || u.down || u.team !== team) continue; if (u.kind === 'turret' || u.kind === 'core') continue; if (Math.hypot(u.x - x, u.z - z) <= r) out.push(u); } return out; }
  function heal(u, amt) { if (u && u.alive && !u.down) u.hp = Math.min(u.maxHp, u.hp + amt); }
  function shieldUnit(u, amt, dur) { if (u && u.alive && !u.down) { u.shield = Math.max(u.shield || 0, amt); u.shieldT = Math.max(u.shieldT || 0, dur); } }
  function tracer(a, b, color) {
    tmp.set(a.x, a.y + 0.5, a.z); tmp2.set(b.x, b.y + 0.5, b.z); const len = tmp.distanceTo(tmp2);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.copy(tmp).lerp(tmp2, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp2.clone().sub(tmp).normalize());
    addVfx(m, 0.13, (dt, o) => { m.material.opacity = 0.85 * (1 - o.t / o.life); });
  }
  function hit(u, dmg, opts = {}) {
    if (!u || !u.alive || u.down || matchOver) return;
    if (u.kind === 'core' && u.invuln) return;                     // turrets must fall first
    if (u.shield > 0) { const a = Math.min(u.shield, dmg); u.shield -= a; dmg -= a; }   // absorb
    u.hp -= dmg;
    if (opts.stun) u.stun = Math.max(u.stun, opts.stun);
    if (opts.slow) u.slow = Math.max(u.slow, opts.slow);
    if (opts.knockback && u.kind === 'minion') { u.x += opts.knockback.x * 2.6; u.z += opts.knockback.z * 2.6; }
    if (opts.pull && u.kind === 'minion') { const dx = opts.pull.x - u.x, dz = opts.pull.z - u.z, d = Math.hypot(dx, dz) || 1; u.x += dx / d * 4; u.z += dz / d * 4; }
    if (u.hp <= 0) kill(u, opts.from, opts.byHero);
  }
  function kill(u, from, byHero) {
    if (u._isCamp) {                                               // jungle camp cleared → gold + XP, respawns
      if (u.down) return;
      u.down = true; u.respawnT = 55; if (u.mesh) u.mesh.visible = false;
      const sink = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.7, 16), new THREE.MeshBasicMaterial({ color: 0xdfe7b0, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })); sink.rotation.x = -Math.PI / 2; sink.position.set(u.x, 0.3, u.z); addVfx(sink, 0.6, (dt, o) => { sink.scale.setScalar(1 + o.t * 2.2); sink.material.opacity = 0.75 * (1 - o.t / o.life); });
      const byTeam0 = byHero || (from && from.team === 0);
      if (byTeam0) { gold += u.value; onGold?.(gold); onXp?.(60); }   // jungle income for the player's side
      return;
    }
    if (u._isEpic) {                                               // Sea-Naga slain → Blessing for the killer's team
      if (u.down) return;
      u.down = true; u.respawnT = 90; if (u.mesh) u.mesh.visible = false;
      const killer = (from && from.team !== undefined && from.team !== 2) ? from.team : (byHero ? 0 : -1);
      if (killer === 0 || killer === 1) nagaBuff = { team: killer, t: 45 };
      const burst = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9affd0, transparent: true, opacity: 0.9, depthWrite: false })); burst.position.set(u.x, u.y + 1, u.z); addVfx(burst, 1.0, (dt, o) => { burst.scale.setScalar(1 + o.t * 6); burst.material.opacity = 0.9 * (1 - o.t / o.life); });
      return;
    }
    if (u._isBot) {                                                // hero bot: down + respawn, don't remove
      if (u.down) return;
      u.down = true; u.respawnT = 7; u.retreat = false; if (u.mesh) u.mesh.visible = false;
      const col = u.team === 1 ? 0xffd0c0 : 0xcfe6ff;
      const sink = new THREE.Mesh(new THREE.RingGeometry(0.5, 2.4, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); sink.rotation.x = -Math.PI / 2; sink.position.set(u.x, 0.2, u.z); addVfx(sink, 0.7, (dt, o) => { sink.scale.setScalar(1 + o.t * 2.5); sink.material.opacity = 0.8 * (1 - o.t / o.life); });
      if (u.team === 1) { gold += u.value; onGold?.(gold); onXp?.(120); }   // bounty for slaying ENEMY heroes
      return;
    }
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
  function attack(att, tgt) {
    let dmg = att.dmg; if (att.kind === 'hero' && nagaBuff.t > 0 && att.team === nagaBuff.team) dmg *= 1.4;   // Naga's Blessing
    tracer(att, tgt, att.team === 0 ? 0xbfe8ff : (att.team === 2 ? 0x8fffc0 : 0xffb0a0)); hit(tgt, dmg, { from: att });
    if (att._isHero && att.lifesteal > 0) att.hp = Math.min(att.maxHp, att.hp + dmg * att.lifesteal);
  }

  function update(dt, cam) {
    if (matchOver) return;
    if (heroDead) { heroRespawnT -= dt; if (heroRespawnT <= 0) { heroDead = false; heroUnit.hp = heroUnit.maxHp; const b = map.bases[0], w = gridToWorld(b.c + 5, b.r); hero.pos.set(w.x, 0.55, w.z); hero.target.copy(hero.pos); hero.mesh.visible = true; } }
    else { heroUnit.x = hero.pos.x; heroUnit.z = hero.pos.z; }
    if (nagaBuff.t > 0) nagaBuff.t -= dt;
    // turret-gating: a team's Core is vulnerable only once all its turrets are gone
    const turr = [0, 0]; for (const u of units) if (u.alive && u.kind === 'turret') turr[u.team]++;
    for (const cr of cores) cr.invuln = turr[cr.team] > 0;
    // base healing: regen fast near your own Core
    if (!heroDead) { const b = map.bases[0], w = gridToWorld(b.c, b.r); if (Math.hypot(hero.pos.x - w.x, hero.pos.z - w.z) < 12) heroUnit.hp = Math.min(heroUnit.maxHp, heroUnit.hp + 90 * dt); }
    waveT -= dt; if (waveT <= 0) { waveT = 16; for (const team of [0, 1]) for (let lane = 0; lane < map.lanes.length; lane++) for (let i = 0; i < 2; i++) { const m = spawnMinion(team, lane); m.x += (Math.random() - 0.5) * 2.2; m.z += (Math.random() - 0.5) * 2.2; } }
    for (const u of units) {
      if (!u.alive) continue;
      if ((u._isEpic || u._isCamp) && u.down) { u.respawnT -= dt; u._hp.g.visible = false; if (u.respawnT <= 0) { u.down = false; u.hp = u.maxHp; if (u.mesh) u.mesh.visible = true; } continue; }
      if (u._isBot && u.down) { u.respawnT -= dt; u._hp.g.visible = false; if (u.respawnT <= 0) { u.down = false; u.hp = u.maxHp; const b = map.bases[u.team], w = gridToWorld(b.c + (u.team === 0 ? 5 : -5), b.r); u.x = w.x; u.z = w.z; u.wp = 1; if (u.mesh) { u.mesh.visible = true; u.mesh.position.set(u.x, u.y, u.z); } } continue; }
      if (u.stun > 0) u.stun -= dt; if (u.slow > 0) u.slow -= dt; u.atkT -= dt; if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
      let tgt = null, td = u.aggro; for (const e of units) { if (!e.alive || e.down || e.team === u.team) continue; if (e.kind === 'core' && e.invuln) continue; if (e.kind === 'hero' && e._isHero && heroDead) continue; if (e.kind === 'camp' && !u._isHero) continue; if (e.kind === 'epic' && u.kind !== 'hero') continue; const d = Math.hypot(e.x - u.x, e.z - u.z); if (d < td) { td = d; tgt = e; } }
      const stunned = u.stun > 0;
      if (u.kind === 'hero') { if (u._isBot) { if (!stunned) botStep(u, dt, tgt, td); } else { if (!heroDead && tgt && td <= u.rng && u.atkT <= 0 && !hero.rooted) { attack(u, tgt); u.atkT = u.atkCd; } } }
      else if (u.kind === 'turret' || u.kind === 'core' || u.kind === 'epic' || u.kind === 'camp') { if (u.kind !== 'core' && tgt && td <= u.rng && u.atkT <= 0) { attack(u, tgt); u.atkT = u.atkCd; } }
      else if (!stunned) {
        if (tgt && td <= u.rng && u.atkT <= 0) { attack(u, tgt); u.atkT = u.atkCd; }
        else { const sp = u.speed * (u.slow > 0 ? 0.55 : 1); let dx, dz; if (tgt && td <= u.aggro) { dx = tgt.x - u.x; dz = tgt.z - u.z; } else { const wpt = u.path[u.wp]; if (wpt) { if (Math.hypot(wpt.x - u.x, wpt.z - u.z) < 1.6) u.wp = Math.min(u.path.length - 1, u.wp + 1); dx = u.path[u.wp].x - u.x; dz = u.path[u.wp].z - u.z; } else { dx = dz = 0; } } const d = Math.hypot(dx, dz) || 1; u.x += dx / d * sp * dt; u.z += dz / d * sp * dt; if (u.mesh && (dx || dz)) u.mesh.rotation.y = Math.atan2(-dz, dx); }
      }
      if (u.mesh) u.mesh.position.set(u.x, u.y, u.z);
      const hb = u._hp, frac = Math.max(0, u.hp / u.maxHp); const hy = u.kind === 'core' ? 9.5 : (u.kind === 'epic' ? 7.5 : (u.kind === 'turret' ? 7 : (u.kind === 'camp' ? 3 : (u.kind === 'hero' ? 3.6 : 2.4)))); hb.g.position.set(u.x, hy, u.z); hb.g.quaternion.copy(cam.quaternion); hb.fill.scale.x = frac; hb.fill.position.x = -0.7 * (1 - frac); hb.fill.material.color.setHex(u.kind === 'core' && u.invuln ? 0x6b7b86 : (u.kind === 'epic' ? 0x8fe6b0 : (u.kind === 'camp' ? 0xd9b24a : (u.team === 0 ? 0x46d06a : 0xff5246)))); hb.g.visible = (u.hp < u.maxHp || u.kind === 'hero' || u.kind === 'core' || u.kind === 'epic') && !(u._isHero && heroDead) && !((u._isBot || u._isEpic || u._isCamp) && u.down); hb.g.scale.x = u.kind === 'core' || u.kind === 'epic' ? 1.6 : 1;
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
    hurtHero: (n) => hit(heroUnit, n, {}), heroShield: () => Math.round(heroUnit.shield),
    killBot: () => { botHero.hp = 0; kill(botHero, heroUnit, true); },
    hurtBot: (n) => hit(botHero, n, { byHero: true }),
    naga: () => ({ hp: Math.round(naga.hp), maxHp: naga.maxHp, down: naga.down, respawnIn: Math.ceil(naga.respawnT), buffTeam: nagaBuff.team, buffT: Math.ceil(nagaBuff.t) }),
    killNaga: (team = 0) => { naga.hp = 0; kill(naga, team === 0 ? heroUnit : enemyBots[1]); },
    hurtNaga: (n) => hit(naga, n, { byHero: true }),
    camps: () => ({ total: camps.length, alive: camps.filter((x) => !x.down).length, hp: camps.map((x) => Math.round(x.hp)) }),
    clearCamp: (i = 0) => { const cmp = camps[i]; cmp.hp = 0; kill(cmp, heroUnit, true); },
    bot: () => ({ hp: Math.round(botHero.hp), maxHp: botHero.maxHp, down: botHero.down, x: +botHero.x.toFixed(1), z: +botHero.z.toFixed(1), retreat: botHero.retreat, respawnIn: Math.ceil(botHero.respawnT) }),
    bots: () => ({ allyAlive: allyBots.filter((x) => !x.down).length, enemyAlive: enemyBots.filter((x) => !x.down).length, allyHp: allyBots.map((x) => Math.round(x.hp)), enemyHp: enemyBots.map((x) => Math.round(x.hp)), allyX: allyBots.map((x) => +x.x.toFixed(1)), enemyX: enemyBots.map((x) => +x.x.toFixed(1)) }),
  };
  return { update, enemiesNear, alliesNear, heal, shieldUnit, hit, debug, setHeroLevel, buffHero, spend, get nagaState() { return { down: naga.down, hpFrac: naga.hp / naga.maxHp, buffTeam: nagaBuff.team, buffT: nagaBuff.t }; }, get gold() { return gold; }, get heroHp() { return heroUnit.hp; }, get heroMaxHp() { return heroUnit.maxHp; }, get heroDmg() { return heroUnit.dmg; }, get heroDead() { return heroDead; }, get respawnIn() { return Math.ceil(heroRespawnT); }, get over() { return matchOver; }, count: () => units.length };
}
