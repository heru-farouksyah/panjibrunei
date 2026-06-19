// Landing at Muara — a 3rd-person ADVENTURE across Kampong Ayer.
//
// Three stilt villages joined by bridges, in traditional Bruneian dress, with a
// chained puzzle quest where each solution unlocks the next:
//   1) Village A: find 3 fish → the Boatman gives a Bridge Plank →
//      use the plank to mend the broken bridge to Village B.
//   2) Village B: find the Brass Key (greet the elder blocking the jetty) →
//      use the key to unlock the gate-bridge to Village C.
//   3) Village C: gather 3 cargo baskets → load them on the waterfront boat → win.
// You carry collected items in an inventory and spend them at the puzzles.
//
// Self-contained Three.js mission (own renderer/HUD, procedural audio, scoped
// CSS, full teardown). Plugs into the campaign reward loop via onResult().

import * as THREE from 'three';
import { RAMP, toon, place, canvasTex, skyDome, outlineMaterial } from './toonkit.js';
import { Audio as KAudio } from './kampongAudio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let styled = false;
function injectStyle() {
  if (styled) return; styled = true;
  const css = `
  .screen-overlay.kampong{padding:0;gap:0;overflow:hidden;background:#5fb9b4;touch-action:none;}
  .kampong canvas{display:block;width:100%;height:100%;touch-action:none;}
  .kampong .kq{position:absolute;inset:0;pointer-events:none;z-index:3;font-family:system-ui,-apple-system,sans-serif;}
  .kampong .kq button{pointer-events:auto;}
  .kampong .kq-quit{position:absolute;top:calc(8px + env(safe-area-inset-top));left:calc(8px + env(safe-area-inset-left));width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.85);color:#16384c;font-size:24px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(20,50,70,0.35);display:flex;align-items:center;justify-content:center;padding:0 4px 2px 0;}
  .kampong .kq-obj{position:absolute;top:calc(10px + env(safe-area-inset-top));left:54px;max-width:60vw;background:rgba(20,55,65,0.55);color:#fff;padding:8px 13px;border-radius:12px;font-size:12.5px;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,0.4);}
  .kampong .kq-obj b{color:#ffe08a;}
  .kampong .kq-inv{position:absolute;top:calc(10px + env(safe-area-inset-top));right:14px;display:flex;gap:6px;}
  .kampong .kq-chip{background:rgba(20,55,65,0.6);color:#fff;padding:6px 10px;border-radius:10px;font-size:15px;font-weight:700;display:flex;align-items:center;gap:3px;box-shadow:0 1px 4px rgba(0,0,0,0.25);}
  .kampong .kq-chip b{color:#ffe08a;}
  .kampong .kq-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.16),rgba(255,255,255,0.06));border:2px solid rgba(255,255,255,0.4);opacity:0;transition:opacity 0.15s;}
  .kampong .kq-joy::after{content:'';position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,0.55);transform:translate(var(--kx,0),var(--ky,0));}
  .kampong .kq-act{position:absolute;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#e2a23a;color:#3a2a10;border:none;border-radius:999px;padding:13px 24px;font-size:15px;font-weight:800;box-shadow:0 4px 16px rgba(40,90,120,0.4);cursor:pointer;animation:kqbob 1.1s ease-in-out infinite;max-width:88vw;}
  .kampong .kq-act[hidden]{display:none;}
  @keyframes kqbob{50%{transform:translateX(-50%) translateY(-4px);}}
  .kampong .kq-dialog{position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(440px,90vw);background:rgba(255,255,255,0.96);color:#16384c;border-radius:16px;padding:15px 18px 13px;box-shadow:0 8px 30px rgba(20,50,70,0.4);border:2px solid #2f7f78;pointer-events:auto;}
  .kampong .kq-dialog[hidden]{display:none;}
  .kampong .kq-who{font-weight:800;color:#2f7f78;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:5px;}
  .kampong .kq-text{font-size:15px;line-height:1.45;margin-bottom:11px;}
  .kampong .kq-ok{float:right;background:#2f7f78;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-weight:700;font-size:14px;cursor:pointer;}
  .kampong .kq-banner{position:absolute;left:50%;top:21%;transform:translateX(-50%) translateY(-8px);background:rgba(20,55,65,0.82);color:#fff;padding:11px 22px;border-radius:999px;font-size:16px;font-weight:700;white-space:nowrap;max-width:92vw;text-align:center;opacity:0;transition:opacity 0.3s,transform 0.3s;box-shadow:0 6px 20px rgba(20,50,70,0.45);}
  .kampong .kq-banner.show{opacity:1;transform:translateX(-50%) translateY(0);}
  .kampong .kq-rotate{position:absolute;inset:0;z-index:30;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#12333f;color:#fff;text-align:center;padding:24px;}
  .kampong .kq-rotate.show{display:flex;}
  .kampong .kq-rotate .ph{font-size:64px;line-height:1;transform-origin:50% 50%;animation:kqrot 1.8s ease-in-out infinite;}
  @keyframes kqrot{0%,35%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}
  .kampong .kq-rotate b{font-size:19px;letter-spacing:0.5px;}
  .kampong .kq-rotate small{opacity:0.82;font-size:13px;max-width:280px;}`;
  const el = document.createElement('style'); el.id = 'kq-style'; el.textContent = css; document.head.appendChild(el);
}

export function showKampong(audio, { mission, onResult } = {}) {
  injectStyle();
  const cfg = mission?.explore || {};
  const PAR_MIN = cfg.par || 4;
  const sfx = new KAudio();
  const rand = (a, b) => a + Math.random() * (b - a);
  function speak(text, pitch = 1) { try { const ss = window.speechSynthesis; if (!ss) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'ms-MY'; u.pitch = pitch; u.rate = 0.9; ss.speak(u); } catch (e) { } }

  // ---- overlay + renderer ------------------------------------------------
  const overlay = document.createElement('div'); overlay.className = 'screen-overlay kampong'; document.body.appendChild(overlay);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  overlay.appendChild(renderer.domElement);
  // force-landscape gate: a "rotate your device" screen shown while in portrait
  let blocked = false;
  const rotateEl = document.createElement('div'); rotateEl.className = 'kq-rotate';
  rotateEl.innerHTML = '<div class="ph">📱</div><b>Rotate to landscape</b><small>Kampong Ayer is best explored in landscape — turn your device sideways.</small>';
  overlay.appendChild(rotateEl);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9bd9d0, 70, 230);  // far fog → see the sprawl fade out
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 700);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.1); sun.position.set(-16, 26, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
  const scam = sun.shadow.camera; scam.left = -70; scam.right = 70; scam.top = 70; scam.bottom = -70; sun.shadow.bias = -0.0004;
  const sky = skyDome(); sky.scale.setScalar(1.8);
  scene.add(sun, new THREE.HemisphereLight(0xd6f3fb, 0x4a6f74, 0.9), new THREE.AmbientLight(0xbfe6e2, 0.25), sky);

  const wgrp = new THREE.Group(); scene.add(wgrp);
  const solids = []; const addSolid = (x, z, r) => solids.push({ x, z, r });
  const peds = [], kids = [], cats = [], greetables = [], interactables = [];

  // ---- water -------------------------------------------------------------
  const rippleTex = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#2f9fc7'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; for (let i = 0; i < 60; i++) { const y = Math.random() * h, x = Math.random() * w, len = 20 + Math.random() * 60; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 6, x + len, y); g.stroke(); } }, { repeat: [16, 16] });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshToonMaterial({ color: 0x39a6cc, gradientMap: RAMP, map: rippleTex, transparent: true, opacity: 0.95 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.2; water.receiveShadow = true; scene.add(water);

  // ---- boardwalk: three villages + two bridges ---------------------------
  const DECK_Y = 0.6;
  const A_HUB = { x0: -14, x1: 14, z0: 20, z1: 40 };
  const A_PIER = { x0: -4, x1: 4, z0: 38, z1: 50 };
  const BR_AB = { x0: -3, x1: 3, z0: 6, z1: 20 };       // gated bridge A→B
  const B_HUB = { x0: -16, x1: 16, z0: -12, z1: 8 };
  const B_WEST = { x0: -32, x1: -16, z0: -6, z1: 4 };
  const B_EAST = { x0: 16, x1: 32, z0: -6, z1: 4 };
  const BR_BC = { x0: -3, x1: 3, z0: -26, z1: -12 };     // gated bridge B→C
  const C_HUB = { x0: -14, x1: 14, z0: -44, z1: -24 };
  const C_PIER = { x0: -4, x1: 4, z0: -58, z1: -44 };    // waterfront finish
  const ALLRECTS = [A_HUB, A_PIER, BR_AB, B_HUB, B_WEST, B_EAST, BR_BC, C_HUB, C_PIER];
  const WALK = [A_HUB, A_PIER];                          // grows as bridges unlock

  const plankTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c79a5e'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,60,30,0.5)'; g.lineWidth = 3; for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.strokeStyle = 'rgba(120,85,45,0.25)'; for (let i = 0; i < 40; i++) { const y = Math.random() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 4); g.stroke(); } }, { repeat: [8, 8] });
  function deck(r) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0; const tex = plankTex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), new THREE.MeshToonMaterial({ color: 0xcf9f63, gradientMap: RAMP, map: tex }));
    m.position.set((r.x0 + r.x1) / 2, DECK_Y - 0.2, (r.z0 + r.z1) / 2); m.receiveShadow = m.castShadow = true; m.add(new THREE.Mesh(m.geometry, outlineMaterial(0.05))); wgrp.add(m);
    for (let x = r.x0 + 1.5; x < r.x1; x += 5) for (let z = r.z0 + 1.5; z < r.z1; z += 5) { const pole = toon(new THREE.CylinderGeometry(0.22, 0.26, 4, 7), 0x6e4f30, { thickness: 0.03 }); place(pole, x, -1.4, z); wgrp.add(pole); }
  }
  ALLRECTS.forEach(deck);
  function railing(x0, z0, x1, z1) { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx); if (len < 0.8) return; const rail = toon(new THREE.BoxGeometry(len, 0.12, 0.12), 0xb98a4e, { thickness: 0.02 }); rail.position.set((x0 + x1) / 2, DECK_Y + 0.85, (z0 + z1) / 2); rail.rotation.y = -ang; wgrp.add(rail); const n = Math.max(1, Math.floor(len / 2)); for (let i = 0; i <= n; i++) { const t = i / n; const post = toon(new THREE.BoxGeometry(0.14, 0.95, 0.14), 0xa97c43, { thickness: 0.02 }); place(post, x0 + dx * t, DECK_Y + 0.45, z0 + dz * t); wgrp.add(post); } }
  const coveredPt = (px, pz) => ALLRECTS.some((r) => px >= r.x0 - 0.05 && px <= r.x1 + 0.05 && pz >= r.z0 - 0.05 && pz <= r.z1 + 0.05);
  function railEdges() {
    for (const r of ALLRECTS) {
      const sides = [{ hor: true, fixed: r.z0, lo: r.x0, hi: r.x1, ox: 0, oz: -0.6 }, { hor: true, fixed: r.z1, lo: r.x0, hi: r.x1, ox: 0, oz: 0.6 }, { hor: false, fixed: r.x0, lo: r.z0, hi: r.z1, ox: -0.6, oz: 0 }, { hor: false, fixed: r.x1, lo: r.z0, hi: r.z1, ox: 0.6, oz: 0 }];
      for (const sd of sides) { const len = sd.hi - sd.lo, n = Math.max(1, Math.round(len)); let run = null; for (let i = 0; i < n; i++) { const tm = sd.lo + len * ((i + 0.5) / n); const mx = sd.hor ? tm : sd.fixed, mz = sd.hor ? sd.fixed : tm; const open = !coveredPt(mx + sd.ox, mz + sd.oz); if (open && run === null) run = sd.lo + len * (i / n); if (!open && run !== null) { emitRail(sd, run, sd.lo + len * (i / n)); run = null; } } if (run !== null) emitRail(sd, run, sd.hi); }
    }
  }
  function emitRail(sd, a, b) { if (sd.hor) railing(a, sd.fixed, b, sd.fixed); else railing(sd.fixed, a, sd.fixed, b); }
  railEdges();

  // ---- stilt houses ------------------------------------------------------
  const HC = [0x4f9ad0, 0xe0b24a, 0xd9695a, 0x6cae6a, 0xc88fbf, 0xd98b46];
  function house(x, z, rot, color, w = 4, d = 4, h = 2.6, collide = true) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; wgrp.add(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const pole = toon(new THREE.CylinderGeometry(0.16, 0.2, 3.2, 7), 0x5e4127, { thickness: 0.03 }); place(pole, sx * (w / 2 - 0.4), 0, sz * (d / 2 - 0.4)); g.add(pole); }
    const floor = toon(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), 0x8a6234, { thickness: 0.03 }); place(floor, 0, 1.5, 0); g.add(floor);
    const wt = canvasTex(96, 64, (cx, ww, hh) => { cx.fillStyle = 'rgba(40,55,60,0.9)'; cx.fillRect(ww * 0.18, hh * 0.28, ww * 0.22, hh * 0.5); cx.fillRect(ww * 0.6, hh * 0.28, ww * 0.22, hh * 0.5); cx.strokeStyle = 'rgba(255,255,255,0.6)'; cx.lineWidth = 3; cx.strokeRect(ww * 0.18, hh * 0.28, ww * 0.22, hh * 0.5); cx.strokeRect(ww * 0.6, hh * 0.28, ww * 0.22, hh * 0.5); });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color, gradientMap: RAMP, map: wt })); walls.castShadow = walls.receiveShadow = true; walls.position.y = 1.65 + h / 2; walls.add(new THREE.Mesh(walls.geometry, outlineMaterial(0.05))); g.add(walls);
    const roof = toon(new THREE.CylinderGeometry(0.01, w * 0.78, 1.5, 4), 0xb5483b, { thickness: 0.05 }); roof.rotation.y = Math.PI / 4; place(roof, 0, 1.65 + h + 0.7, 0); roof.scale.z = d / w; g.add(roof);
    const door = toon(new THREE.BoxGeometry(0.9, 1.5, 0.1), 0x7a4f2c, { thickness: 0.02 }); place(door, 0, 1.65 + 0.75, d / 2 + 0.02); g.add(door);
    if (collide) addSolid(x, z, Math.max(w, d) * 0.5 + 0.2);
  }
  // village A houses
  house(-16, 38, 0.2, HC[0], 5, 4.5, 3, false); house(16, 38, -0.2, HC[2], 5, 4.5, 3, false); house(-10, 42, 0.1, HC[1], 4.5, 4, 2.8, false); house(10, 42, -0.1, HC[3], 4.5, 4, 2.8, false);
  house(-12, 24, 0.1, HC[4], 3.6, 3.6, 2.4); house(12, 26, -0.1, HC[5], 3.6, 3.6, 2.4);
  // village B houses
  house(-18, 6, 0.3, HC[3], 5, 4.5, 3, false); house(18, 6, -0.3, HC[1], 5, 4.5, 3, false); house(-34, 0, 1.5, HC[2], 5, 5, 3, false); house(34, 0, -1.5, HC[0], 5, 5, 3, false);
  house(-8, 6, 0.1, HC[5], 3.4, 3.4, 2.4); house(9, 5, -0.1, HC[4], 3.4, 3.4, 2.4);
  // village C houses
  house(-16, -42, 0.2, HC[4], 5, 4.5, 3, false); house(16, -42, -0.2, HC[0], 5, 4.5, 3, false); house(-9, -46, 0.1, HC[2], 4.5, 4, 2.8, false); house(9, -46, -0.1, HC[1], 4.5, 4, 2.8, false);
  house(-11, -30, 0.1, HC[3], 3.6, 3.6, 2.4); house(11, -32, -0.1, HC[5], 3.6, 3.6, 2.4);

  // ---- the sprawl: a dense sea of decorative stilt houses (cheap, no collision)
  // packed across the water around the playable spine — the real Kampong Ayer look.
  const matCache = new Map();
  const tmat = (c) => { let m = matCache.get(c); if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: RAMP }); matCache.set(c, m); } return m; };
  const ROOFS = [0xb5483b, 0xc85a3a, 0x4f6f8a, 0x8a8f93, 0xd9695a, 0x9a5a3a, 0x5f7f6a];
  const WALLS = [0xe3ddcf, 0xd8cdb6, 0xc9b79a, 0xb9d0d8, 0xe0c8a8, 0xcfd6cf];
  const nearWalk = (x, z, pad = 4) => ALLRECTS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  function decoHouse(x, z, rot, sc) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; g.scale.setScalar(sc); wgrp.add(g);
    const w = 3.4, h = 2.3, d = 3.4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 1.6, d + 0.5), tmat(0x6e4f30)); base.position.y = 0.0; g.add(base); // dark stilt block on the water
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tmat(WALLS[(Math.random() * WALLS.length) | 0])); walls.position.y = 1.0 + h / 2; g.add(walls);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.8, 1.3, 4), tmat(ROOFS[(Math.random() * ROOFS.length) | 0])); roof.rotation.y = Math.PI / 4; roof.position.y = 1.0 + h + 0.55; roof.scale.z = d / w; g.add(roof);
    return g;
  }
  // scatter a packed cluster of deco houses over a region, skipping the walkways
  function cluster(cx, cz, halfW, halfD, spacing) {
    for (let x = cx - halfW; x <= cx + halfW; x += spacing) for (let z = cz - halfD; z <= cz + halfD; z += spacing) {
      const px = x + rand(-spacing * 0.3, spacing * 0.3), pz = z + rand(-spacing * 0.3, spacing * 0.3);
      if (nearWalk(px, pz, 5)) continue;
      if (Math.hypot(px, pz) > 150) continue;
      decoHouse(px, pz, rand(0, 6.28), rand(0.8, 1.15));
    }
  }
  // clusters filling the water all around the spine (like the satellite kampong)
  cluster(-46, 30, 18, 16, 6.5); cluster(46, 30, 18, 16, 6.5);     // flanking village A
  cluster(0, 56, 26, 12, 6.5);                                      // north of the start
  cluster(-50, -2, 16, 18, 6.5); cluster(50, -2, 16, 18, 6.5);      // flanking village B
  cluster(-30, 28, 12, 12, 7); cluster(30, 28, 12, 12, 7);
  cluster(-44, -36, 18, 16, 6.5); cluster(44, -36, 18, 16, 6.5);    // flanking village C
  cluster(0, -72, 26, 12, 6.5);                                     // far north waterfront sprawl
  cluster(-70, -20, 14, 30, 8); cluster(70, -20, 14, 30, 8);        // distant banks

  // a Masjid (mosque) landmark with a green dome + minaret — like the real village
  (function mosque() {
    const g = new THREE.Group(); g.position.set(28, 0, 30); wgrp.add(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 0.4), tmat(0x5e4127)); p.position.set(sx * 2.6, -0.6, sz * 2.6); g.add(p); }
    const body = toon(new THREE.BoxGeometry(6.4, 3.4, 6.4), 0xeef2f0, { thickness: 0.04 }); body.position.y = 2.9; g.add(body);
    const drum = toon(new THREE.CylinderGeometry(1.7, 1.9, 0.8, 16), 0xeef2f0, { thickness: 0.03 }); drum.position.y = 5.0; g.add(drum);
    const dome = toon(new THREE.SphereGeometry(1.8, 18, 12, 0, 6.28, 0, Math.PI / 2), 0x2f8f6a, { thickness: 0.04 }); dome.position.y = 5.4; g.add(dome);
    const finial = toon(new THREE.SphereGeometry(0.22, 8, 8), 0xe7c54a, { thickness: 0.02 }); finial.position.y = 7.3; g.add(finial);
    const min = toon(new THREE.CylinderGeometry(0.5, 0.6, 8, 12), 0xeef2f0, { thickness: 0.03 }); min.position.set(4.2, 4.5, 4.2); g.add(min);
    const mcap = toon(new THREE.SphereGeometry(0.6, 12, 8, 0, 6.28, 0, Math.PI / 2), 0x2f8f6a, { thickness: 0.03 }); mcap.position.set(4.2, 8.6, 4.2); g.add(mcap);
  })();

  // ---- traditional dress -------------------------------------------------
  const songket = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3a1f2a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(217,178,74,0.7)'; g.lineWidth = 2; for (let i = -w; i < w; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } g.fillStyle = '#e8c75a'; for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); } });
  // brown plaid / tartan (for the casual head-wrap and sinjang)
  const plaid = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5a4632'; g.fillRect(0, 0, w, h);
    const band = (col, a, step, ww, vert) => { g.globalAlpha = a; g.fillStyle = col; for (let p = 0; p < (vert ? w : h); p += step) { if (vert) g.fillRect(p, 0, ww, h); else g.fillRect(0, p, w, ww); } };
    for (const v of [true, false]) { band('#3a2c1e', 0.55, 34, 12, v); band('#8a6f4e', 0.5, 34, 6, v); band('#d8c39a', 0.45, 17, 3, v); }
    g.globalAlpha = 1;
  });
  function person({ skin = 0xe9b58a, baju = 0x1f6f5a, seluar = null, head = 'songkok', hatColor = 0x16181c, sampin = true, sampinTex = 'songket', sampinColor = 0xb08820, tee = false, female = false, scale = 1 } = {}) {
    seluar = seluar ?? baju; const g = new THREE.Group(); g.scale.setScalar(scale); const legs = [], arms = [];
    if (female) { const skirt = toon(new THREE.CylinderGeometry(0.3, 0.52, 1.35, 14), baju, { thickness: 0.03 }); place(skirt, 0, 0.7, 0); g.add(skirt); }
    else for (const s of [-1, 1]) { const leg = toon(new THREE.CapsuleGeometry(0.14, 0.55, 4, 8), seluar, { thickness: 0.03 }); place(leg, s * 0.16, 0.55, 0); g.add(leg); legs.push(leg); const shoe = toon(new THREE.BoxGeometry(0.22, 0.13, 0.32), 0x2c2c2c, { thickness: 0.02 }); leg.add(shoe); shoe.position.set(0, -0.42, 0.05); }
    const torso = toon(new THREE.CapsuleGeometry(0.3, 0.62, 6, 12), baju, { thickness: 0.035 }); place(torso, 0, 1.3, 0); g.add(torso);
    for (const s of [-1, 1]) {
      if (tee) { const sleeve = toon(new THREE.CylinderGeometry(0.13, 0.12, 0.22, 8), baju, { thickness: 0.025 }); place(sleeve, s * 0.34, 1.5, 0); g.add(sleeve); const arm = toon(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), skin, { thickness: 0.025 }); place(arm, s * 0.38, 1.18, 0); arm.rotation.z = s * 0.15; g.add(arm); arms.push(arm); }
      else { const arm = toon(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), baju, { thickness: 0.03 }); place(arm, s * 0.38, 1.28, 0); arm.rotation.z = s * 0.15; g.add(arm); arms.push(arm); }
      const hand = toon(new THREE.SphereGeometry(0.1, 8, 7), skin, { thickness: 0.02 }); place(hand, s * 0.44, 0.96, 0); g.add(hand);
    }
    if (!tee && !female) { const collar = toon(new THREE.CylinderGeometry(0.2, 0.23, 0.12, 12), baju, { thickness: 0.02 }); place(collar, 0, 1.64, 0); g.add(collar); }
    if (tee) { const pocket = toon(new THREE.BoxGeometry(0.13, 0.13, 0.04), baju, { thickness: 0.02 }); place(pocket, 0.13, 1.34, 0.29); g.add(pocket); }
    if (sampin && !female) { const tex = sampinTex === 'plaid' ? plaid : songket; const sam = toon(new THREE.CylinderGeometry(0.34, 0.39, 0.5, 16), sampinColor, { thickness: 0.025, map: tex }); place(sam, 0, 0.96, 0); g.add(sam); const flap = toon(new THREE.BoxGeometry(0.22, 0.5, 0.07), sampinColor, { thickness: 0.02, map: tex }); place(flap, 0, 0.96, 0.37); g.add(flap); }
    const headM = toon(new THREE.SphereGeometry(0.27, 16, 14), skin, { thickness: 0.03 }); place(headM, 0, 1.96, 0); g.add(headM);
    if (head === 'songkok') { const cap = toon(new THREE.CylinderGeometry(0.27, 0.29, 0.3, 16), hatColor, { thickness: 0.025 }); place(cap, 0, 2.15, 0); g.add(cap); }
    else if (head === 'tudung') { const tud = toon(new THREE.SphereGeometry(0.33, 16, 14), hatColor, { thickness: 0.03 }); tud.scale.set(1, 1.05, 1); place(tud, 0, 1.99, 0); g.add(tud); const drape = toon(new THREE.CylinderGeometry(0.37, 0.26, 0.7, 16, 1, true), hatColor, { outline: false }); place(drape, 0, 1.55, 0); g.add(drape); }
    else if (head === 'headscarf') { const wrap = toon(new THREE.SphereGeometry(0.3, 16, 12), 0x7a5f42, { thickness: 0.03, map: plaid }); wrap.scale.set(1.06, 0.72, 1.06); place(wrap, 0, 2.12, 0); g.add(wrap); const knot = toon(new THREE.BoxGeometry(0.18, 0.16, 0.16), 0x5a4632, { thickness: 0.02, map: plaid }); place(knot, 0, 2.22, -0.26); knot.rotation.y = 0.5; g.add(knot); }
    else { const hair = toon(new THREE.SphereGeometry(0.29, 16, 12), 0x35251c, { thickness: 0.03 }); hair.scale.set(1, 0.85, 1); place(hair, 0, 2.0, -0.02); g.add(hair); }
    return { group: g, legs, arms };
  }
  // a palette of village outfits (casual tees, baju melayu in many colours,
  // baju kurung + tudung) so the crowd looks varied, like a real kampong.
  const OUTFITS = [
    { baju: 0xeee7d8, seluar: 0x1c1c1c, tee: true, head: 'headscarf', sampin: true, sampinTex: 'plaid', sampinColor: 0x6a533a }, // casual tee + plaid (player look)
    { baju: 0xf2efe6, head: 'hair', sampin: true },                                  // white baju + gold sampin
    { baju: 0xf2efe6, head: 'songkok', sampin: true },                               // white baju + songkok
    { baju: 0xf2efe6, seluar: 0x6a3a3a, tee: true, head: 'songkok', sampin: true, sampinTex: 'plaid', sampinColor: 0x7a3030 }, // tee + red plaid
    { baju: 0x244f8a, head: 'songkok' },                                             // navy formal
    { baju: 0x8a2f3a, head: 'songkok', sampin: true },                              // maroon + sampin
    { baju: 0x2f8f6a, head: 'songkok', sampin: true },                              // green + sampin
    { baju: 0xe7b2c2, hatColor: 0xe7b2c2, head: 'tudung', female: true },           // pink baju kurung lady
    { baju: 0x3a6f8a, hatColor: 0x213a5a, head: 'songkok' },                        // blue + dark cap
    { baju: 0xd8cdb6, seluar: 0x2c2c2c, tee: true, head: 'hair' },                  // plain cream tee
    { baju: 0x6a4f8a, head: 'songkok', sampin: true },                             // purple + sampin
    { baju: 0xf0e6d0, hatColor: 0xf0e6d0, head: 'tudung', female: true },           // cream tudung lady
  ];
  const outfit = (i) => ({ ...OUTFITS[((i % OUTFITS.length) + OUTFITS.length) % OUTFITS.length] });

  // ---- vendor stalls (clues that guide the puzzles) ----------------------
  const vendors = [];
  function stall(x, z, rot, awn, vopts, clue) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; wgrp.add(g);
    const table = toon(new THREE.BoxGeometry(2.6, 0.2, 1.2), 0x9a6b3a, { thickness: 0.03 }); place(table, 0, DECK_Y + 0.9, 0); g.add(table);
    for (const sx of [-1, 1]) { const leg = toon(new THREE.BoxGeometry(0.16, 0.9, 0.16), 0x7a5230, { thickness: 0.02 }); place(leg, sx * 1.1, DECK_Y + 0.45, 0); g.add(leg); const post = toon(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), 0x8a6a44, { thickness: 0.02 }); place(post, sx * 1.2, DECK_Y + 1.2, -0.4); g.add(post); }
    const awning = toon(new THREE.BoxGeometry(3, 0.12, 1.6), awn, { thickness: 0.03 }); place(awning, 0, DECK_Y + 2.4, -0.1); awning.rotation.x = -0.18; g.add(awning);
    for (let i = 0; i < 5; i++) { const fr = toon(new THREE.SphereGeometry(0.16 + Math.random() * 0.06, 8, 7), [0xe0b24a, 0xd9695a, 0x6cae6a, 0xe88a3a][i % 4], { thickness: 0.02 }); place(fr, -0.9 + i * 0.45, DECK_Y + 1.12, 0.2); g.add(fr); }
    const v = person(vopts); v.group.position.set(0, DECK_Y, -0.9); v.group.rotation.y = Math.PI; g.add(v.group);
    addSolid(x, z, 1.7); vendors.push({ x, z, clue, spoken: false }); greetables.push({ x: x + Math.sin(rot) * 1.4, z: z + Math.cos(rot) * 1.4, greeted: false });
  }
  stall(-9, 30, 0.4, 0xd9695a, outfit(5), 'Salam, adik! The Boatman by the east jetty has lost 3 fish — find them around this village and he’ll give you a plank to mend the broken bridge.');
  stall(-20, 2, 1.0, 0x4f9ad0, outfit(4), 'The Brass Key to the north gate is kept by old Pak Mat — he’s standing on the west jetty. Greet him kindly and he’ll let you by.');
  stall(10, -40, -0.4, 0xe0b24a, outfit(11), 'Bring three cargo baskets here to the waterfront and load them on the boat — then your task is done. Selamat jalan!');

  function lantern(x, z) { const pole = toon(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), 0x6a4f30, { thickness: 0.02 }); place(pole, x, DECK_Y + 1.2, z); wgrp.add(pole); const bulb = toon(new THREE.SphereGeometry(0.22, 12, 10), 0xffe08a, { thickness: 0.02, emissive: 0xffb84d }); place(bulb, x, DECK_Y + 2.45, z); wgrp.add(bulb); }
  [[-3, 18], [3, 18], [-3, 8], [3, 8], [-3, -12], [3, -12], [-3, -26], [3, -26], [-12, 30], [12, 30], [-12, -34], [12, -34]].forEach(([x, z]) => lantern(x, z));

  // ---- bridges with gates (the puzzle locks) -----------------------------
  // a closed gate that animates open when its bridge unlocks
  function gate(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); wgrp.add(g);
    for (const sx of [-1, 1]) { const post = toon(new THREE.CylinderGeometry(0.16, 0.2, 3, 8), 0x7a4f2c, { thickness: 0.03 }); place(post, sx * 3, DECK_Y + 1.3, 0); g.add(post); }
    const bar = toon(new THREE.BoxGeometry(6.2, 0.4, 0.2), 0x9a3f3a, { thickness: 0.03 }); place(bar, 0, DECK_Y + 1.4, 0); g.add(bar);
    const sign = toon(new THREE.BoxGeometry(1.4, 0.7, 0.08), 0xe0b24a, { thickness: 0.02 }); place(sign, 0, DECK_Y + 2.4, 0); g.add(sign);
    return { group: g, bar, open: false };
  }
  const gateAB = gate(0, 20), gateBC = gate(0, -12);
  // moored boats at the waterfront
  function perahu(x, z, rot, color) { const g = new THREE.Group(); g.position.set(x, -0.05, z); g.rotation.y = rot; wgrp.add(g); const hull = toon(new THREE.CapsuleGeometry(0.6, 2.6, 6, 12), color, { thickness: 0.04 }); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.55); place(hull, 0, 0.3, 0); g.add(hull); const mast = toon(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), 0x6a4f30, { thickness: 0.02 }); place(mast, 0, 1.3, 0); g.add(mast); return g; }
  const boat = perahu(0, -60, 0, 0xd9695a); perahu(-5, -59, 0.5, 0x4f9ad0);
  const finishZ = C_PIER.z0 + 1.5;
  const wfBanner = toon(new THREE.BoxGeometry(6, 1.0, 0.12), 0x2f7f78, { thickness: 0.03, map: canvasTex(384, 64, (g, w, h) => { g.fillStyle = '#2f7f78'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `bold ${h * 0.5}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TEPIAN AIR · WATERFRONT', w / 2, h / 2); }) });
  place(wfBanner, 0, 3.4, finishZ); for (const sx of [-1, 1]) { const post = toon(new THREE.CylinderGeometry(0.16, 0.18, 3.4, 8), 0x8a5a32, { thickness: 0.03 }); place(post, sx * 2.6, 1.5, finishZ); wgrp.add(post); } wgrp.add(wfBanner);

  // ---- pickups (collected into the inventory) ----------------------------
  const pickups = [];
  function pickup(x, z, id, icon, color) {
    const g = new THREE.Group(); g.position.set(x, DECK_Y + 0.7, z); wgrp.add(g);
    if (id === 'fish') { const b = toon(new THREE.CapsuleGeometry(0.18, 0.34, 5, 8), color, { thickness: 0.025 }); b.rotation.z = Math.PI / 2; g.add(b); const tail = toon(new THREE.ConeGeometry(0.18, 0.24, 5), color, { thickness: 0.02 }); place(tail, -0.32, 0, 0); tail.rotation.z = -Math.PI / 2; g.add(tail); }
    else if (id === 'key') { const ring = toon(new THREE.TorusGeometry(0.16, 0.05, 8, 14), color, { thickness: 0.02 }); place(ring, 0, 0.1, 0); g.add(ring); const shaft = toon(new THREE.BoxGeometry(0.08, 0.4, 0.08), color, { thickness: 0.015 }); place(shaft, 0, -0.18, 0); g.add(shaft); const tooth = toon(new THREE.BoxGeometry(0.16, 0.08, 0.08), color, { thickness: 0.015 }); place(tooth, 0.1, -0.32, 0); g.add(tooth); }
    else { const body = toon(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 10), 0xcf9a52, { thickness: 0.03 }); g.add(body); const rim = toon(new THREE.TorusGeometry(0.3, 0.05, 8, 14), 0xa9743a, { thickness: 0.02 }); rim.rotation.x = Math.PI / 2; place(rim, 0, 0.2, 0); g.add(rim); const handle = toon(new THREE.TorusGeometry(0.28, 0.04, 8, 14, Math.PI), 0xa9743a, { thickness: 0.02 }); place(handle, 0, 0.2, 0); g.add(handle); for (let i = 0; i < 3; i++) { const f = toon(new THREE.SphereGeometry(0.12, 8, 7), [0xe0b24a, 0xd9695a, 0x6cae6a][i], { thickness: 0.015 }); place(f, (i - 1) * 0.12, 0.22, 0); g.add(f); } }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.34, 6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    place(beam, 0, 3.2, 0); g.add(beam);
    pickups.push({ x, z, id, g, beam, taken: false, locked: false });
  }
  // 3 fish in Village A
  pickup(-11, 34, 'fish', '🐟', 0x6fb0d0); pickup(9, 24, 'fish', '🐟', 0xe89a4a); pickup(0, 37, 'fish', '🐟', 0x8fc06a);
  // the Brass Key in Village B (on the west jetty, behind Pak Mat)
  pickup(-30, 0, 'key', '🗝️', 0xe7c54a);
  // 3 cargo baskets in Village C
  pickup(-11, -40, 'basket', '🧺', 0); pickup(11, -30, 'basket', '🧺', 0); pickup(0, -50, 'basket', '🧺', 0);

  // ---- bicycles (just two now) -------------------------------------------
  const bikes = [];
  function bicycle(z, dir, speed, x0, x1) {
    const g = new THREE.Group(); wgrp.add(g);
    const frame = toon(new THREE.BoxGeometry(1.1, 0.12, 0.12), 0x2f6f8f, { thickness: 0.02 }); place(frame, 0, 0.7, 0); g.add(frame);
    const seat = toon(new THREE.BoxGeometry(0.3, 0.12, 0.2), 0x222222, { thickness: 0.02 }); place(seat, -0.4, 0.95, 0); g.add(seat);
    const bar = toon(new THREE.BoxGeometry(0.1, 0.5, 0.1), 0x2f6f8f, { thickness: 0.02 }); place(bar, 0.5, 0.95, 0); g.add(bar);
    for (const sx of [-0.5, 0.5]) { const wheel = toon(new THREE.TorusGeometry(0.42, 0.08, 8, 16), 0x222222, { thickness: 0.02 }); place(wheel, sx, 0.42, 0); wheel.rotation.y = Math.PI / 2; g.add(wheel); wheel._spin = true; }
    const rider = person({ ...outfit((Math.random() * OUTFITS.length) | 0), sampin: false, scale: 0.92 }); rider.group.position.set(-0.1, 0.5, 0); g.add(rider.group);
    bikes.push({ g, z, dir, speed, x0, x1, x: dir > 0 ? x0 : x1, bellCd: 0 });
  }
  bicycle(30, 1, 5, -12, 12); bicycle(-1, -1, 5, -14, 14);

  // ---- people, kids, cats ------------------------------------------------
  function blocker(x, z, ax, az, opts, isKey) {
    const pr = person(opts); pr.group.position.set(x, DECK_Y, z); pr.group.rotation.y = Math.atan2(0 - x, 0 - z); wgrp.add(pr.group);
    const pd = { group: pr.group, x, z, ax, az, blocking: true, stepping: false, bob: rand(0, 6.28) }; peds.push(pd);
    greetables.push({ x, z, greeted: false, ped: pd });
  }
  blocker(0, 39.5, 2.6, 39.5, outfit(8));                          // greet to enter Village A proper
  blocker(-28, 0, -28, 3.5, outfit(2), true);                      // Pak Mat (white baju elder) — guards the Brass Key
  blocker(0, -25.5, 2.6, -25.5, outfit(7));                        // greet to enter Village C (lady)
  function playingKid(hx, hz) { const pr = person({ ...outfit((Math.random() * OUTFITS.length) | 0), sampin: false, scale: 0.66 }); pr.group.position.set(hx, DECK_Y, hz); wgrp.add(pr.group); kids.push({ group: pr.group, legs: pr.legs, hx, hz, tx: hx, tz: hz, spd: rand(1.8, 2.6), t: 0, ph: rand(0, 6.28) }); }
  playingKid(8, 30); playingKid(-7, 26); playingKid(7, 2); playingKid(-9, -2); playingKid(8, -36); playingKid(-8, -40);
  function buildCat(color) { const g = new THREE.Group(); const body = toon(new THREE.CapsuleGeometry(0.17, 0.4, 4, 8), color, { thickness: 0.02 }); body.rotation.z = Math.PI / 2; place(body, 0, 0.26, 0); g.add(body); const head = toon(new THREE.SphereGeometry(0.16, 10, 9), color, { thickness: 0.02 }); place(head, 0.33, 0.38, 0); g.add(head); for (const sx of [-1, 1]) { const ear = toon(new THREE.ConeGeometry(0.07, 0.13, 4), color, { thickness: 0.012 }); place(ear, 0.34, 0.54, sx * 0.08); g.add(ear); } const tail = toon(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), color, { thickness: 0.012 }); place(tail, -0.36, 0.4, 0); tail.rotation.z = 0.8; g.add(tail); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = toon(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 6), color, { thickness: 0.012 }); place(leg, 0.05 + sx * 0.16, 0.13, sz * 0.1); g.add(leg); } return g; }
  function spawnCat(hx, hz, color) { const g = buildCat(color); g.position.set(hx, DECK_Y, hz); wgrp.add(g); cats.push({ group: g, hx, hz, tx: hx, tz: hz, t: rand(1, 4), spd: rand(0.8, 1.3), meowCd: rand(4, 10) }); }
  spawnCat(10, 28, 0xd98b46); spawnCat(-12, 2, 0x8a8a8a); spawnCat(11, -38, 0x3a3a3a);

  // ---- player (traditional dress) ----------------------------------------
  const kidP = person({ baju: 0xeee7d8, seluar: 0x1c1c1c, tee: true, head: 'headscarf', sampin: true, sampinTex: 'plaid', sampinColor: 0x6a533a });
  const kid = kidP.group; wgrp.add(kid); kid.position.set(0, DECK_Y, 46); kid.rotation.y = Math.PI;
  const legs = kidP.legs, arms = kidP.arms;
  const bag = toon(new THREE.BoxGeometry(0.42, 0.5, 0.22), 0xb5894f, { thickness: 0.03 }); place(bag, 0.16, 1.15, -0.3); kid.add(bag);
  const PLAYER_R = 0.5;

  // ---- camera ------------------------------------------------------------
  let camYaw = 0, camPitch = 0.5, camDist = 10; const tmpV = new THREE.Vector3();
  function updateCamera(instant) {
    const tx = kid.position.x, ty = kid.position.y + 1.6, tz = kid.position.z;
    const px = tx + Math.sin(camYaw) * Math.cos(camPitch) * camDist, py = ty + Math.sin(camPitch) * camDist, pz = tz + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    if (instant) camera.position.set(px, py, pz); else camera.position.lerp(tmpV.set(px, py, pz), 0.16); camera.lookAt(tx, ty, tz);
  }
  updateCamera(true);

  // ---- input -------------------------------------------------------------
  const keys = new Set(); const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 }; const drag = { id: null, lx: 0, ly: 0 }; const MAXR = 60;
  const isLeft = (x) => x < innerWidth * 0.5; const cv = renderer.domElement;
  cv.addEventListener('touchstart', (e) => { sfx.unlock(); for (const t of e.changedTouches) { if (isLeft(t.clientX) && stick.id === null) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.dx = stick.dy = 0; } else if (drag.id === null) { drag.id = t.identifier; drag.lx = t.clientX; drag.ly = t.clientY; } } e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const d = Math.hypot(dx, dy) || 1; if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; } stick.dx = dx / MAXR; stick.dy = dy / MAXR; } else if (t.identifier === drag.id) { camYaw -= (t.clientX - drag.lx) * 0.006; camPitch = clamp(camPitch + (t.clientY - drag.ly) * 0.005, 0.12, 1.2); drag.lx = t.clientX; drag.ly = t.clientY; } } e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { stick.id = null; stick.dx = stick.dy = 0; } if (t.identifier === drag.id) drag.id = null; } e.preventDefault(); }, { passive: false });
  cv.addEventListener('mousedown', (e) => { sfx.unlock(); drag.id = 'm'; drag.lx = e.clientX; drag.ly = e.clientY; });
  function onMM(e) { if (drag.id === 'm') { camYaw -= (e.clientX - drag.lx) * 0.005; camPitch = clamp(camPitch + (e.clientY - drag.ly) * 0.004, 0.12, 1.2); drag.lx = e.clientX; drag.ly = e.clientY; } }
  function onMU() { if (drag.id === 'm') drag.id = null; }
  function onWheel(e) { camDist = clamp(camDist + Math.sign(e.deltaY) * 0.8, 5, 20); }
  function onKD(e) { const k = e.key.toLowerCase(); if ('wasd'.includes(k) || k.startsWith('arrow')) { keys.add(k); sfx.unlock(); } if (k === 'e' || k === ' ') doAction(); }
  function onKU(e) { keys.delete(e.key.toLowerCase()); }
  function onResize() {
    const asp = innerWidth / innerHeight;
    camera.aspect = asp;
    // widen the (vertical) field of view on short/landscape screens so you still
    // see plenty of the village ahead; keep it tighter in tall/portrait.
    camera.fov = asp >= 1.5 ? 62 : asp >= 1.0 ? 56 : asp >= 0.7 ? 50 : 46;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    const portrait = innerWidth < innerHeight;   // force landscape
    blocked = portrait; rotateEl.classList.toggle('show', portrait);
  }
  const onOrient = () => setTimeout(onResize, 200);   // viewport size settles after the rotate event
  onResize();   // apply the right FOV for the current orientation up front
  addEventListener('mousemove', onMM); addEventListener('mouseup', onMU); addEventListener('wheel', onWheel, { passive: true }); addEventListener('keydown', onKD); addEventListener('keyup', onKU); addEventListener('resize', onResize); addEventListener('orientationchange', onOrient);

  // ---- HUD ---------------------------------------------------------------
  const hud = document.createElement('div'); hud.className = 'kq'; overlay.appendChild(hud);
  hud.innerHTML = `<button class="kq-quit" aria-label="Quit">‹</button><div class="kq-obj"></div><div class="kq-inv"></div><div class="kq-joy"></div><button class="kq-act" hidden></button><div class="kq-dialog" hidden><div class="kq-who">Local Vendor</div><div class="kq-text"></div><button class="kq-ok">Got it</button></div><div class="kq-banner"></div>`;
  const q = (s) => hud.querySelector(s);
  const objEl = q('.kq-obj'), invEl = q('.kq-inv'), actBtn = q('.kq-act'), dialog = q('.kq-dialog'), banner = q('.kq-banner'), joy = q('.kq-joy');
  q('.kq-quit').onclick = () => { sfx.unlock(); endMission(false, true); };
  q('.kq-ok').onclick = () => { dialog.hidden = true; dialogOpen = false; };
  actBtn.onclick = doAction;
  let nearVendor = null, dialogOpen = false, salamBusy = false, actTarget = null;
  function showBanner(txt, ms = 2200) { banner.textContent = txt; banner.classList.add('show'); clearTimeout(showBanner._t); showBanner._t = setTimeout(() => banner.classList.remove('show'), ms); }
  function saySalam() { if (salamBusy) return; salamBusy = true; sfx.unlock(); sfx.clue(); speak('Assalamualaikum', 0.85); showBanner('🙋 Assalamualaikum!', 1500); setTimeout(() => { speak('Waalaikumsalam', 1.5); showBanner('🙂 Waalaikumsalam!', 1600); }, 1150); setTimeout(() => { salamBusy = false; }, 2700); }

  // ---- inventory + quest state -------------------------------------------
  const inv = { fish: 0, plank: 0, key: 0, basket: 0 };
  let gotPlank = false, bridgeAB = false, gotKey = false, bridgeBC = false, won = false, ended = false, stun = 0, bikeHits = 0, running = true, raf = 0, elapsed = 0;
  const ICON = { fish: '🐟', plank: '🪵', key: '🗝️', basket: '🧺' };
  function updateInv() {
    let h = '';
    if (!gotPlank) h += `<div class="kq-chip">🐟 <b>${inv.fish}</b>/3</div>`;
    if (inv.plank) h += `<div class="kq-chip">🪵 <b>${inv.plank}</b></div>`;
    if (inv.key) h += `<div class="kq-chip">🗝️ <b>${inv.key}</b></div>`;
    if (bridgeBC || inv.basket) h += `<div class="kq-chip">🧺 <b>${inv.basket}</b>/3</div>`;
    invEl.innerHTML = h;
  }
  function setObjective() {
    let t;
    if (!gotPlank && inv.fish < 3) t = `Find the Boatman’s <b>3 fish</b> around this village (${inv.fish}/3)`;
    else if (!gotPlank) t = `Take the <b>3 fish</b> to the <b>Boatman</b>`;
    else if (!bridgeAB) t = `Use the <b>plank</b> to mend the broken <b>bridge</b>`;
    else if (!gotKey) t = `Cross to the central village — find the <b>Brass Key</b> (greet Pak Mat)`;
    else if (!bridgeBC) t = `Use the <b>key</b> to unlock the <b>north gate</b>`;
    else if (inv.basket < 3) t = `Gather <b>3 cargo baskets</b> at the waterfront village (${inv.basket}/3)`;
    else t = `Load the <b>baskets</b> onto the <b>boat</b> at the waterfront`;
    objEl.innerHTML = t;
  }
  updateInv(); setObjective();

  // puzzle interaction points — spend collected items here to progress
  interactables.push(
    { x: 11, z: 32, range: 2.6, can: () => inv.fish >= 3 && !gotPlank, label: 'Give the 3 fish', act: () => { inv.fish -= 3; gotPlank = true; inv.plank = 1; sfx.pickup(); showBanner('The Boatman gives you a Bridge Plank! 🪵', 2400); updateInv(); setObjective(); } },
    { x: 0, z: 20, range: 3, can: () => inv.plank >= 1 && !bridgeAB, label: 'Mend the bridge (use plank)', act: () => { inv.plank = 0; bridgeAB = true; WALK.push(BR_AB, B_HUB, B_WEST, B_EAST); openGate(gateAB); sfx.win(); showBanner('Bridge mended! Cross to the central village 🌉', 2400); updateInv(); setObjective(); } },
    { x: 0, z: -12, range: 3, can: () => inv.key >= 1 && !bridgeBC, label: 'Unlock the gate (use key)', act: () => { inv.key = 0; bridgeBC = true; WALK.push(BR_BC, C_HUB, C_PIER); openGate(gateBC); sfx.win(); showBanner('Gate unlocked! On to the waterfront ⛴️', 2400); updateInv(); setObjective(); } },
    { x: 0, z: -54, range: 3.5, can: () => inv.basket >= 3 && !won, label: 'Load baskets on the boat', act: () => { finishWin(); } },
  );
  // the Boatman NPC model at his spot
  { const bm = person({ baju: 0x35506a, tee: true, head: 'headscarf', sampin: true, sampinTex: 'plaid', sampinColor: 0x5a4632 }); bm.group.position.set(11, DECK_Y, 33); bm.group.rotation.y = Math.PI; wgrp.add(bm.group); addSolid(11, 33, 1.2); greetables.push({ x: 11, z: 31.6, greeted: false }); }
  function openGate(g) { g.open = true; }

  function tryTalk() { if (!nearVendor || dialogOpen || won) return; sfx.unlock(); sfx.talk(); q('.kq-text').textContent = nearVendor.clue; dialog.hidden = false; dialogOpen = true; nearVendor.spoken = true; }
  function doAction() { if (won || dialogOpen) return; if (actTarget && actTarget.kind === 'use') { actTarget.t.act(); } else if (actTarget && actTarget.kind === 'talk') { nearVendor = actTarget.v; tryTalk(); } }

  // ---- mission helpers ---------------------------------------------------
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function collect(pk) { pk.taken = true; pk.g.visible = false; inv[pk.id]++; sfx.pickup(); updateInv(); setObjective(); showBanner(`${ICON[pk.id]} ${pk.id} collected!`, 1400); }
  function collide(p) {
    for (const s of solids) { const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + PLAYER_R; if (d < min && d > 1e-4) { p.x = s.x + dx / d * min; p.z = s.z + dz / d * min; } }
    for (const pd of peds) if (pd.blocking) { const dx = p.x - pd.x, dz = p.z - pd.z, d = Math.hypot(dx, dz), min = 0.85 + PLAYER_R; if (d < min && d > 1e-4) { p.x = pd.x + dx / d * min; p.z = pd.z + dz / d * min; } }
  }
  function clampWalk(p) { if (WALK.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1)) return; let best = null, bd = Infinity; for (const r of WALK) { const cx = clamp(p.x, r.x0, r.x1), cz = clamp(p.z, r.z0, r.z1); const d = (cx - p.x) ** 2 + (cz - p.z) ** 2; if (d < bd) { bd = d; best = { x: cx, z: cz }; } } p.x = best.x; p.z = best.z; }
  function finishWin() { if (won) return; won = true; sfx.win(); showBanner('SAMPAI! ⛵ The cargo is delivered!', 1800); setTimeout(() => endMission(true), 1700); }
  function endMission(win, quit = false) { if (ended) return; ended = true; let stars = 0; if (win) { stars = 1; if (elapsed / 60 <= PAR_MIN) stars++; if (bikeHits === 0) stars++; } cleanup(); onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit }); }
  function cleanup() { running = false; cancelAnimationFrame(raf); removeEventListener('mousemove', onMM); removeEventListener('mouseup', onMU); removeEventListener('wheel', onWheel); removeEventListener('keydown', onKD); removeEventListener('keyup', onKU); removeEventListener('resize', onResize); removeEventListener('orientationchange', onOrient); renderer.dispose(); renderer.forceContextLoss?.(); overlay.remove(); }

  // ---- loop --------------------------------------------------------------
  const clock = new THREE.Clock(); let stepAcc = 0;
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    if (blocked) { renderer.render(scene, camera); return; }   // paused while in portrait
    if (!won) elapsed += dt; const tnow = clock.elapsedTime;
    if (sfx.ready) sfx.music();   // upbeat bed once audio is unlocked

    let ix = stick.dx, iy = stick.dy;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (keys.has('w') || keys.has('arrowup')) iy -= 1; if (keys.has('s') || keys.has('arrowdown')) iy += 1;
    const mag = Math.hypot(ix, iy); let moving = false; if (stun > 0) stun -= dt;
    if (mag > 0.05 && stun <= 0 && !dialogOpen && !won) {
      moving = true; const nx = ix / (mag > 1 ? mag : 1), ny = iy / (mag > 1 ? mag : 1);
      const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw), rightX = Math.cos(camYaw), rightZ = -Math.sin(camYaw);
      const mvX = rightX * nx + fwdX * ny, mvZ = rightZ * nx + fwdZ * ny, spd = 6;
      kid.position.x += mvX * spd * dt; kid.position.z += mvZ * spd * dt; collide(kid.position); clampWalk(kid.position);
      kid.rotation.y = Math.atan2(mvX, mvZ); stepAcc += dt; if (stepAcc > 0.28) { stepAcc = 0; sfx.footstep(); }
    }
    const sw = moving ? Math.sin(tnow * 11) : 0; if (legs[0]) { legs[0].rotation.x = sw * 0.6; legs[1].rotation.x = -sw * 0.6; } if (arms[0]) { arms[0].rotation.x = -sw * 0.5; arms[1].rotation.x = sw * 0.5; }
    kid.position.y = DECK_Y + (moving ? Math.abs(Math.sin(tnow * 11)) * 0.04 : 0);

    // pickups
    for (const pk of pickups) { if (pk.taken) continue; pk.g.rotation.y += dt * 1.4; pk.g.position.y = DECK_Y + 0.7 + Math.sin(tnow * 2 + pk.x) * 0.08; pk.beam.material.opacity = 0.22 + Math.sin(tnow * 4) * 0.12; if (Math.hypot(kid.position.x - pk.x, kid.position.z - pk.z) < 1.0) collect(pk); }

    // gates open animation
    for (const g of [gateAB, gateBC]) { if (g.open && g.bar.position.y < DECK_Y + 4) { g.bar.position.y += dt * 4; g.group.children.forEach((c) => { }); } }

    // salam on proximity; blockers step aside
    if (!salamBusy && !dialogOpen && !won) { for (const gg of greetables) { if (gg.greeted) continue; if (Math.hypot(kid.position.x - gg.x, kid.position.z - gg.z) < 3) { gg.greeted = true; saySalam(); if (gg.ped) { gg.ped.blocking = false; gg.ped.stepping = true; showBanner('🙏 Silakan lalu — please pass', 1800); } break; } } }
    for (const pd of peds) { pd.bob += dt * 3; if (pd.stepping) { pd.group.position.x += (pd.ax - pd.group.position.x) * Math.min(1, dt * 3); pd.group.position.z += (pd.az - pd.group.position.z) * Math.min(1, dt * 3); if (Math.hypot(pd.ax - pd.group.position.x, pd.az - pd.group.position.z) < 0.05) pd.stepping = false; } pd.group.position.y = DECK_Y + Math.sin(pd.bob) * 0.015; }
    for (const k of kids) { k.t -= dt; if (k.t <= 0) { k.t = rand(1, 3); k.tx = k.hx + rand(-3.5, 3.5); k.tz = k.hz + rand(-3.5, 3.5); } const dx = k.tx - k.group.position.x, dz = k.tz - k.group.position.z, d = Math.hypot(dx, dz); let mv = false; if (d > 0.25) { mv = true; k.group.position.x += dx / d * k.spd * dt; k.group.position.z += dz / d * k.spd * dt; k.group.rotation.y = Math.atan2(dx, dz); } const ks = mv ? Math.sin(tnow * 12 + k.ph) : 0; if (k.legs[0]) { k.legs[0].rotation.x = ks * 0.7; k.legs[1].rotation.x = -ks * 0.7; } k.group.position.y = DECK_Y + (mv ? Math.abs(Math.sin(tnow * 12 + k.ph)) * 0.05 : 0); }
    for (const c of cats) { c.t -= dt; if (c.t <= 0) { c.t = rand(2, 5); c.tx = c.hx + rand(-3, 3); c.tz = c.hz + rand(-3, 3); } const dx = c.tx - c.group.position.x, dz = c.tz - c.group.position.z, d = Math.hypot(dx, dz); if (d > 0.2) { c.group.position.x += dx / d * c.spd * dt; c.group.position.z += dz / d * c.spd * dt; c.group.rotation.y = Math.atan2(dx, dz); } c.meowCd -= dt; if (c.meowCd <= 0) { c.meowCd = rand(7, 16); if (Math.hypot(kid.position.x - c.group.position.x, kid.position.z - c.group.position.z) < 10) sfx.meow(); } }

    // bikes
    for (const bk of bikes) { bk.x += bk.dir * bk.speed * dt; if (bk.x > bk.x1) { bk.x = bk.x1; bk.dir = -1; } if (bk.x < bk.x0) { bk.x = bk.x0; bk.dir = 1; } bk.g.position.set(bk.x, DECK_Y, bk.z); bk.g.rotation.y = bk.dir > 0 ? Math.PI / 2 : -Math.PI / 2; bk.g.traverse((o) => { if (o._spin) o.rotation.x += bk.speed * dt; }); const d = Math.hypot(kid.position.x - bk.x, kid.position.z - bk.z); bk.bellCd -= dt; if (d < 3 && bk.bellCd <= 0) { bk.bellCd = 1.4; sfx.bell(); } if (d < 1.1 && stun <= 0) { const a = Math.atan2(kid.position.z - bk.z, kid.position.x - bk.x); kid.position.x += Math.cos(a) * 1.6; kid.position.z += Math.sin(a) * 1.6; collide(kid.position); clampWalk(kid.position); stun = 0.5; bikeHits++; sfx.bump(); showBanner('Awas! A bicycle! 🚲', 1200); } }

    // nearest action: usable puzzle point first, else a vendor to talk to
    actTarget = null; let bestD = Infinity;
    for (const it of interactables) { if (!it.can()) continue; const d = Math.hypot(kid.position.x - it.x, kid.position.z - it.z); if (d < it.range && d < bestD) { bestD = d; actTarget = { kind: 'use', t: it }; } }
    if (!actTarget) { let nd = 2.6; nearVendor = null; for (const v of vendors) { const d = Math.hypot(kid.position.x - v.x, kid.position.z - v.z); if (d < nd) { nd = d; nearVendor = v; } } if (nearVendor) actTarget = { kind: 'talk', v: nearVendor }; }
    if (actTarget && !dialogOpen && !won) { actBtn.hidden = false; actBtn.textContent = actTarget.kind === 'use' ? `✋ ${actTarget.t.label}` : '💬 Talk'; } else actBtn.hidden = true;

    updateCamera(false);
    if (stick.id === null) joy.style.opacity = '0'; else { joy.style.opacity = '1'; joy.style.left = stick.ox + 'px'; joy.style.top = stick.oy + 'px'; joy.style.setProperty('--kx', stick.dx * MAXR + 'px'); joy.style.setProperty('--ky', stick.dy * MAXR + 'px'); }
    renderer.render(scene, camera);
  }
  function loop() { if (!running) return; try { tick(); } catch (e) { console.error(e); } raf = requestAnimationFrame(loop); }
  loop();
  showBanner('Selamat datang ke Kampong Ayer! Help the Boatman — find his 3 fish.', 3400);

  // test/debug hook
  window.__kampong = {
    state: () => ({ x: +kid.position.x.toFixed(1), z: +kid.position.z.toFixed(1), inv: { ...inv }, gotPlank, bridgeAB, gotKey: inv.key > 0 || gotKey, bridgeBC, won, ended, walkRects: WALK.length, bikeHits }),
    teleport: (x, z) => { kid.position.x = x; kid.position.z = z; updateCamera(true); },
    give: (id, n = 1) => { inv[id] = (inv[id] || 0) + n; updateInv(); setObjective(); },
    useNearest: () => { for (const it of interactables) if (it.can()) { const d = Math.hypot(kid.position.x - it.x, kid.position.z - it.z); if (d < it.range + 0.5) { it.act(); return it.label; } } return null; },
    forceUse: (i) => { const it = interactables[i]; if (it && it.can()) it.act(); },
    npcs: () => ({ bikes: bikes.length, kids: kids.length, cats: cats.length, peds: peds.length, vendors: vendors.length, pickups: pickups.length, interactables: interactables.length }),
  };
  return overlay;
}
