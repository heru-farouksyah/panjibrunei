// PRESENTATION (Three.js) for the naval MOBA — Phase 1: the WORLD, to the
// Visual Quality Bar (real sun + shadow maps, hemi fill, animated water shader
// with fresnel + sun-specular, PBR islands, eased RTS camera). Reads the
// logical map from sim.js through gridToWorld(); never mutates the sim.  (§2-§5)
//
// NOTE (B / PBR target on a no-GPU box): full planar reflection/refraction
// (three's Water reflector) + PMREM env are deferred to GPU verification — they
// risk crashing software-WebGL here. The water uses a real animated shader with
// sky-gradient reflection + sun specular so it reads as moving PBR-ish water,
// and islands use MeshStandard (PBR). Swap in the reflector once on real hardware.

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GRID_W, GRID_H, MAP_W, MAP_H, gridToWorld, worldToGrid } from './config.js';
import { createMap, TYPE } from './sim.js';
import { makeKit } from './skills.js';
import { createCombat } from './combat.js';
import { ROSTER, heroById } from './heroes.js';

const TEAM_COL = [0x35b6ff, 0xff5246];   // 0 = ally (azure), 1 = enemy (scarlet)

export function showMoba(audio, opts = {}) {
  // a quick HERO-SELECT before the match (deep-link with ?hero=<id> to skip it)
  const pre = new URLSearchParams(location.search).get('hero');
  if (pre) { runMatch(audio, opts, heroById(pre)); return; }
  const sel = document.createElement('div'); sel.className = 'screen-overlay moba-select';
  sel.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:50;background:linear-gradient(180deg,#0c2230,#0a1822);';
  document.body.appendChild(sel);
  buildHeroSelect(sel, (chosen) => { sel.remove(); runMatch(audio, opts, chosen); });
}

function runMatch(audio, { mission, onResult } = {}, chosen) {
  const map = createMap();                 // ← the simulation's truth (grid)

  // ---- Phase 10: SFX (procedural, via the shared AudioManager) ----
  const A = audio;
  const sndOn = () => A && A.ctx && A.ctx.state === 'running' && !A.muted;
  const snd = {
    cast: (i) => { if (!sndOn()) return; const t = A.ctx.currentTime, f = [520, 660, 400][i] || 500; A.blip(f, 0.12, 'sawtooth', 0.22, t); A.blip(f * 1.5, 0.1, 'sine', 0.16, t + 0.04); },
    level: () => { if (!sndOn()) return; const t = A.ctx.currentTime; [523, 659, 784].forEach((f, k) => A.blip(f, 0.16, 'sine', 0.28, t + k * 0.07)); },
    boom: () => { if (!sndOn()) return; A.noiseBurst(A.ctx.currentTime, 0.3, 0.5, { type: 'lowpass', freq: 320, q: 1 }); },
    roar: () => { if (!sndOn()) return; const t = A.ctx.currentTime; A.blip(110, 0.5, 'sawtooth', 0.4, t); A.noiseBurst(t, 0.5, 0.4, { type: 'lowpass', freq: 480 }); },
    win: () => { if (!sndOn()) return; const t = A.ctx.currentTime; [523, 659, 784, 1047].forEach((f, k) => A.blip(f, 0.24, 'sine', 0.3, t + k * 0.12)); },
    lose: () => { if (!sndOn()) return; const t = A.ctx.currentTime; [392, 330, 262].forEach((f, k) => A.blip(f, 0.3, 'sine', 0.3, t + k * 0.14)); },
    buy: () => { if (!sndOn()) return; const t = A.ctx.currentTime; A.blip(880, 0.08, 'square', 0.18, t); A.blip(1320, 0.1, 'square', 0.16, t + 0.05); },
    shoot: () => { if (!sndOn()) return; const t = A.ctx.currentTime; A.noiseBurst(t, 0.14, 0.4, { type: 'lowpass', freq: 380, q: 1 }); A.blip(140, 0.1, 'square', 0.18, t); },   // cannon
    hurt: () => { if (!sndOn()) return; const t = A.ctx.currentTime; A.noiseBurst(t, 0.18, 0.34, { type: 'lowpass', freq: 240 }); A.blip(90, 0.16, 'sawtooth', 0.2, t); },          // took damage
    tap: () => { if (!sndOn()) return; A.blip(660, 0.05, 'square', 0.13, A.ctx.currentTime); },                                                                                       // UI click
  };
  A?.world?.('water_village');             // ambient bed + score (starts on first gesture)

  // ---- overlay + renderer -------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay moba';
  overlay.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#10202c;touch-action:none;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe0ea, 170, 520);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2000);

  // ---- sky + sun ----------------------------------------------------------
  const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 3.4; su.rayleigh.value = 2.1; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.85;   // bright tropical sky
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 30), THREE.MathUtils.degToRad(48));
  su.sunPosition.value.copy(sunDir);

  const sun = new THREE.DirectionalLight(0xfff2d8, 3.0);
  sun.position.copy(sunDir).multiplyScalar(140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; const span = Math.max(MAP_W, MAP_H) * 0.62;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 20; sc.far = 420;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x21506a, 0.95));
  scene.add(new THREE.AmbientLight(0x3a5566, 0.55));

  // ---- terrain (seabed + islands), built from the grid heightfield --------
  const colDeep = new THREE.Color(0x123043), colSand = new THREE.Color(0xb9a06a), colLane = new THREE.Color(0xcdb985);
  const colBase = [new THREE.Color(0x274b6e), new THREE.Color(0x6e2b2b)], colStone = new THREE.Color(0x6f7479), colJungle = new THREE.Color(0x3f6b3a), colPit = new THREE.Color(0x14222b);
  function tileColor(t, h) {
    if (t === TYPE.BASE) return colBase[h > 0 ? 0 : 0];   // tinted later per side
    if (t === TYPE.TURRET) return colStone;
    if (t === TYPE.JUNGLE) return colJungle;
    if (t === TYPE.EPIC) return colPit;
    if (t === TYPE.LANE) return colLane;
    return h > -2 ? colSand : colDeep;                     // shallows sandy, deep dark
  }
  const terrGeo = new THREE.BufferGeometry();
  const verts = [], cols = [], idx = [];
  const midR = (GRID_H - 1) / 2;
  for (let r = 0; r < GRID_H; r++) for (let c = 0; c < GRID_W; c++) {
    const h = map.height[map.at(c, r)], t = map.type[map.at(c, r)];
    const w = gridToWorld(c, r, h); verts.push(w.x, w.y, w.z);
    const col = tileColor(t, h).clone();
    if (t === TYPE.BASE) col.copy(colBase[c < GRID_W / 2 ? 0 : 1]);
    col.offsetHSL(0, 0, (Math.sin(c * 1.3) + Math.cos(r * 1.7)) * 0.012); // subtle variation
    cols.push(col.r, col.g, col.b);
  }
  for (let r = 0; r < GRID_H - 1; r++) for (let c = 0; c < GRID_W - 1; c++) {
    const a = r * GRID_W + c, b = a + 1, d = a + GRID_W, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  terrGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  terrGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  terrGeo.setIndex(idx); terrGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false }));
  terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  // ---- structures: base cores, turrets, epic marker (PBR, shadowed) -------
  const pbr = (color, rough = 0.6, metal = 0.1, emissive = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });
  function place(mesh, c, r, y = 0) { const w = gridToWorld(c, r, Math.max(0, map.height[map.at(c, r)]) + y); mesh.position.set(w.x, w.y, w.z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh; }
  const spinners = [];   // meshes that idle-rotate (cores, naga)
  // base FORTS: tiered stone platform, crenellated rim, pillars cradling a glowing Core, banners
  for (const b of map.bases) {
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 1.8, 28), pbr(0x8d9094, 0.85, 0.05)); p1.position.y = 0.9; g.add(p1);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.5, 1.6, 24), pbr(0x9a9da0, 0.8, 0.06)); p2.position.y = 2.5; g.add(p2);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const cr = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 1), pbr(0x7e8186, 0.85, 0.05)); cr.position.set(Math.cos(a) * 7.7, 2.0, Math.sin(a) * 7.7); cr.rotation.y = -a; g.add(cr); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 5.2, 8), pbr(0x6f7479, 0.8, 0.1)); pil.position.set(Math.cos(a) * 3.3, 5.4, Math.sin(a) * 3.3); g.add(pil); }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), pbr(TEAM_COL[b.team], 0.25, 0.35, TEAM_COL[b.team], 1.15)); core.position.y = 6.0; g.add(core); spinners.push(core);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 12), new THREE.MeshBasicMaterial({ color: TEAM_COL[b.team], transparent: true, opacity: 0.11, depthWrite: false })); halo.position.y = 6.0; g.add(halo);
    for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7.5, 6), pbr(0x4a3a2a, 0.85, 0.0)); pole.position.set(s * 6.6, 4.4, 0); g.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshStandardMaterial({ color: TEAM_COL[b.team], roughness: 0.7, side: THREE.DoubleSide, emissive: TEAM_COL[b.team], emissiveIntensity: 0.22 })); flag.position.set(s * 6.6 + s * 1.35, 6.6, 0); flag.rotation.y = s * Math.PI / 2; g.add(flag); }
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); place(g, b.c, b.r); b._core = core;
  }
  // tiered cannon TURRETS with a barrel + team band
  const tierAt = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; return m; };
  for (const t of map.turrets) {
    const g = new THREE.Group();
    g.add(tierAt(new THREE.CylinderGeometry(2, 2.6, 2.4, 12), pbr(0x80858b, 0.8, 0.08), 1.2));
    g.add(tierAt(new THREE.CylinderGeometry(1.5, 1.9, 2.6, 12), pbr(0x8e9298, 0.78, 0.08), 3.4));
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.26, 8, 16), pbr(TEAM_COL[t.team], 0.5, 0.2, TEAM_COL[t.team], 0.45)); band.rotation.x = Math.PI / 2; band.position.y = 4.6; g.add(band);
    g.add(tierAt(new THREE.CylinderGeometry(1.3, 1.5, 1.4, 12), pbr(0x6f747a, 0.7, 0.15), 5.4));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 3, 8), pbr(0x3a3d42, 0.5, 0.4)); barrel.rotation.z = Math.PI / 2; barrel.position.set(t.team === 0 ? 1.7 : -1.7, 5.4, 0); g.add(barrel);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); place(g, t.c, t.r);
  }
  // Epic "Sea-Naga" nest: a rocky ring + a coiled serpent with a glowing head
  { const g = new THREE.Group();
    const nest = new THREE.Mesh(new THREE.TorusGeometry(3.6, 1.2, 10, 22), pbr(0x33454e, 0.7, 0.15)); nest.rotation.x = Math.PI / 2; nest.position.y = 0.5; g.add(nest);
    const coil = new THREE.Group();
    for (let i = 0; i < 3; i++) { const co = new THREE.Mesh(new THREE.TorusGeometry(2.5 - i * 0.6, 0.55, 8, 18), pbr(0x1f7a44, 0.45, 0.25, 0x0f3a22, 0.55)); co.rotation.x = Math.PI / 2; co.position.y = 1.4 + i * 0.95; coil.add(co); }
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.3, 7), pbr(0x29a35c, 0.4, 0.3, 0x18b35e, 0.85)); head.position.set(1.5, 4.7, 0); head.rotation.z = -0.7; coil.add(head);
    g.add(coil); spinners.push(coil);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); place(g, map.epic.c, map.epic.r, 2.6);
  }

  // ---- animated water shader (fresnel + sun spec + sky reflection) ---------
  const waterUni = {
    uTime: { value: 0 }, uSun: { value: sunDir.clone() }, uSunCol: { value: new THREE.Color(0xfff0d0) },
    uDeep: { value: new THREE.Color(0x0a5066) }, uShallow: { value: new THREE.Color(0x39c4c4) },
    uSkyLo: { value: new THREE.Color(0xd8f1f2) }, uSkyHi: { value: new THREE.Color(0x4aa6d8) }, uCam: { value: new THREE.Vector3() },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W * 1.5, MAP_H * 1.8, 150, 110).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true, uniforms: waterUni,
      vertexShader: `uniform float uTime; varying vec3 vW; varying vec3 vN;
        float wave(vec2 p){ return sin(p.x*0.18+uTime*1.1)*0.32 + sin(p.y*0.23-uTime*1.4)*0.26 + sin((p.x+p.y)*0.11+uTime*0.7)*0.3; }
        void main(){ vec3 p=position; float h=wave(p.xz); p.y+=h; vW=(modelMatrix*vec4(p,1.0)).xyz;
          float e=1.2; vec3 dx=vec3(e,wave(p.xz+vec2(e,0.0))-h,0.0); vec3 dz=vec3(0.0,wave(p.xz+vec2(0.0,e))-h,e); vN=normalize(cross(dz,dx));
          gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0); }`,
      fragmentShader: `precision highp float; uniform vec3 uSun,uSunCol,uDeep,uShallow,uSkyLo,uSkyHi,uCam; varying vec3 vW; varying vec3 vN;
        void main(){ vec3 N=normalize(vN); vec3 V=normalize(uCam-vW); float fres=pow(1.0-max(dot(N,V),0.0),4.0);
          vec3 R=reflect(-V,N); vec3 skyc=mix(uSkyLo,uSkyHi,clamp(R.y*1.4,0.0,1.0));
          float ripple=0.5+0.5*sin(vW.x*0.5+vW.z*0.4); vec3 base=mix(uDeep,uShallow,ripple*0.5);
          vec3 H=normalize(V+normalize(uSun)); float spec=pow(max(dot(N,H),0.0),220.0);
          vec3 col=mix(base,skyc,clamp(fres*0.7+0.08,0.0,1.0))+uSunCol*spec*1.6;
          gl_FragColor=vec4(col,0.86); }`,
    }),
  );
  water.position.y = 0; scene.add(water);

  // ---- hero ship (Phase 2): placed from sim coords, click-to-move ---------
  const SHIP_Y = 0.55;
  const hstart = gridToWorld(13, Math.round((GRID_H - 1) / 2));   // ally lane mouth (on water)
  const hero = { mesh: chosen.build(0), pos: new THREE.Vector3(hstart.x, SHIP_Y, hstart.z), target: new THREE.Vector3(hstart.x, SHIP_Y, hstart.z), yaw: 0, speed: chosen.speed, dash: null, rooted: false };
  hero.mesh.position.copy(hero.pos); scene.add(hero.mesh);
  const joy = { active: false, jx: 0, jy: 0 };            // left thumbstick state (set by the on-screen joystick)
  // ability VFX pool + combat (Phase 5) + the Bahtera kit (Phase 4)
  const vfx = [];
  const addVfx = (mesh, life, update) => { scene.add(mesh); vfx.push({ mesh, t: 0, life, update }); };
  let goldEl = null;
  const combat = createCombat({ scene, map, hero, addVfx, heroStats: { hp: chosen.hp, dmg: chosen.dmg, rng: chosen.rng, atkCd: chosen.atkCd }, onGold: (g) => { if (goldEl) goldEl.textContent = g; }, onMatchEnd: (win) => showResult(win), onXp: (n) => kit.gainXp(n), onEvent: (ev) => { if (ev === 'core' || ev === 'turret') snd.boom(); else if (ev === 'shoot') snd.shoot(); } });
  const kit = makeKit(chosen.skills(), { hero, addVfx, enemiesNear: combat.enemiesNear, hit: combat.hit, alliesNear: combat.alliesNear, heal: combat.heal, shieldUnit: combat.shieldUnit, onLevel: (lvl) => combat.setHeroLevel(lvl) });
  // ---- Phase 7: item shop (small curated set) ----------------------------
  const SHOP = [
    { name: 'Cannon Powder', icon: '🧨', cost: 350, desc: '+14 attack', buy: () => combat.buffHero({ dmg: 14 }) },
    { name: 'Iron Plating', icon: '🛡', cost: 450, desc: '+220 max HP', buy: () => combat.buffHero({ hp: 220 }) },
    { name: 'War Drum', icon: '🥁', cost: 400, desc: '+25% atk speed', buy: () => combat.buffHero({ atkMul: 1.25 }) },
    { name: 'Storm Sails', icon: '⛵', cost: 300, desc: '+18% move speed', buy: () => { hero.speed *= 1.18; } },
    { name: 'Powder Keg', icon: '🛢️', cost: 320, desc: '+50% powder regen', buy: () => kit.boostPowder(1.5) },
    { name: 'Kris Charm', icon: '🗡️', cost: 520, desc: '+12% lifesteal', buy: () => combat.buffHero({ lifesteal: 0.12 }) },
  ];
  const owned = new Set();
  // selection ring on the water under the hero
  const selRing = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.2, 8, 36), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2; selRing.position.set(hstart.x, 0.18, hstart.z); scene.add(selRing);
  // click-ping marker
  const ping = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 24), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ping.rotation.x = -Math.PI / 2; ping.position.y = 0.2; scene.add(ping); let pingT = 0;
  const showPing = (x, z) => { ping.position.set(x, 0.2, z); pingT = 1; };

  // ---- eased RTS camera (pan + zoom + rotate, opening ease, idle drift) ----
  const camTarget = new THREE.Vector3(0, 0, 0), camTargetGoal = new THREE.Vector3(0, 0, 0);
  let camDist = 205, camDistGoal = 142;                  // opening: ease in from far → ML-style close follow
  let camYaw = THREE.MathUtils.degToRad(-24), camYawGoal = THREE.MathUtils.degToRad(-18);
  let camPitch = THREE.MathUtils.degToRad(57), camPitchGoal = camPitch;   // tilt — adjustable (30°=low/horizon … 80°=top-down)
  const ZMIN = 40, ZMAX = 320, DEF_DIST = 142, DEF_YAW = THREE.MathUtils.degToRad(-18), DEF_PITCH = THREE.MathUtils.degToRad(57);
  const tiltBy = (deg) => { touch(); camPitchGoal = THREE.MathUtils.clamp(camPitchGoal + THREE.MathUtils.degToRad(deg), THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(80)); };
  const zoomBy = (d) => { touch(); camDistGoal = THREE.MathUtils.clamp(camDistGoal + d, ZMIN, ZMAX); };
  const rotateBy = (r) => { touch(); camYawGoal += r; };
  const resetView = () => { touch(); camDistGoal = DEF_DIST; camYawGoal = DEF_YAW; camPitchGoal = DEF_PITCH; };
  const offset = new THREE.Vector3(), desired = new THREE.Vector3();
  let interacted = false; const touch = () => { interacted = true; };
  function updateCamera(dt, instant) {
    const k = instant ? 1 : 1 - Math.pow(0.0014, dt);
    camDist += (camDistGoal - camDist) * k; camYaw += (camYawGoal - camYaw) * k; camPitch += (camPitchGoal - camPitch) * k; camTarget.lerp(camTargetGoal, k);
    offset.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch)).multiplyScalar(camDist);
    desired.copy(camTarget).add(offset);
    camera.position.lerp(desired, k); camera.lookAt(camTarget); waterUni.uCam.value.copy(camera.position);
  }
  updateCamera(0, true);

  // click/tap to MOVE the hero: raycast the pointer onto the water plane → order
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPt = new THREE.Vector3();
  function orderMove(px, py) {
    if (combat.heroDead || combat.over) return;
    ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(groundPlane, hitPt)) return;
    hitPt.x = THREE.MathUtils.clamp(hitPt.x, -MAP_W / 2 + 3, MAP_W / 2 - 3); hitPt.z = THREE.MathUtils.clamp(hitPt.z, -MAP_H / 2 + 3, MAP_H / 2 - 3);
    hero.target.set(hitPt.x, SHIP_Y, hitPt.z); showPing(hitPt.x, hitPt.z); touch();
  }
  let down = null;                                  // a press that doesn't drift = a move order (vs a rotate-drag later)
  const press = (x, y) => { down = { x, y }; };
  const release = (x, y) => { if (down && Math.hypot(x - down.x, y - down.y) < 9) orderMove(x, y); down = null; };
  canvas.addEventListener('mousedown', (e) => press(e.clientX, e.clientY));
  const onMouseUp = (e) => release(e.clientX, e.clientY); addEventListener('mouseup', onMouseUp);
  let pinchD = 0, pinching = false;
  const tdist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  canvas.addEventListener('touchstart', (e) => { if (e.touches.length >= 2) { pinching = true; pinchD = tdist(e); down = null; } else { const t = e.touches[0]; press(t.clientX, t.clientY); } }, { passive: true });
  canvas.addEventListener('touchmove', (e) => { if (e.touches.length >= 2) { pinching = true; const d = tdist(e); zoomBy((pinchD - d) * 0.6); pinchD = d; down = null; } }, { passive: true });
  canvas.addEventListener('touchend', (e) => { if (pinching) { if (e.touches.length === 0) pinching = false; return; } const t = e.changedTouches[0]; release(t.clientX, t.clientY); }, { passive: true });
  const onWheel = (e) => { zoomBy(Math.sign(e.deltaY) * 14); };
  addEventListener('wheel', onWheel, { passive: true });
  const onKey = (e) => { const k = e.key.toLowerCase(); if (k === 'q') { touch(); camYawGoal += 0.32; } else if (k === 'e') { touch(); camYawGoal -= 0.32; } else if (k === '[') { tiltBy(6); } else if (k === ']') { tiltBy(-6); } else if (!combat.heroDead && !combat.over) { if (k === '1') { if (kit.tryCast(0)) snd.cast(0); } else if (k === '2') { if (kit.tryCast(1)) snd.cast(1); } else if (k === '3' || k === 'r') { if (kit.tryCast(2)) snd.cast(2); } } };
  addEventListener('keydown', onKey);

  // ---- minimal HUD (Phase 1) ---------------------------------------------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;';
  const skBtn = (s, i) => `<div class="sk" data-i="${i}" style="position:relative;width:60px;height:60px;border-radius:50%;border:2px solid rgba(255,255,255,0.55);background:radial-gradient(circle at 50% 35%,#2a566e,#15303f);color:#fff;font-size:22px;font-weight:800;cursor:pointer;overflow:hidden;pointer-events:auto;display:flex;align-items:center;justify-content:center;">` +
    `<span style="position:relative;z-index:2;">${s.letter}</span>` +
    `<div class="cd" style="position:absolute;left:0;right:0;bottom:0;height:0%;background:rgba(8,16,24,0.62);z-index:1;"></div>` +
    `<div class="cdn" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;z-index:3;"></div>` +
    `<div class="lv" style="position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:700;color:#ffe27a;text-shadow:0 1px 2px #000;z-index:3;">Lv1</div>` +
    `<div class="plus" data-i="${i}" hidden style="position:absolute;top:-7px;right:-5px;width:20px;height:20px;border-radius:50%;background:#3fae6a;color:#fff;font-size:14px;line-height:20px;text-align:center;cursor:pointer;z-index:4;">+</div>` +
    `</div>`;
  hud.innerHTML =
    `<button class="moba-quit" style="position:absolute;top:calc(106px + env(safe-area-inset-top));left:10px;width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,0.85);color:#16384c;font-size:20px;font-weight:700;cursor:pointer;pointer-events:auto;">‹</button>` +
    `<div style="position:absolute;top:calc(106px + env(safe-area-inset-top));left:52px;display:flex;flex-direction:row;gap:6px;">${['cam-help|❔', 'cam-toggle|🎥'].map((b) => { const [c, g] = b.split('|'); return `<button class="${c}" style="pointer-events:auto;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,0.3);background:rgba(15,40,55,0.6);color:#fff;font-size:16px;cursor:pointer;">${g}</button>`; }).join('')}</div>` +
    `<div class="cam-pad" hidden style="position:absolute;top:calc(150px + env(safe-area-inset-top));left:10px;background:rgba(10,26,36,0.94);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:8px;display:grid;grid-template-columns:40px 40px;gap:6px;pointer-events:auto;">` +
      `<div style="grid-column:1/3;font-size:10px;color:#9fc4d6;text-align:center;letter-spacing:.5px;">CAMERA</div>` +
      [['rotL', '⟲'], ['rotR', '⟳'], ['zoomout', '－'], ['zoomin', '＋'], ['tiltlow', '⤓'], ['tilttop', '⤒']].map(([k, g]) => `<button data-cam="${k}" style="width:40px;height:38px;border-radius:9px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.07);color:#fff;font-size:17px;cursor:pointer;">${g}</button>`).join('') +
      `<button data-cam="reset" style="grid-column:1/3;height:30px;border-radius:9px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.07);color:#cfeaf6;font-size:11px;font-weight:700;cursor:pointer;">⊙ Reset view</button>` +
    `</div>` +
    `<div style="position:absolute;top:calc(12px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:rgba(15,40,55,0.6);color:#fff;padding:7px 16px;border-radius:999px;font-size:13px;font-weight:700;">⚓ Sungai Naga — Phase 8 · 3v3 + Jungle  <span style="opacity:.7;font-weight:500;">farm camps · slay the Sea-Naga · raze turrets → Core</span></div>` +
    `<div class="naga-chip" style="position:absolute;top:calc(46px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:rgba(15,40,55,0.5);color:#bff0d0;padding:4px 13px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;">🐉 Sea-Naga</div>` +
    `<canvas class="mmap" width="300" height="188" style="position:absolute;left:10px;top:calc(10px + env(safe-area-inset-top));width:140px;height:88px;border-radius:8px;border:1px solid rgba(255,255,255,0.28);background:rgba(12,30,40,0.62);pointer-events:none;"></canvas>` +
    `<div style="position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;display:flex;gap:8px;align-items:center;"><button class="shopbtn" style="pointer-events:auto;background:rgba(15,40,55,0.6);color:#ffe27a;border:1px solid rgba(255,255,255,0.3);padding:7px 12px;border-radius:999px;font-size:14px;font-weight:800;cursor:pointer;">🛒 Shop</button><div style="background:rgba(15,40,55,0.6);color:#ffe27a;padding:7px 14px;border-radius:999px;font-size:15px;font-weight:800;">💰 <span class="gold">200</span></div></div>` +
    `<div class="shop" hidden style="position:absolute;right:12px;top:60px;width:240px;background:rgba(10,26,36,0.96);border:1px solid rgba(255,255,255,0.22);border-radius:12px;padding:10px;z-index:6;pointer-events:auto;max-height:72vh;overflow:auto;"><div style="color:#fff;font-weight:800;font-size:13px;margin-bottom:7px;">⚓ Quartermaster — buy with 💰</div><div class="shoplist"></div></div>` +
    `<div style="position:absolute;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom));color:#fff;font-size:12px;background:rgba(15,40,55,0.55);padding:6px 10px;border-radius:8px;text-align:center;">Lv <b class="hlv">1</b> · ${chosen.icon} ${chosen.name} <span style="opacity:.6;">(${chosen.era})</span><div style="width:130px;height:9px;border-radius:6px;background:rgba(0,0,0,0.45);overflow:hidden;margin-top:4px;"><span class="hhp" style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#3fae6a,#7fe0a0);"></span></div><div style="width:130px;height:5px;border-radius:4px;background:rgba(0,0,0,0.45);overflow:hidden;margin-top:3px;"><span class="hxp" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#a06fd0,#d6b0f0);"></span></div></div>` +
    `<div style="position:absolute;right:24px;bottom:calc(94px + env(safe-area-inset-bottom));width:206px;height:9px;border-radius:6px;background:rgba(0,0,0,0.45);overflow:hidden;"><span class="pwd" style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#c9a23a,#ffe27a);"></span></div>` +
    `<div class="moba-skills" style="position:absolute;right:24px;bottom:calc(20px + env(safe-area-inset-bottom));display:flex;gap:14px;">${kit.skills.map(skBtn).join('')}</div>` +
    `<button class="atk-btn" style="position:absolute;right:248px;bottom:calc(30px + env(safe-area-inset-bottom));width:66px;height:66px;border-radius:50%;border:2px solid rgba(255,150,100,0.75);background:radial-gradient(circle at 50% 34%,#8a3a2a,#42150f);color:#fff;font-size:25px;font-weight:800;cursor:pointer;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,0.4);">⚔</button>` +
    `<div class="joy-base" style="position:absolute;left:calc(26px + env(safe-area-inset-left));bottom:calc(26px + env(safe-area-inset-bottom));width:128px;height:128px;border-radius:50%;background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.22);pointer-events:auto;touch-action:none;"><div class="joy-knob" style="position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(159,232,255,0.34);border:2px solid rgba(159,232,255,0.6);"></div></div>` +
    `<div class="resp" hidden style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);background:rgba(15,40,55,0.82);color:#fff;padding:12px 22px;border-radius:12px;font-size:17px;font-weight:800;text-align:center;">⚓ Sunk! Respawning in <span class="respn">5</span>s</div>` +
    `<div class="moba-result" hidden style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,25,35,0.72);z-index:5;"><div style="background:linear-gradient(180deg,#fff,#e7f4f2);border-radius:20px;padding:26px 34px;text-align:center;box-shadow:0 12px 40px rgba(20,50,70,0.5);border:2px solid #2f7f78;"><h2 class="rtitle" style="margin:0;font-size:30px;letter-spacing:1px;"></h2><p class="rsub" style="color:#16384c;margin:10px 0 16px;font-size:15px;"></p><button class="rbtn" style="background:#e2a23a;color:#3a2a10;border:none;border-radius:12px;padding:12px 28px;font-weight:800;font-size:16px;cursor:pointer;pointer-events:auto;">Continue</button></div></div>`;
  overlay.appendChild(hud);
  // force landscape on mobile — ask to rotate, and pause while portrait
  let blocked = false;
  const rotEl = document.createElement('div'); rotEl.className = 'moba-rotate';
  rotEl.style.cssText = 'position:absolute;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0c1f2a;color:#fff;text-align:center;padding:24px;pointer-events:auto;font-family:system-ui,sans-serif;';
  rotEl.innerHTML = `<div style="font-size:58px;">⟳</div><div style="font-size:17px;line-height:1.6;">Rotate your device to <b style="color:#ffd27f;">landscape</b><br>to play <b>Sungai Naga</b>.</div>`;
  overlay.appendChild(rotEl);
  // hit-feedback: a red vignette that flashes when the player hero takes damage
  const hurtVig = document.createElement('div');
  hurtVig.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;opacity:0;background:radial-gradient(ellipse at center, transparent 42%, rgba(200,30,20,0.6) 100%);';
  overlay.appendChild(hurtVig);
  let lastHeroHp = 1e9, hurtT = 0, lastLevel = 1, lastNagaDown = false;
  // ---- How-to-Play card (shown at match start; reopen with the ❔ button) ----
  const helpEl = document.createElement('div');
  helpEl.style.cssText = 'position:absolute;inset:0;z-index:12;display:flex;align-items:center;justify-content:center;background:rgba(8,22,30,0.78);padding:18px;pointer-events:auto;font-family:system-ui,sans-serif;';
  helpEl.innerHTML = `<div style="max-width:480px;width:100%;max-height:90%;overflow:auto;background:linear-gradient(180deg,#0e2a38,#0b202c);border:1px solid rgba(255,255,255,0.18);border-radius:16px;padding:20px 22px;color:#eaf6ff;box-shadow:0 16px 48px rgba(0,0,0,0.5);">
      <h2 style="margin:0 0 4px;font-size:21px;letter-spacing:.5px;">⚓ How to Play — <b style="color:#9fe8ff;">${chosen.name}</b></h2>
      <div style="opacity:.7;font-size:12px;margin-bottom:12px;">Sungai Naga · ${chosen.era} ${chosen.role}</div>
      <div style="font-size:13.5px;line-height:1.7;">
        🎯 <b>Goal</b> — raze the enemy turrets, then sink their <b>Core</b> to win.<br>
        🕹️ <b>Move</b> — drag the <b>left joystick</b> to steer your ship (or tap the water to sail there).<br>
        ⚔️ <b>Attack</b> — your ship <b>auto-fires cannons</b> at any enemy in range. Tap the <b>⚔ button</b> to charge the nearest foe.<br>
        ✨ <b>Skills</b> — tap <b>${kit.skills.map((s) => s.letter).join(' / ')}</b> (or keys 1 2 3). They cost Powder &amp; have cooldowns; tap the <b>+</b> to rank one up on level-up.<br>
        💰 <b>Gold &amp; XP</b> — sink ships near you to earn both; open <b>🛒 Shop</b> to buy upgrades.<br>
        🐉 <b>Sea-Naga</b> — slay the serpent in the middle for your team's <b>Blessing</b> (+40% damage).<br>
        🦀 <b>Jungle</b> — clear the corner camps for bonus gold.<br>
        🗺️ <b>Minimap</b> (bottom-right) — green is your side, red the enemy.<br>
        🎥 <b>Camera</b> — <b>Q / E</b> rotate · scroll / pinch to zoom · <b>⤒ / ⤓</b> (or <b>[ ]</b>) to tilt the angle.
      </div>
      <button class="help-go" style="margin-top:16px;width:100%;background:#e2a23a;color:#3a2a10;border:none;border-radius:11px;padding:12px;font-weight:800;font-size:16px;cursor:pointer;pointer-events:auto;">Set sail ⚓</button>
    </div>`;
  overlay.appendChild(helpEl);
  let ended = false; const finish = (r) => { if (ended) return; ended = true; cleanup(); onResult?.(r); };
  hud.querySelector('.moba-quit').onclick = () => { snd.tap(); finish({ win: false, quit: true }); };
  hud.querySelector('.cam-help').onclick = () => { snd.tap(); helpEl.style.display = 'flex'; };
  // ⚔ basic-attack button — sail to the nearest enemy and let the ship auto-fire
  const doAttack = () => { if (!canAct()) return; snd.tap(); const e = combat.nearestEnemy(hero.pos.x, hero.pos.z); if (!e) return; const dx = hero.pos.x - e.x, dz = hero.pos.z - e.z, d = Math.hypot(dx, dz) || 1; const stop = Math.max(0, chosen.rng - 1.2); hero.target.set(e.x + dx / d * stop, SHIP_Y, e.z + dz / d * stop); showPing(e.x, e.z); touch(); };
  hud.querySelector('.atk-btn').onclick = doAttack;
  const camPad = hud.querySelector('.cam-pad'); camPad.style.display = 'none';   // inline display:grid overrides [hidden], so drive via style
  hud.querySelector('.cam-toggle').onclick = () => { snd.tap(); camPad.style.display = camPad.style.display === 'none' ? 'grid' : 'none'; };
  const camActs = { rotL: () => rotateBy(0.4), rotR: () => rotateBy(-0.4), zoomin: () => zoomBy(-26), zoomout: () => zoomBy(26), tilttop: () => tiltBy(8), tiltlow: () => tiltBy(-8), reset: () => resetView() };
  camPad.querySelectorAll('[data-cam]').forEach((btn) => { btn.onclick = () => { snd.tap(); camActs[btn.dataset.cam]?.(); }; });
  helpEl.querySelector('.help-go').onclick = () => { snd.tap(); helpEl.style.display = 'none'; };
  // ---- left thumbstick (move) ----
  const joyBase = hud.querySelector('.joy-base'), joyKnob = hud.querySelector('.joy-knob'); const joyR = 52; let joyCx = 0, joyCy = 0;
  const joyMove = (x, y) => { let dx = x - joyCx, dy = y - joyCy; const d = Math.hypot(dx, dy); if (d > joyR) { dx = dx / d * joyR; dy = dy / d * joyR; } joyKnob.style.transform = `translate(${dx}px,${dy}px)`; joy.jx = dx / joyR; joy.jy = dy / joyR; touch(); };
  const joyEnd = () => { joy.active = false; joy.jx = 0; joy.jy = 0; joyKnob.style.transform = ''; };
  joyBase.addEventListener('pointerdown', (e) => { e.preventDefault(); snd.tap(); joyBase.setPointerCapture?.(e.pointerId); const r = joyBase.getBoundingClientRect(); joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2; joy.active = true; joyMove(e.clientX, e.clientY); });
  joyBase.addEventListener('pointermove', (e) => { if (joy.active) joyMove(e.clientX, e.clientY); });
  joyBase.addEventListener('pointerup', joyEnd); joyBase.addEventListener('pointercancel', joyEnd);
  const respEl = hud.querySelector('.resp'), respN = hud.querySelector('.respn'), resultEl = hud.querySelector('.moba-result');
  resultEl.style.display = 'none';   // inline display:flex overrides [hidden], so drive it via style
  function showResult(win) {
    const tt = resultEl.querySelector('.rtitle'); tt.textContent = win ? 'VICTORY' : 'DEFEAT'; tt.style.color = win ? '#2f7f78' : '#c0463a';
    resultEl.querySelector('.rsub').textContent = win ? 'The enemy Core is sunk — Kampong Ayer holds the channel.' : 'Your Core has fallen to the warlord.';
    resultEl.style.display = 'flex'; if (win) snd.win(); else snd.lose(); resultEl.querySelector('.rbtn').onclick = () => finish({ win, stars: win ? 1 : 0 });
  }
  const canAct = () => !combat.heroDead && !combat.over;
  // skill buttons: cast on click; the corner + levels the skill
  const skEls = [...hud.querySelectorAll('.moba-skills .sk')];
  skEls.forEach((el, i) => { el.onclick = (e) => { if (e.target.classList.contains('plus')) return; if (canAct()) { if (kit.tryCast(i)) snd.cast(i); touch(); } }; el.querySelector('.plus').onclick = (e) => { e.stopPropagation(); if (kit.levelUp(i)) snd.tap(); }; });
  const elPwd = hud.querySelector('.pwd'), elHlv = hud.querySelector('.hlv'), elHhp = hud.querySelector('.hhp'), elHxp = hud.querySelector('.hxp'), nagaChip = hud.querySelector('.naga-chip');
  // ---- Phase 10: minimap ----
  const MMW = 300, MMH = 188, mmCtx = hud.querySelector('.mmap').getContext('2d');
  const w2m = (x, z) => [(x / MAP_W + 0.5) * MMW, (z / MAP_H + 0.5) * MMH];
  const mmLanes = map.lanes.map((lane) => lane.map((pt) => { const w = gridToWorld(pt.c, pt.r); return w2m(w.x, w.z); }));
  function drawMinimap() {
    const g = mmCtx; g.clearRect(0, 0, MMW, MMH);
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 11; g.lineCap = 'round';
    for (const lane of mmLanes) { g.beginPath(); lane.forEach(([mx, my], i) => i ? g.lineTo(mx, my) : g.moveTo(mx, my)); g.stroke(); }
    for (const bl of combat.blips()) {
      const [mx, my] = w2m(bl.x, bl.z);
      const col = bl.team === 0 ? '#46d06a' : (bl.team === 1 ? '#ff5246' : '#d9b24a');
      if (bl.kind === 'core') { g.fillStyle = col; g.fillRect(mx - 6, my - 6, 12, 12); }
      else if (bl.kind === 'turret') { g.fillStyle = col; g.fillRect(mx - 4, my - 4, 8, 8); }
      else if (bl.kind === 'epic') { g.strokeStyle = '#8fe6b0'; g.lineWidth = 3; g.beginPath(); g.arc(mx, my, 7, 0, 6.3); g.stroke(); }
      else if (bl.kind === 'camp') { g.fillStyle = '#d9b24a'; g.beginPath(); g.arc(mx, my, 5, 0, 6.3); g.fill(); }
      else if (bl.kind === 'hero') { if (bl.me) { g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my, 7, 0, 6.3); g.fill(); g.strokeStyle = '#9fe8ff'; g.lineWidth = 3; g.stroke(); } else { g.fillStyle = col; g.beginPath(); g.arc(mx, my, 6, 0, 6.3); g.fill(); } }
      else { g.globalAlpha = 0.65; g.fillStyle = col; g.beginPath(); g.arc(mx, my, 3, 0, 6.3); g.fill(); g.globalAlpha = 1; }
    }
  }
  goldEl = hud.querySelector('.gold');
  // ---- shop: render rows, toggle panel, buy ----
  const shopEl = hud.querySelector('.shop'), shopList = hud.querySelector('.shoplist');
  hud.querySelector('.shopbtn').onclick = () => { snd.tap(); shopEl.hidden = !shopEl.hidden; };
  const shopRows = SHOP.map((it, i) => {
    const row = document.createElement('button');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;margin:4px 0;padding:7px 8px;border-radius:9px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.05);color:#fff;cursor:pointer;font:inherit;';
    row.innerHTML = `<span style="font-size:20px;">${it.icon}</span><span style="flex:1;line-height:1.25;"><b style="font-size:12.5px;">${it.name}</b><br><span style="opacity:.72;font-size:11px;">${it.desc}</span></span><span class="cost" style="color:#ffe27a;font-weight:800;font-size:12px;white-space:nowrap;">💰${it.cost}</span>`;
    row.onclick = () => {
      if (owned.has(i) || combat.over) return;
      if (combat.spend(it.cost)) { it.buy(); owned.add(i); row.querySelector('.cost').textContent = '✓ owned'; row.style.opacity = 0.5; row.disabled = true; snd.buy(); }
    };
    shopList.appendChild(row); return row;
  });
  function updateSkillHud() {
    elPwd.style.width = (kit.powder / kit.powderMax * 100) + '%'; elHlv.textContent = kit.heroLevel;
    elHhp.style.width = (combat.heroHp / combat.heroMaxHp * 100) + '%';
    elHxp.style.width = (kit.heroLevel >= 15 ? 100 : kit.xp / kit.xpNeed * 100) + '%';
    if (combat.heroDead) { respEl.hidden = false; respN.textContent = combat.respawnIn; } else respEl.hidden = true;
    const ns = combat.nagaState;
    if (ns.buffT > 0 && ns.buffTeam === 0) { nagaChip.style.color = '#9affc0'; nagaChip.textContent = `🐉 Naga's Blessing · +40% dmg · ${Math.ceil(ns.buffT)}s`; }
    else if (ns.buffT > 0 && ns.buffTeam === 1) { nagaChip.style.color = '#ffb0a0'; nagaChip.textContent = `⚠ Enemy holds the Blessing · ${Math.ceil(ns.buffT)}s`; }
    else if (ns.down) { nagaChip.style.color = '#9fb0bc'; nagaChip.textContent = '🐉 Sea-Naga slain — it will return'; }
    else { nagaChip.style.color = '#bff0d0'; nagaChip.textContent = `🐉 Sea-Naga — slay for the Blessing (${Math.round(ns.hpFrac * 100)}%)`; }
    if (kit.heroLevel > lastLevel) { lastLevel = kit.heroLevel; snd.level(); }
    if (ns.down && !lastNagaDown) snd.roar(); lastNagaDown = ns.down;
    shopRows.forEach((row, i) => { if (!owned.has(i)) row.style.opacity = combat.gold >= SHOP[i].cost ? 1 : 0.5; });
    kit.skills.forEach((s, i) => { const el = skEls[i]; const frac = s.t > 0 ? s.t / kit.cdOf(s) : 0; el.querySelector('.cd').style.height = (frac * 100) + '%'; el.querySelector('.cdn').textContent = s.t > 0 ? Math.ceil(s.t) : ''; el.querySelector('.lv').textContent = 'Lv' + s.level; el.style.opacity = (kit.powder < s.cost && s.t <= 0) ? 0.55 : 1; const plus = el.querySelector('.plus'); plus.hidden = !(kit.points > 0 && s.level < s.max); });
  }
  updateSkillHud();

  // ---- loop + resize + cleanup -------------------------------------------
  const clock = new THREE.Clock(); let raf = 0, running = true;
  const _d = new THREE.Vector3();
  function updateHero(dt, t) {
    if (combat.heroDead) { selRing.visible = false; return; }   // sunk — hidden in the fountain
    selRing.visible = true;
    if (hero.dash) {                                      // Ram dash overrides normal sailing
      hero.pos.x = THREE.MathUtils.clamp(hero.pos.x + hero.dash.dx * hero.dash.spd * dt, -MAP_W / 2 + 3, MAP_W / 2 - 3);
      hero.pos.z = THREE.MathUtils.clamp(hero.pos.z + hero.dash.dz * hero.dash.spd * dt, -MAP_H / 2 + 3, MAP_H / 2 - 3);
      hero.dash.t -= dt; if (hero.dash.t <= 0) hero.dash = null;
    } else if (!hero.rooted) {                            // Broadside roots the ship while channeling
      if (joy.active && (joy.jx || joy.jy)) {             // LEFT THUMBSTICK — continuous steer relative to the camera (ML style)
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
        let mx = fx * -joy.jy + rx * joy.jx, mz = fz * -joy.jy + rz * joy.jx; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
        const mag = Math.min(1, Math.hypot(joy.jx, joy.jy));
        hero.pos.x = THREE.MathUtils.clamp(hero.pos.x + mx * hero.speed * mag * dt, -MAP_W / 2 + 3, MAP_W / 2 - 3);
        hero.pos.z = THREE.MathUtils.clamp(hero.pos.z + mz * hero.speed * mag * dt, -MAP_H / 2 + 3, MAP_H / 2 - 3);
        const goalYaw = Math.atan2(-mz, mx); let da = goalYaw - hero.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); hero.yaw += da * Math.min(1, dt * 9);
        hero.target.copy(hero.pos);                        // releasing the stick stops the ship
      } else {
        _d.copy(hero.target).sub(hero.pos); _d.y = 0; const dist = _d.length();
        if (dist > 0.25) {
          _d.normalize(); hero.pos.addScaledVector(_d, Math.min(dist, hero.speed * dt));
          const goalYaw = Math.atan2(-_d.z, _d.x);        // +x model forward → face heading
          let da = goalYaw - hero.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); hero.yaw += da * Math.min(1, dt * 7);
        }
      }
    }
    hero.mesh.position.set(hero.pos.x, SHIP_Y + Math.sin(t * 1.7) * 0.07, hero.pos.z);
    hero.mesh.rotation.y = hero.yaw; hero.mesh.rotation.z = Math.sin(t * 1.3) * 0.03;   // gentle roll
    selRing.position.set(hero.pos.x, 0.18, hero.pos.z); const ps = 1 + Math.sin(t * 3) * 0.04; selRing.scale.setScalar(ps);
    if (pingT > 0) { pingT = Math.max(0, pingT - dt * 1.6); ping.material.opacity = pingT * 0.8; ping.scale.setScalar(1 + (1 - pingT) * 1.6); }
  }
  function updateVfx(dt) {
    for (let j = vfx.length - 1; j >= 0; j--) { const o = vfx[j]; o.t += dt; o.update?.(dt, o); if (o.t >= o.life) { scene.remove(o.mesh); o.mesh.traverse?.((m) => { m.geometry?.dispose?.(); m.material?.dispose?.(); }); vfx.splice(j, 1); } }
  }
  function frame() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    if (blocked) { clock.getDelta(); renderer.render(scene, camera); raf = requestAnimationFrame(frame); return; }  // paused in portrait
    waterUni.uTime.value += dt;
    if (!interacted) camYawGoal += dt * 0.06;             // slow attract-rotate until the player takes over
    for (const s of spinners) { s.rotation.y += dt * 0.6; s.position.y += Math.sin(t * 1.6) * dt * 0.25; }
    kit.tick(dt); updateHero(dt, t); combat.update(dt, camera); updateVfx(dt); updateSkillHud(); drawMinimap();
    if (!combat.heroDead && combat.heroHp < lastHeroHp - 0.5) { hurtT = 0.5; snd.hurt(); }   // took damage → flash + thud
    lastHeroHp = combat.heroHp; if (hurtT > 0) { hurtT = Math.max(0, hurtT - dt); hurtVig.style.opacity = hurtT.toFixed(2); }
    camTargetGoal.set(hero.pos.x, 0, hero.pos.z);          // camera follows the hero
    updateCamera(dt, false);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); blocked = innerWidth < innerHeight; rotEl.style.display = blocked ? 'flex' : 'none'; }
  addEventListener('resize', onResize);
  addEventListener('orientationchange', () => setTimeout(onResize, 150));
  function cleanup() { running = false; cancelAnimationFrame(raf); removeEventListener('resize', onResize); removeEventListener('mouseup', onMouseUp); removeEventListener('wheel', onWheel); removeEventListener('keydown', onKey); renderer.dispose(); renderer.forceContextLoss?.(); overlay.remove(); }
  onResize(); frame();

  // ---- debug hook (verification) -----------------------------------------
  window.__moba = {
    ok: () => true,
    stats: () => ({ verts: verts.length / 3, tris: idx.length / 3, bases: map.bases.length, turrets: map.turrets.length, lanes: map.lanes.length, drawCalls: renderer.info.render.calls, tris2: renderer.info.render.triangles }),
    grid: (c, r) => gridToWorld(c, r), unproject: (x, z) => worldToGrid(x, z),
    cam: (dist, tx, tz) => { camDistGoal = dist; camTargetGoal.set(tx || 0, 0, tz || 0); updateCamera(0, true); },
    hero: () => ({ x: +hero.pos.x.toFixed(1), z: +hero.pos.z.toFixed(1), tx: +hero.target.x.toFixed(1), tz: +hero.target.z.toFixed(1), yaw: +hero.yaw.toFixed(2) }),
    order: (x, z) => { hero.target.set(x, SHIP_Y, z); showPing(x, z); },
    joy: (jx, jy) => { joy.active = !!(jx || jy); joy.jx = jx || 0; joy.jy = jy || 0; return { active: joy.active, jx: joy.jx, jy: joy.jy }; },
    attack: () => { doAttack(); return combat.nearestEnemy(hero.pos.x, hero.pos.z); }, nearest: () => combat.nearestEnemy(hero.pos.x, hero.pos.z),
    layout: () => ({ joystick: !!hud.querySelector('.joy-base'), skillsRight: hud.querySelector('.moba-skills').style.right, mmTop: hud.querySelector('.mmap').style.top.includes('10px') }),
    step: (secs) => { const n = Math.ceil(secs / 0.05); for (let i = 0; i < n; i++) { kit.tick(0.05); updateHero(0.05, i * 0.05); combat.update(0.05, camera); updateVfx(0.05); } return { x: +hero.pos.x.toFixed(1), z: +hero.pos.z.toFixed(1) }; },
    cast: (i) => kit.tryCast(i), levelUp: (i) => kit.levelUp(i), vfxCount: () => vfx.length,
    combat: () => ({ units: combat.count(), gold: combat.gold, heroHp: Math.round(combat.heroHp), heroDead: combat.heroDead, respawnIn: combat.respawnIn, over: combat.over, eTurrets: combat.debug.turretsLeft(1), eCoreInvuln: combat.debug.coreInvuln(1) }),
    killTurrets: (team) => combat.debug.killTurrets(team), damageCore: (team, d) => combat.debug.damageCore(team, d), killHero: () => combat.debug.killHero(),
    bot: () => combat.debug.bot(), bots: () => combat.debug.bots(), killBot: () => combat.debug.killBot(), hurtBot: (n) => combat.debug.hurtBot(n),
    naga: () => combat.debug.naga(), killNaga: (team) => combat.debug.killNaga(team), hurtNaga: (n) => combat.debug.hurtNaga(n),
    camps: () => combat.debug.camps(), clearCamp: (i) => combat.debug.clearCamp(i),
    gainXp: (n) => kit.gainXp(n), buyItem: (i) => shopRows[i].onclick(), grantGold: (n) => combat.debug.grantGold(n),
    hurtHero: (n) => combat.debug.hurtHero(n), heroShield: () => combat.debug.heroShield(),
    drawMM: () => { drawMinimap(); const d = mmCtx.getImageData(0, 0, MMW, MMH).data; let nz = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nz++; return { nonBlankPx: nz, blips: combat.blips().length }; },
    sfxTest: () => { snd.cast(0); snd.level(); snd.boom(); snd.roar(); snd.win(); snd.lose(); snd.buy(); snd.shoot(); snd.hurt(); snd.tap(); return 'ok'; },
    tilt: (d) => { if (d !== undefined) tiltBy(d); return +THREE.MathUtils.radToDeg(camPitchGoal).toFixed(1); },
    zoom: (d) => { if (d !== undefined) zoomBy(d); return +camDistGoal.toFixed(0); },
    camPad: (open) => { if (open !== undefined) camPad.style.display = open ? 'grid' : 'none'; return { hidden: camPad.style.display === 'none', buttons: camPad.querySelectorAll('[data-cam]').length }; },
    help: (show) => { if (show !== undefined) helpEl.style.display = show ? 'flex' : 'none'; return getComputedStyle(helpEl).display; },
    mapSize: () => ({ MAP_W: +MAP_W.toFixed(0), MAP_H: +MAP_H.toFixed(0), GRID_W, GRID_H }),
    vig: () => parseFloat(hurtVig.style.opacity || 0),
    econ: () => ({ level: kit.heroLevel, xp: Math.round(kit.xp), xpNeed: kit.xpNeed, points: kit.points, gold: combat.gold, owned: [...owned], heroDmg: Math.round(combat.heroDmg), heroMaxHp: Math.round(combat.heroMaxHp), heroSpeed: +hero.speed.toFixed(1) }),
    kit: () => ({ powder: Math.round(kit.powder), heroLevel: kit.heroLevel, points: kit.points, cds: kit.skills.map((s) => +s.t.toFixed(1)), levels: kit.skills.map((s) => s.level), rooted: hero.rooted, dash: !!hero.dash }),
    shot: () => { renderer.render(scene, camera); },
    pick: () => ({ id: chosen.id, name: chosen.name, era: chosen.era, skills: kit.skills.map((s) => s.key), letters: kit.skills.map((s) => s.letter) }),
  };
  return overlay;
}

// ---- hero-select screen ----------------------------------------------------
function buildHeroSelect(container, onPick) {
  container.innerHTML = `<div style="padding:calc(20px + env(safe-area-inset-top)) 16px 24px;text-align:center;color:#eaf6ff;font-family:system-ui,sans-serif;">
    <h2 style="margin:4px 0 2px;font-size:22px;letter-spacing:1px;">⚓ Choose your Warship</h2>
    <div style="opacity:.7;font-size:13px;margin-bottom:16px;">Sungai Naga — pick a hero, push the lanes, sink the enemy Core</div>
    <div class="hs-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(228px,1fr));gap:12px;max-width:780px;margin:0 auto;"></div></div>`;
  const grid = container.querySelector('.hs-grid');
  for (const h of ROSTER.filter((x) => !x.locked)) {
    const card = document.createElement('button');
    card.className = 'hs-card';
    card.style.cssText = `text-align:left;background:rgba(255,255,255,0.05);border:1px solid ${h.accent}66;border-radius:14px;padding:14px;color:#eaf6ff;cursor:pointer;font:inherit;transition:transform .1s ease;pointer-events:auto;`;
    card.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="font-size:30px;">${h.icon}</span><span><b style="font-size:17px;">${h.name}</b><br><span style="font-size:11px;opacity:.85;color:${h.accent};">${h.era} · ${h.role}</span></span></div>
      <div style="font-size:12px;line-height:1.5;opacity:.85;min-height:54px;">${h.blurb}</div>
      <div style="display:flex;gap:12px;font-size:11px;opacity:.85;margin-top:8px;">❤ ${h.hp}&nbsp; ⚔ ${h.dmg}&nbsp; ◎ ${h.rng}&nbsp; ➤ ${h.speed}</div>
      <div style="margin-top:10px;text-align:center;background:${h.accent};color:#08222e;font-weight:800;border-radius:8px;padding:8px;">Choose ${h.name}</div>`;
    card.onpointerenter = () => { card.style.transform = 'translateY(-3px)'; };
    card.onpointerleave = () => { card.style.transform = ''; };
    card.onclick = () => onPick(h);
    grid.appendChild(card);
  }
}
