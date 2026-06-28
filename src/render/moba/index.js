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

const TEAM_COL = [0x35b6ff, 0xff5246];   // 0 = ally (azure), 1 = enemy (scarlet)

export function showMoba(audio, { mission, onResult } = {}) {
  const map = createMap();                 // ← the simulation's truth (grid)

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
  scene.fog = new THREE.Fog(0xbfe0ea, 120, 360);
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
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x21506a, 0.7));
  scene.add(new THREE.AmbientLight(0x3a5566, 0.35));

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

  // ---- eased RTS camera (pan + zoom + rotate, opening ease, idle drift) ----
  const camTarget = new THREE.Vector3(0, 0, 0), camTargetGoal = new THREE.Vector3(0, 0, 0);
  let camDist = 235, camDistGoal = 168;                  // opening: ease in from far → default framing
  let camYaw = THREE.MathUtils.degToRad(-30), camYawGoal = THREE.MathUtils.degToRad(-22);
  const camPitch = THREE.MathUtils.degToRad(53);
  const offset = new THREE.Vector3(), desired = new THREE.Vector3();
  let interacted = false; const touch = () => { interacted = true; };
  function updateCamera(dt, instant) {
    const k = instant ? 1 : 1 - Math.pow(0.0014, dt);
    camDist += (camDistGoal - camDist) * k; camYaw += (camYawGoal - camYaw) * k; camTarget.lerp(camTargetGoal, k);
    offset.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch)).multiplyScalar(camDist);
    desired.copy(camTarget).add(offset);
    camera.position.lerp(desired, k); camera.lookAt(camTarget); waterUni.uCam.value.copy(camera.position);
  }
  updateCamera(0, true);

  const clampTarget = () => { camTargetGoal.x = THREE.MathUtils.clamp(camTargetGoal.x, -MAP_W / 2, MAP_W / 2); camTargetGoal.z = THREE.MathUtils.clamp(camTargetGoal.z, -MAP_H / 2, MAP_H / 2); };
  let drag = null;
  const onDown = (x, y) => { drag = { x, y }; touch(); };
  const onMove = (x, y) => { if (!drag) return; const s = camDist * 0.0016; const fx = Math.sin(camYaw + Math.PI / 2), fz = Math.cos(camYaw + Math.PI / 2); camTargetGoal.x -= (x - drag.x) * s * Math.cos(camYaw) + (y - drag.y) * s * fx; camTargetGoal.z += (x - drag.x) * s * Math.sin(camYaw) - (y - drag.y) * s * fz; drag = { x, y }; clampTarget(); };
  const onUp = () => { drag = null; };
  canvas.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
  addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: true });
  canvas.addEventListener('touchmove', (e) => { const t = e.touches[0]; onMove(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', onUp);
  const onWheel = (e) => { touch(); camDistGoal = THREE.MathUtils.clamp(camDistGoal + Math.sign(e.deltaY) * 12, 70, 240); };
  addEventListener('wheel', onWheel, { passive: true });
  const onKey = (e) => { const k = e.key.toLowerCase(); if (k === 'q') { touch(); camYawGoal += 0.32; } else if (k === 'e') { touch(); camYawGoal -= 0.32; } };
  addEventListener('keydown', onKey);

  // ---- minimal HUD (Phase 1) ---------------------------------------------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;';
  hud.innerHTML =
    `<button class="moba-quit" style="position:absolute;top:calc(10px + env(safe-area-inset-top));left:10px;width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.85);color:#16384c;font-size:22px;font-weight:700;cursor:pointer;pointer-events:auto;">‹</button>` +
    `<div style="position:absolute;top:calc(12px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:rgba(15,40,55,0.6);color:#fff;padding:7px 16px;border-radius:999px;font-size:13px;font-weight:700;">⚓ Sungai Naga — Phase 1 · World  <span style="opacity:.7;font-weight:500;">drag to pan · wheel to zoom</span></div>`;
  overlay.appendChild(hud);
  let ended = false; const finish = (r) => { if (ended) return; ended = true; cleanup(); onResult?.(r); };
  hud.querySelector('.moba-quit').onclick = () => finish({ win: false, quit: true });

  // ---- loop + resize + cleanup -------------------------------------------
  const clock = new THREE.Clock(); let raf = 0, running = true;
  function frame() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    waterUni.uTime.value += dt;
    if (!interacted) camYawGoal += dt * 0.06;             // slow attract-rotate until the player takes over
    for (const s of spinners) { s.rotation.y += dt * 0.6; s.position.y += Math.sin(t * 1.6) * dt * 0.25; }
    updateCamera(dt, false);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', onResize);
  function cleanup() { running = false; cancelAnimationFrame(raf); removeEventListener('resize', onResize); removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp); removeEventListener('wheel', onWheel); removeEventListener('keydown', onKey); renderer.dispose(); renderer.forceContextLoss?.(); overlay.remove(); }
  frame();

  // ---- debug hook (verification) -----------------------------------------
  window.__moba = {
    ok: () => true,
    stats: () => ({ verts: verts.length / 3, tris: idx.length / 3, bases: map.bases.length, turrets: map.turrets.length, lanes: map.lanes.length, drawCalls: renderer.info.render.calls, tris2: renderer.info.render.triangles }),
    grid: (c, r) => gridToWorld(c, r), unproject: (x, z) => worldToGrid(x, z),
    cam: (dist, tx, tz) => { camDistGoal = dist; camTargetGoal.set(tx || 0, 0, tz || 0); updateCamera(0, true); },
    shot: () => { renderer.render(scene, camera); },
  };
  return overlay;
}
