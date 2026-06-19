// Landing at Muara — TITIAN (Amanah): a 3rd-person community-trust investigation
// game across a vast Kampong Ayer. You return to the kampong with no authority
// and earn it, claim by claim:
//   Listen   — talk to villagers; each gives a CLAIM (a lead).
//   Verify   — judge every claim: Rumour (false gossip) / Crime (a wrong hiding
//              behind a ghost story) / Sacred (genuinely unexplained — leave it
//              be, out of respect). Judging truly earns that villager's trust →
//              they become a follower, and crime-claims expose a drug stash.
//   Act      — clear the stashes (eradicate the drugs), spend tokens to build a
//              boat that opens the far kampong, then confront the culprit.
//   Unite    — every follower + stashes cleared + the case solved = the village
//              stands together and you've become its leader.
//
// Self-contained Three.js (own renderer/HUD, procedural audio, scoped CSS,
// teardown, forced landscape). Plugs into the campaign loop via onResult().

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
  .kampong .kq-obj{position:absolute;top:calc(10px + env(safe-area-inset-top));left:54px;max-width:54vw;background:rgba(20,55,65,0.55);color:#fff;padding:8px 13px;border-radius:12px;font-size:12.5px;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,0.4);}
  .kampong .kq-obj b{color:#ffe08a;}
  .kampong .kq-stats{position:absolute;top:calc(10px + env(safe-area-inset-top));right:12px;display:flex;gap:6px;align-items:center;}
  .kampong .kq-chip{background:rgba(20,55,65,0.6);color:#fff;padding:6px 10px;border-radius:10px;font-size:14px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);}
  .kampong .kq-chip b{color:#ffe08a;}
  .kampong .kq-trust{width:90px;height:10px;border-radius:6px;background:rgba(255,255,255,0.25);overflow:hidden;}
  .kampong .kq-trust span{display:block;height:100%;width:0;background:linear-gradient(90deg,#3fae6a,#7fe0a0);transition:width .3s;}
  .kampong .kq-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.16),rgba(255,255,255,0.06));border:2px solid rgba(255,255,255,0.4);opacity:0;transition:opacity 0.15s;}
  .kampong .kq-joy::after{content:'';position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,0.55);transform:translate(var(--kx,0),var(--ky,0));}
  .kampong .kq-act{position:absolute;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#e2a23a;color:#3a2a10;border:none;border-radius:999px;padding:13px 24px;font-size:15px;font-weight:800;box-shadow:0 4px 16px rgba(40,90,120,0.4);cursor:pointer;animation:kqbob 1.1s ease-in-out infinite;max-width:88vw;}
  .kampong .kq-act[hidden]{display:none;}
  @keyframes kqbob{50%{transform:translateX(-50%) translateY(-4px);}}
  .kampong .kq-dialog{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(480px,92vw);background:rgba(255,255,255,0.97);color:#16384c;border-radius:16px;padding:15px 18px 14px;box-shadow:0 8px 30px rgba(20,50,70,0.4);border:2px solid #2f7f78;pointer-events:auto;}
  .kampong .kq-dialog[hidden]{display:none;}
  .kampong .kq-who{font-weight:800;color:#2f7f78;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:5px;}
  .kampong .kq-text{font-size:14.5px;line-height:1.45;margin-bottom:11px;}
  .kampong .kq-judge{display:flex;gap:7px;flex-wrap:wrap;}
  .kampong .kq-judge button{flex:1;min-width:120px;border:none;border-radius:10px;padding:10px 8px;font-weight:700;font-size:13px;cursor:pointer;color:#fff;}
  .kampong .kq-jr{background:#caa23a;} .kampong .kq-jc{background:#c0463a;} .kampong .kq-js{background:#5a6f8a;}
  .kampong .kq-ok{margin-top:6px;float:right;background:#2f7f78;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-weight:700;font-size:14px;cursor:pointer;}
  .kampong .kq-banner{position:absolute;left:50%;top:21%;transform:translateX(-50%) translateY(-8px);background:rgba(20,55,65,0.82);color:#fff;padding:11px 22px;border-radius:999px;font-size:15px;font-weight:700;max-width:92vw;text-align:center;opacity:0;transition:opacity 0.3s,transform 0.3s;box-shadow:0 6px 20px rgba(20,50,70,0.45);}
  .kampong .kq-banner.show{opacity:1;transform:translateX(-50%) translateY(0);}
  .kampong .kq-rotate{position:absolute;inset:0;z-index:30;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#12333f;color:#fff;text-align:center;padding:24px;}
  .kampong .kq-rotate.show{display:flex;}
  .kampong .kq-rotate .ph{font-size:64px;line-height:1;transform-origin:50% 50%;animation:kqrot 1.8s ease-in-out infinite;}
  @keyframes kqrot{0%,35%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}
  .kampong .kq-rotate b{font-size:19px;} .kampong .kq-rotate small{opacity:0.82;font-size:13px;max-width:300px;}
  .kampong .kq-win{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(15,45,55,0.6);}
  .kampong .kq-win[hidden]{display:none;}
  .kampong .kq-win .card{background:linear-gradient(180deg,#fff,#e7f4f2);border-radius:22px;padding:28px 34px;text-align:center;box-shadow:0 12px 40px rgba(20,50,70,0.5);border:2px solid #2f7f78;max-width:90vw;}
  .kampong .kq-win h2{margin:0;color:#2f7f78;font-size:28px;letter-spacing:1px;} .kampong .kq-win p{color:#16384c;margin:8px 0 16px;font-size:15px;}
  .kampong .kq-win button{background:#e2a23a;color:#3a2a10;border:none;border-radius:12px;padding:12px 26px;font-weight:800;font-size:16px;cursor:pointer;}`;
  const el = document.createElement('style'); el.id = 'kq-style'; el.textContent = css; document.head.appendChild(el);
}

export function showKampong(audio, { mission, onResult } = {}) {
  injectStyle();
  const sfx = new KAudio();
  const rand = (a, b) => a + Math.random() * (b - a);
  function speak(text, pitch = 1) { try { const ss = window.speechSynthesis; if (!ss) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'ms-MY'; u.pitch = pitch; u.rate = 0.9; ss.speak(u); } catch (e) { } }

  // ---- overlay + renderer ------------------------------------------------
  const overlay = document.createElement('div'); overlay.className = 'screen-overlay kampong'; document.body.appendChild(overlay);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  overlay.appendChild(renderer.domElement);
  let blocked = false;
  const rotateEl = document.createElement('div'); rotateEl.className = 'kq-rotate';
  rotateEl.innerHTML = '<div class="ph">📱</div><b>Rotate to landscape</b><small>Kampong Ayer is best explored in landscape — turn your device sideways.</small>';
  overlay.appendChild(rotateEl);

  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9bd9d0, 110, 340);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1500);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.1); sun.position.set(-16, 26, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
  const scam = sun.shadow.camera; scam.left = -80; scam.right = 80; scam.top = 80; scam.bottom = -80; sun.shadow.bias = -0.0004;
  const sky = skyDome(); sky.scale.setScalar(3.2);
  scene.add(sun, new THREE.HemisphereLight(0xd6f3fb, 0x4a6f74, 0.9), new THREE.AmbientLight(0xbfe6e2, 0.25), sky);

  const wgrp = new THREE.Group(); scene.add(wgrp);
  const solids = []; const addSolid = (x, z, r) => solids.push({ x, z, r });
  const peds = [], kids = [], cats = [], greetables = [], markets = [];

  // ---- water -------------------------------------------------------------
  const rippleTex = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#2f9fc7'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; for (let i = 0; i < 60; i++) { const y = Math.random() * h, x = Math.random() * w, len = 20 + Math.random() * 60; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 6, x + len, y); g.stroke(); } }, { repeat: [20, 20] });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1900, 1900), new THREE.MeshToonMaterial({ color: 0x39a6cc, gradientMap: RAMP, map: rippleTex, transparent: true, opacity: 0.95 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.2; water.receiveShadow = true; scene.add(water);

  // ---- boardwalk: central kampong (all open) + a boat-gated far kampong ---
  const DECK_Y = 0.6;
  const A_HUB = { x0: -14, x1: 14, z0: 20, z1: 40 }, A_PIER = { x0: -4, x1: 4, z0: 38, z1: 50 };
  const A_EAST = { x0: 12, x1: 48, z0: 22, z1: 38 }, A_WEST = { x0: -48, x1: -12, z0: 22, z1: 38 };
  const BR_AB = { x0: -3, x1: 3, z0: 6, z1: 22 };
  const B_HUB = { x0: -18, x1: 18, z0: -12, z1: 8 }, B_WEST = { x0: -40, x1: -16, z0: -6, z1: 4 }, B_EAST = { x0: 16, x1: 40, z0: -6, z1: 4 };
  const BR_BC = { x0: -3, x1: 3, z0: -26, z1: -12 };
  const C_HUB = { x0: -16, x1: 16, z0: -46, z1: -24 }, C_PIER = { x0: -4, x1: 4, z0: -58, z1: -46 };
  const FAR_PIER = { x0: -3, x1: 3, z0: -92, z1: -58 }, FAR_HUB = { x0: -20, x1: 20, z0: -118, z1: -92 }; // boat-gated
  // roads (lorong/titian) + district plazas reaching out across the village —
  // all connected and walkable, so the game spreads across the whole map.
  const E_LINK = { x0: 34, x1: 46, z0: -6, z1: 38 }, W_LINK = { x0: -46, x1: -34, z0: -6, z1: 38 };
  const NE_PLAZA = { x0: 44, x1: 66, z0: 22, z1: 40 }, NW_PLAZA = { x0: -66, x1: -44, z0: 22, z1: 40 };
  const E_PLAZA = { x0: 38, x1: 66, z0: -12, z1: 6 }, W_PLAZA = { x0: -66, x1: -38, z0: -12, z1: 6 };
  const C_EAST = { x0: 14, x1: 46, z0: -44, z1: -28 }, C_WEST = { x0: -46, x1: -14, z0: -44, z1: -28 };
  const SE_LINK = { x0: 34, x1: 46, z0: -44, z1: -6 }, SW_LINK = { x0: -46, x1: -34, z0: -44, z1: -6 };
  const ROADS = [E_LINK, W_LINK, NE_PLAZA, NW_PLAZA, E_PLAZA, W_PLAZA, C_EAST, C_WEST, SE_LINK, SW_LINK];
  const CENTRAL = [A_HUB, A_PIER, A_EAST, A_WEST, BR_AB, B_HUB, B_WEST, B_EAST, BR_BC, C_HUB, C_PIER, ...ROADS];
  const FAR = [FAR_PIER, FAR_HUB];
  const ALLRECTS = [...CENTRAL, ...FAR];
  const WALK = [...CENTRAL];   // far kampong added when the boat is built
  const streets = [];          // lorong lanes (filled in the sprawl section below)

  const plankTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c79a5e'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,60,30,0.5)'; g.lineWidth = 3; for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }, { repeat: [8, 8] });
  function deck(r, pstep = 5) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0; const tex = plankTex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), new THREE.MeshToonMaterial({ color: 0xcf9f63, gradientMap: RAMP, map: tex }));
    m.position.set((r.x0 + r.x1) / 2, DECK_Y - 0.2, (r.z0 + r.z1) / 2); m.receiveShadow = m.castShadow = true; m.add(new THREE.Mesh(m.geometry, outlineMaterial(0.05))); wgrp.add(m);
    for (let x = r.x0 + 1.5; x < r.x1; x += pstep) for (let z = r.z0 + 1.5; z < r.z1; z += pstep) { const pole = toon(new THREE.CylinderGeometry(0.22, 0.26, 4, 7), 0x6e4f30, { thickness: 0.03 }); place(pole, x, -1.4, z); wgrp.add(pole); }
  }
  ALLRECTS.forEach((r) => deck(r));   // NB: wrap so forEach's index arg never lands on pstep
  function railing(x0, z0, x1, z1) { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx); if (len < 0.8) return; const rail = toon(new THREE.BoxGeometry(len, 0.12, 0.12), 0xb98a4e, { thickness: 0.02 }); rail.position.set((x0 + x1) / 2, DECK_Y + 0.85, (z0 + z1) / 2); rail.rotation.y = -ang; wgrp.add(rail); const n = Math.max(1, Math.floor(len / 2)); for (let i = 0; i <= n; i++) { const t = i / n; const post = toon(new THREE.BoxGeometry(0.14, 0.95, 0.14), 0xa97c43, { thickness: 0.02 }); place(post, x0 + dx * t, DECK_Y + 0.45, z0 + dz * t); wgrp.add(post); } }
  const inRect = (r, px, pz) => px >= r.x0 - 0.05 && px <= r.x1 + 0.05 && pz >= r.z0 - 0.05 && pz <= r.z1 + 0.05;
  // a point is "covered" if a road OR a lorong lane sits there — so the spine
  // railings open up wherever a street/house row joins (no fenced-off houses).
  const coveredPt = (px, pz) => ALLRECTS.some((r) => inRect(r, px, pz)) || streets.some((r) => inRect(r, px, pz));
  // railings are built AFTER the titian bridges (below), so we can leave an
  // opening in the deck rail wherever a bridge joins — no fenced-off houses.
  function buildRailings(gaps) {
    const nearGap = (x, z) => gaps.some((g) => Math.abs(g.x - x) < 2.6 && Math.abs(g.z - z) < 2.6);
    for (const r of ALLRECTS) { const sides = [{ h: 1, f: r.z0, lo: r.x0, hi: r.x1, ox: 0, oz: -0.6 }, { h: 1, f: r.z1, lo: r.x0, hi: r.x1, ox: 0, oz: 0.6 }, { h: 0, f: r.x0, lo: r.z0, hi: r.z1, ox: -0.6, oz: 0 }, { h: 0, f: r.x1, lo: r.z0, hi: r.z1, ox: 0.6, oz: 0 }]; for (const sd of sides) { const len = sd.hi - sd.lo, n = Math.max(1, Math.round(len)); let run = null; for (let i = 0; i < n; i++) { const tm = sd.lo + len * ((i + 0.5) / n); const mx = sd.h ? tm : sd.f, mz = sd.h ? sd.f : tm; const open = !coveredPt(mx + sd.ox, mz + sd.oz) && !nearGap(mx, mz); if (open && run === null) run = sd.lo + len * (i / n); if (!open && run !== null) { sd.h ? railing(run, sd.f, sd.lo + len * (i / n), sd.f) : railing(sd.f, run, sd.f, sd.lo + len * (i / n)); run = null; } } if (run !== null) { sd.h ? railing(run, sd.f, sd.hi, sd.f) : railing(sd.f, run, sd.f, sd.hi); } } }
  }

  // ---- houses ------------------------------------------------------------
  const HC = [0x4f9ad0, 0xe0b24a, 0xd9695a, 0x6cae6a, 0xc88fbf, 0xd98b46];
  function house(x, z, rot, color, w = 4, d = 4, h = 2.6, collide = true) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; wgrp.add(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const pole = toon(new THREE.CylinderGeometry(0.16, 0.2, 3.2, 7), 0x5e4127, { thickness: 0.03 }); place(pole, sx * (w / 2 - 0.4), 0, sz * (d / 2 - 0.4)); g.add(pole); }
    const floor = toon(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), 0x8a6234, { thickness: 0.03 }); place(floor, 0, 1.5, 0); g.add(floor);
    const wt = canvasTex(96, 64, (cx, ww, hh) => { cx.fillStyle = 'rgba(40,55,60,0.9)'; cx.fillRect(ww * 0.18, hh * 0.28, ww * 0.22, hh * 0.5); cx.fillRect(ww * 0.6, hh * 0.28, ww * 0.22, hh * 0.5); cx.strokeStyle = 'rgba(255,255,255,0.6)'; cx.lineWidth = 3; cx.strokeRect(ww * 0.18, hh * 0.28, ww * 0.22, hh * 0.5); cx.strokeRect(ww * 0.6, hh * 0.28, ww * 0.22, hh * 0.5); });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color, gradientMap: RAMP, map: wt })); walls.castShadow = walls.receiveShadow = true; walls.position.y = 1.65 + h / 2; walls.add(new THREE.Mesh(walls.geometry, outlineMaterial(0.05))); g.add(walls);
    const roof = toon(new THREE.CylinderGeometry(0.01, w * 0.78, 1.5, 4), 0xb5483b, { thickness: 0.05 }); roof.rotation.y = Math.PI / 4; place(roof, 0, 1.65 + h + 0.7, 0); roof.scale.z = d / w; g.add(roof);
    if (collide) addSolid(x, z, Math.max(w, d) * 0.5 + 0.2);
  }
  house(-16, 38, 0.2, HC[0], 5, 4.5, 3, false); house(16, 38, -0.2, HC[2], 5, 4.5, 3, false); house(-10, 42, 0.1, HC[1], 4.5, 4, 2.8, false); house(10, 42, -0.1, HC[3], 4.5, 4, 2.8, false);
  house(-18, 6, 0.3, HC[3], 5, 4.5, 3, false); house(18, 6, -0.3, HC[1], 5, 4.5, 3, false);
  house(-16, -42, 0.2, HC[4], 5, 4.5, 3, false); house(16, -42, -0.2, HC[0], 5, 4.5, 3, false);
  const HAUNTED_X = -58, HAUNTED_Z = 26; house(HAUNTED_X, HAUNTED_Z, 0.1, 0x3a4a6a, 4.2, 4.2, 2.8, false); // the "haunted" blue house in the NW district (stash 1)

  // ---- the sprawl: orderly ROWS of houses lining a grid of titian "streets"
  // (lorong), like the real Kampong Ayer satellite. Every lane is a walkable
  // boardwalk; houses front onto it in neat rows; the lanes intersect one
  // another and cross the central spine, so the whole village is one network.
  const matCache = new Map(); const tmat = (c) => { let m = matCache.get(c); if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: RAMP }); matCache.set(c, m); } return m; };
  const ROOFS = [0xb5483b, 0xc85a3a, 0x4f6f8a, 0x8a8f93, 0xd9695a, 0x9a5a3a, 0x5f7f6a], WALLS = [0xe3ddcf, 0xd8cdb6, 0xc9b79a, 0xb9d0d8, 0xe0c8a8, 0xcfd6cf];
  const HW = 3.4, HH = 2.3, houseXf = [], houseCands = [];
  const onRect = (x, z, pad) => ALLRECTS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  const onStreet = (x, z, pad = 1.85) => streets.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  function placeHouse(x, z, rot) {
    if (Math.hypot(x, z) > 232) return;                 // stay within the village footprint
    if (onRect(x, z, 2.5)) return;                      // keep the gameplay plazas/spine clear
    if (onStreet(x, z)) return;                         // never drop a house onto a lane — it would block the road
    for (const h of houseXf) if (Math.abs(h.x - x) < 4.4 && Math.abs(h.z - z) < 4.4) return; // no overlaps
    houseXf.push({ x, z, rot, sc: rand(0.86, 1.12), wi: (Math.random() * WALLS.length) | 0, ri: (Math.random() * ROOFS.length) | 0 });
  }
  const LANE = 1.9;  // lane half-width
  // a lorong: a straight walkable boardwalk with a row of houses fronting each
  // side. Positions are COLLECTED here and placed in a 2nd pass (below), once
  // every lane exists — so a row never lands on a crossing lane (= blocked road).
  function street(x0, z0, x1, z1) {
    const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const r = { x0: Math.min(x0, x1) - LANE, x1: Math.max(x0, x1) + LANE, z0: Math.min(z0, z1) - LANE, z1: Math.max(z0, z1) + LANE };
    streets.push(r); deck(r, 9);
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0); const n = Math.max(1, Math.round(len / 5.4)), off = LANE + 2.1;
    for (let i = 0; i <= n; i++) { const t = i / n, lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t; for (const s of [-1, 1]) houseCands.push({ x: horiz ? lx : lx + s * off, z: horiz ? lz + s * off : lz, rot: horiz ? (s > 0 ? 0 : Math.PI) : s * Math.PI / 2 }); }
  }
  // the central lorong grid: verticals + horizontals that intersect one another
  // and overlap the spine (B_HUB / BR_AB / hubs) → fully connected, walkable.
  for (const x of [-86, -58, -30, 30, 58, 86]) street(x, -52, x, 94);
  for (const z of [-46, -20, 8, 34, 60, 86]) street(-100, z, 100, z);
  street(0, 50, 0, 94);   // tie the north rows down to the spine's start pier
  // far-bank rows beyond the boat gate (rasterized only once the boat is built)
  for (const x of [-16, 16]) street(x, -150, x, -96);
  for (const z of [-128, -104]) street(-46, z, 46, z);
  // 2nd pass: place the house rows now that every lane exists, dropping any that
  // would sit on a lane (e.g. at crossings) so no house blocks the road.
  for (const cd of houseCands) placeHouse(cd.x, cd.z, cd.rot);

  const dummy = new THREE.Object3D();
  function buildInst(geo, mat, list) { const m = new THREE.InstancedMesh(geo, mat, list.length); m.castShadow = m.receiveShadow = false; list.forEach((h, i) => { dummy.position.set(h.x, 0, h.z); dummy.rotation.set(0, h.rot, 0); dummy.scale.setScalar(h.sc); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }); m.instanceMatrix.needsUpdate = true; wgrp.add(m); }
  const baseGeo = new THREE.BoxGeometry(HW + 0.5, 1.6, HW + 0.5);
  const wallGeo = new THREE.BoxGeometry(HW, HH, HW); wallGeo.translate(0, 1.0 + HH / 2, 0);
  const roofGeo = new THREE.CylinderGeometry(0.01, HW * 0.8, 1.3, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 1.0 + HH + 0.55, 0);
  if (houseXf.length) { buildInst(baseGeo, tmat(0x6e4f30), houseXf); for (let w = 0; w < WALLS.length; w++) { const s = houseXf.filter((h) => h.wi === w); if (s.length) buildInst(wallGeo, tmat(WALLS[w]), s); } for (let r = 0; r < ROOFS.length; r++) { const s = houseXf.filter((h) => h.ri === r); if (s.length) buildInst(roofGeo, tmat(ROOFS[r]), s); } }
  // spine railings: coveredPt now counts the lorong lanes too, so the rail opens
  // wherever a street or house row adjoins — no fenced-off houses, every row walk-on.
  buildRailings([]);

  // ---- walkability grid: roads + titian planks + house platforms are all
  // walkable (O(1) lookup). Far kampong cells (z < -57) unlock with the boat.
  const GMINX = -150, GMINZ = -195, GCELL = 1.4, GW = Math.ceil(300 / GCELL), GH = Math.ceil(370 / GCELL);
  const grid = new Uint8Array(GW * GH);
  const gidx = (x, z) => { const cx = ((x - GMINX) / GCELL) | 0, cz = ((z - GMINZ) / GCELL) | 0; return (cx < 0 || cz < 0 || cx >= GW || cz >= GH) ? -1 : cz * GW + cx; };
  const walkableAt = (x, z) => { const i = gidx(x, z); return i >= 0 && grid[i] === 1; };
  const markRect = (r) => { for (let x = r.x0; x <= r.x1; x += GCELL) for (let z = r.z0; z <= r.z1; z += GCELL) { const i = gidx(x, z); if (i >= 0) grid[i] = 1; } };
  const markDisc = (x, z, rad) => { for (let dx = -rad; dx <= rad; dx += GCELL) for (let dz = -rad; dz <= rad; dz += GCELL) if (dx * dx + dz * dz <= rad * rad) { const i = gidx(x + dx, z + dz); if (i >= 0) grid[i] = 1; } };
  const markPlank = (mx, mz, ang, len, wid) => { const ca = Math.cos(ang), sa = Math.sin(ang); for (let u = -len / 2; u <= len / 2; u += GCELL) for (let v = -wid / 2; v <= wid / 2; v += GCELL) { const i = gidx(mx + ca * u - sa * v, mz + sa * u + ca * v); if (i >= 0) grid[i] = 1; } };
  function rasterize(far) { const ok = (z) => far || z >= -57; for (const r of ALLRECTS) if (ok((r.z0 + r.z1) / 2)) markRect(r); for (const r of streets) if (ok((r.z0 + r.z1) / 2)) markRect(r); for (const h of houseXf) if (ok(h.z)) markDisc(h.x, h.z, 3.8); }
  rasterize(false);

  // ---- hubs + landmark labels --------------------------------------------
  function label(text, x, y, z, sc = 1) { const t = canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = 'bold 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.lineJoin = 'round'; g.strokeStyle = 'rgba(12,32,42,0.9)'; g.strokeText(text, w / 2, h / 2); g.fillStyle = '#fff'; g.fillText(text, w / 2, h / 2); }); const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); spr.position.set(x, y, z); spr.scale.set((text.length * 0.5 + 2) * sc, 2.2 * sc, 1); wgrp.add(spr); return spr; }
  (function mosque() { const g = new THREE.Group(); g.position.set(30, 0, 30); wgrp.add(g); const body = toon(new THREE.BoxGeometry(6.4, 3.4, 6.4), 0xeef2f0, { thickness: 0.04 }); body.position.y = 2.9; g.add(body); const dome = toon(new THREE.SphereGeometry(1.8, 18, 12, 0, 6.28, 0, Math.PI / 2), 0x2f8f6a, { thickness: 0.04 }); dome.position.y = 5.0; g.add(dome); const min = toon(new THREE.CylinderGeometry(0.5, 0.6, 8, 12), 0xeef2f0, { thickness: 0.03 }); min.position.set(4.2, 4.5, 4.2); g.add(min); })();
  label('Masjid', 30, 9.4, 30);
  function civic(x, z, wallC, roofC, name) { const g = new THREE.Group(); g.position.set(x, 0, z); wgrp.add(g); const body = toon(new THREE.BoxGeometry(6, 3.2, 5.2), wallC, { thickness: 0.04 }); body.position.y = 2.8; g.add(body); const roof = toon(new THREE.BoxGeometry(6.6, 0.5, 5.8), roofC, { thickness: 0.04 }); roof.position.y = 4.6; g.add(roof); label(name, x, 6.6, z); }
  civic(-34, -20, 0x4f7fb0, 0x32597a, 'Police Station'); civic(36, -20, 0xe6d8a8, 0xb06a3a, 'Sekolah');
  function isle(x, z, r, color, name, mirror) { const rock = toon(new THREE.IcosahedronGeometry(r, 1), color, { thickness: 0.06, flat: true }); rock.scale.set(1, rand(0.5, 0.8), 1); rock.rotation.y = rand(0, 6.28); rock.position.set(x, r * 0.2, z); wgrp.add(rock); if (mirror) { const disc = toon(new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.25, 28), 0xbfe6f0, { outline: false }); disc.position.set(x, 0.12, z); wgrp.add(disc); } label(name, x, r + 4, z, 1.25); }
  isle(-120, -70, 11, 0x3a3f44, 'Jong Batu'); isle(124, 60, 10, 0x8a9aa0, 'Pulau Cermin', true); isle(0, -150, 16, 0x4a4036, 'Batu Masap');

  // ---- traditional dress -------------------------------------------------
  const songket = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3a1f2a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(217,178,74,0.7)'; g.lineWidth = 2; for (let i = -w; i < w; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); } g.fillStyle = '#e8c75a'; for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.fillRect(x - 2, y - 2, 4, 4); } });
  const plaid = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#5a4632'; g.fillRect(0, 0, w, h); const band = (c, a, st, ww, v) => { g.globalAlpha = a; g.fillStyle = c; for (let p = 0; p < (v ? w : h); p += st) { if (v) g.fillRect(p, 0, ww, h); else g.fillRect(0, p, w, ww); } }; for (const v of [true, false]) { band('#3a2c1e', 0.55, 34, 12, v); band('#8a6f4e', 0.5, 34, 6, v); band('#d8c39a', 0.45, 17, 3, v); } g.globalAlpha = 1; });
  function person({ skin = 0xe9b58a, baju = 0x1f6f5a, seluar = null, head = 'songkok', hatColor = 0x16181c, sampin = true, sampinTex = 'songket', sampinColor = 0xb08820, tee = false, female = false, scale = 1 } = {}) {
    seluar = seluar ?? baju; const g = new THREE.Group(); g.scale.setScalar(scale); const legs = [], arms = [];
    if (female) {
      // baju kurung kampong style: a long sarong (kain) to the ankles + the
      // baju's flared hem falling over it (long sleeves come from the arm loop).
      const kain = toon(new THREE.CylinderGeometry(0.33, 0.5, 1.52, 16), sampinColor, { thickness: 0.03, map: songket }); place(kain, 0, 0.78, 0); g.add(kain);
      const hem = toon(new THREE.CylinderGeometry(0.49, 0.52, 0.1, 16), sampinColor, { thickness: 0.02, map: songket }); place(hem, 0, 0.06, 0); g.add(hem);
      const tunic = toon(new THREE.CylinderGeometry(0.32, 0.47, 0.82, 16), baju, { thickness: 0.03 }); place(tunic, 0, 1.0, 0); g.add(tunic);
    }
    else for (const s of [-1, 1]) { const leg = toon(new THREE.CapsuleGeometry(0.14, 0.55, 4, 8), seluar, { thickness: 0.03 }); place(leg, s * 0.16, 0.55, 0); g.add(leg); legs.push(leg); const shoe = toon(new THREE.BoxGeometry(0.22, 0.13, 0.32), 0x2c2c2c, { thickness: 0.02 }); leg.add(shoe); shoe.position.set(0, -0.42, 0.05); }
    const torso = toon(new THREE.CapsuleGeometry(0.3, 0.62, 6, 12), baju, { thickness: 0.035 }); place(torso, 0, 1.3, 0); g.add(torso);
    for (const s of [-1, 1]) { if (tee) { const sl = toon(new THREE.CylinderGeometry(0.13, 0.12, 0.22, 8), baju, { thickness: 0.025 }); place(sl, s * 0.34, 1.5, 0); g.add(sl); const arm = toon(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), skin, { thickness: 0.025 }); place(arm, s * 0.38, 1.18, 0); arm.rotation.z = s * 0.15; g.add(arm); arms.push(arm); } else { const arm = toon(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), baju, { thickness: 0.03 }); place(arm, s * 0.38, 1.28, 0); arm.rotation.z = s * 0.15; g.add(arm); arms.push(arm); } const hand = toon(new THREE.SphereGeometry(0.1, 8, 7), skin, { thickness: 0.02 }); place(hand, s * 0.44, 0.96, 0); g.add(hand); }
    if (!tee && !female) { const col = toon(new THREE.CylinderGeometry(0.2, 0.23, 0.12, 12), baju, { thickness: 0.02 }); place(col, 0, 1.64, 0); g.add(col); }
    if (tee) { const pk = toon(new THREE.BoxGeometry(0.13, 0.13, 0.04), baju, { thickness: 0.02 }); place(pk, 0.13, 1.34, 0.29); g.add(pk); }
    if (sampin && !female) { const tex = sampinTex === 'plaid' ? plaid : songket; const sam = toon(new THREE.CylinderGeometry(0.34, 0.39, 0.5, 16), sampinColor, { thickness: 0.025, map: tex }); place(sam, 0, 0.96, 0); g.add(sam); }
    const headM = toon(new THREE.SphereGeometry(0.27, 16, 14), skin, { thickness: 0.03 }); place(headM, 0, 1.96, 0); g.add(headM);
    if (head === 'songkok') { const cap = toon(new THREE.CylinderGeometry(0.27, 0.29, 0.3, 16), hatColor, { thickness: 0.025 }); place(cap, 0, 2.15, 0); g.add(cap); }
    else if (head === 'tudung') { // hijab: frames the face, drapes over the chest, with a lace-trimmed hem
      const crown = toon(new THREE.SphereGeometry(0.36, 18, 16), hatColor, { thickness: 0.03 }); crown.scale.set(1.1, 1.14, 1.1); place(crown, 0, 2.0, -0.16); g.add(crown);
      const drape = toon(new THREE.CylinderGeometry(0.33, 0.52, 1.12, 20, 1, true), hatColor, { outline: false }); place(drape, 0, 1.45, 0); g.add(drape);
      const trim = toon(new THREE.TorusGeometry(0.5, 0.055, 8, 26), 0xf3e9e2, { outline: false }); trim.rotation.x = Math.PI / 2; place(trim, 0, 0.92, 0.02); g.add(trim);
    }
    else if (head === 'headscarf') { const wr = toon(new THREE.SphereGeometry(0.3, 16, 12), 0x7a5f42, { thickness: 0.03, map: plaid }); wr.scale.set(1.06, 0.72, 1.06); place(wr, 0, 2.12, 0); g.add(wr); const kn = toon(new THREE.BoxGeometry(0.18, 0.16, 0.16), 0x5a4632, { thickness: 0.02, map: plaid }); place(kn, 0, 2.22, -0.26); g.add(kn); }
    else { const hair = toon(new THREE.SphereGeometry(0.29, 16, 12), 0x35251c, { thickness: 0.03 }); hair.scale.set(1, 0.85, 1); place(hair, 0, 2.0, -0.02); g.add(hair); }
    return { group: g, legs, arms };
  }
  const OUTFITS = [{ baju: 0xf2efe6, head: 'hair', sampin: true }, { baju: 0xf2efe6, head: 'songkok', sampin: true }, { baju: 0x244f8a, head: 'songkok' }, { baju: 0x8a2f3a, head: 'songkok', sampin: true }, { baju: 0x2f8f6a, head: 'songkok', sampin: true }, { baju: 0xf0c419, hatColor: 0xcf2f2f, sampinColor: 0x6a4a2a, head: 'tudung', female: true }, { baju: 0x3a6f8a, hatColor: 0x213a5a, head: 'songkok' }, { baju: 0xd8cdb6, seluar: 0x2c2c2c, tee: true, head: 'hair' }, { baju: 0x6a4f8a, head: 'songkok', sampin: true }, { baju: 0x4f8f9a, hatColor: 0xc0392b, sampinColor: 0x4f6f5a, head: 'tudung', female: true }];
  const outfit = (i) => ({ ...OUTFITS[((i % OUTFITS.length) + OUTFITS.length) % OUTFITS.length] });

  // ---- player ------------------------------------------------------------
  const kidP = person({ baju: 0xeee7d8, seluar: 0x1c1c1c, tee: false, head: 'headscarf', sampin: true, sampinTex: 'plaid', sampinColor: 0x6a533a }); // long-sleeve shirt
  const kid = kidP.group; wgrp.add(kid); kid.position.set(0, DECK_Y, 46); kid.rotation.y = Math.PI;
  const legs = kidP.legs, arms = kidP.arms; const PLAYER_R = 0.5;

  // ---- ambient villagers (kids, strolling adults, cats) ------------------
  function playingKid(hx, hz) { const pr = person({ ...outfit((Math.random() * OUTFITS.length) | 0), sampin: false, scale: 0.66 }); pr.group.position.set(hx, DECK_Y, hz); wgrp.add(pr.group); kids.push({ group: pr.group, legs: pr.legs, hx, hz, tx: hx, tz: hz, spd: rand(1.8, 2.6), t: 0, ph: rand(0, 6.28), roam: 3.5 }); }
  playingKid(8, 30); playingKid(-7, 26); playingKid(7, 2); playingKid(-9, -2); playingKid(8, -38); playingKid(-8, -42);
  function spawnVillager(hx, hz) { const pr = person({ ...outfit((Math.random() * OUTFITS.length) | 0) }); pr.group.position.set(hx, DECK_Y, hz); wgrp.add(pr.group); kids.push({ group: pr.group, legs: pr.legs, hx, hz, tx: hx, tz: hz, spd: rand(0.9, 1.8), t: rand(0, 2), ph: rand(0, 6.28), roam: 2.4 }); }
  // a busy kampong: scatter villagers along the lorong lanes, all across the map
  const _vchosen = [];
  for (const r of streets) {
    const cz = (r.z0 + r.z1) / 2; if (cz < -57) continue;            // skip the boat-gated far lanes
    const horiz = (r.x1 - r.x0) > (r.z1 - r.z0); const cx = (r.x0 + r.x1) / 2;
    const a0 = (horiz ? r.x0 : r.z0) + 8, a1 = (horiz ? r.x1 : r.z1) - 8;
    for (let a = a0; a <= a1; a += 13) {
      const x = horiz ? a : cx, z = horiz ? cz : a;
      if (Math.hypot(x, z) < 8 || _vchosen.length >= 26) continue;   // not on the start pier; cap the crowd
      if (_vchosen.some(([px, pz]) => Math.hypot(px - x, pz - z) < 12)) continue; // spread them out
      _vchosen.push([x, z]); spawnVillager(x, z);
    }
  }
  function buildCat(c) { const g = new THREE.Group(); const b = toon(new THREE.CapsuleGeometry(0.17, 0.4, 4, 8), c, { thickness: 0.02 }); b.rotation.z = Math.PI / 2; place(b, 0, 0.26, 0); g.add(b); const hd = toon(new THREE.SphereGeometry(0.16, 10, 9), c, { thickness: 0.02 }); place(hd, 0.33, 0.38, 0); g.add(hd); const tl = toon(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), c, { thickness: 0.012 }); place(tl, -0.36, 0.4, 0); tl.rotation.z = 0.8; g.add(tl); return g; }
  function spawnCat(hx, hz, c) { const g = buildCat(c); g.position.set(hx, DECK_Y, hz); wgrp.add(g); cats.push({ group: g, hx, hz, tx: hx, tz: hz, t: rand(1, 4), spd: rand(0.8, 1.3), meowCd: rand(4, 10) }); }
  spawnCat(10, 28, 0xd98b46); spawnCat(-12, 2, 0x8a8a8a); spawnCat(11, -38, 0x3a3a3a); spawnCat(60, 34, 0xc9b79a); spawnCat(-60, -20, 0x4a4a4a); spawnCat(34, 60, 0xd98b46);

  // ---- camera ------------------------------------------------------------
  let camYaw = 0, camPitch = 0.5, camDist = 10; const tmpV = new THREE.Vector3();
  function updateCamera(instant) { const tx = kid.position.x, ty = kid.position.y + 1.6, tz = kid.position.z; const px = tx + Math.sin(camYaw) * Math.cos(camPitch) * camDist, py = ty + Math.sin(camPitch) * camDist, pz = tz + Math.cos(camYaw) * Math.cos(camPitch) * camDist; if (instant) camera.position.set(px, py, pz); else camera.position.lerp(tmpV.set(px, py, pz), 0.16); camera.lookAt(tx, ty, tz); }
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
  function onResize() { const asp = innerWidth / innerHeight; camera.aspect = asp; camera.fov = asp >= 1.5 ? 62 : asp >= 1.0 ? 56 : asp >= 0.7 ? 50 : 46; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); const portrait = innerWidth < innerHeight; blocked = portrait; rotateEl.classList.toggle('show', portrait); }
  const onOrient = () => setTimeout(onResize, 200); onResize();
  addEventListener('mousemove', onMM); addEventListener('mouseup', onMU); addEventListener('wheel', onWheel, { passive: true }); addEventListener('keydown', onKD); addEventListener('keyup', onKU); addEventListener('resize', onResize); addEventListener('orientationchange', onOrient);

  // ---- HUD ---------------------------------------------------------------
  const hud = document.createElement('div'); hud.className = 'kq'; overlay.appendChild(hud);
  hud.innerHTML = `<button class="kq-quit" aria-label="Quit">‹</button><div class="kq-obj"></div>` +
    `<div class="kq-stats"><div class="kq-chip">👥 <b class="kq-fol">0</b></div><div class="kq-chip">🎟 <b class="kq-tok">0</b></div><div class="kq-chip">🛒 <b class="kq-mkt">0/6</b></div><div class="kq-chip">🛶 <b class="kq-boat">0</b>/3</div><div class="kq-trust"><span class="kq-trustfill"></span></div></div>` +
    `<div class="kq-joy"></div><button class="kq-act" hidden></button>` +
    `<div class="kq-dialog" hidden><div class="kq-who">Villager</div><div class="kq-text"></div><div class="kq-judge"></div><button class="kq-ok">Close</button></div>` +
    `<div class="kq-banner"></div>` +
    `<div class="kq-win" hidden><div class="card"><h2></h2><p></p><button>Continue</button></div></div>`;
  const q = (s) => hud.querySelector(s);
  const elFol = q('.kq-fol'), elTok = q('.kq-tok'), elBoat = q('.kq-boat'), elMkt = q('.kq-mkt'), elTrust = q('.kq-trustfill'), objEl = q('.kq-obj'), actBtn = q('.kq-act'), dialog = q('.kq-dialog'), banner = q('.kq-banner'), joy = q('.kq-joy'), judgeRow = q('.kq-judge');
  q('.kq-quit').onclick = () => { sfx.unlock(); endMission(false, true); };
  q('.kq-dialog .kq-ok').onclick = () => { dialog.hidden = true; dialogOpen = false; };
  actBtn.onclick = doAction;
  q('.kq-win button').onclick = () => endMission(true);
  let dialogOpen = false, salamBusy = false, actTarget = null;
  function showBanner(t, ms = 2400) { banner.textContent = t; banner.classList.add('show'); clearTimeout(showBanner._t); showBanner._t = setTimeout(() => banner.classList.remove('show'), ms); }
  function saySalam() { if (salamBusy) return; salamBusy = true; sfx.unlock(); sfx.clue(); speak('Assalamualaikum', 0.85); setTimeout(() => speak('Waalaikumsalam', 1.5), 1100); setTimeout(() => { salamBusy = false; }, 2600); }

  // ---- TITIAN state ------------------------------------------------------
  let tokens = 0, followers = 0, boatParts = 0, boatBuilt = false, won = false, ended = false, elapsed = 0, stun = 0, running = true, raf = 0;
  const stashes = []; // {x,z, group, beacon, revealed, cleared, claimId}
  let stashesCleared = 0, totalStashes = 0, culpritReady = false, mysterySolved = false, marketsVisited = 0;

  // informants: each gives a CLAIM you must judge. truth: rumour|crime|sacred.
  // crime claims expose a drug stash (their stashId).
  const informants = [];
  function informer(name, x, z, opts, claim, truth, stashId) {
    const pr = person(opts); pr.group.position.set(x, DECK_Y, z); pr.group.rotation.y = Math.atan2(0 - x, 0 - z); wgrp.add(pr.group);
    addSolid(x, z, 1.0);
    const inf = { name, x: x + Math.sin(pr.group.rotation.y) * 1.4, z: z + Math.cos(pr.group.rotation.y) * 1.4, claim, truth, stashId, judged: false, follower: false };
    informants.push(inf); greetables.push({ x, z, greeted: false });
    return inf;
  }
  // informants spread to every corner of the kampong — you must explore to find them
  informer('Mak Limah', 86, 58, outfit(5), 'They whisper that Pak Hassan stole the surau fund… but nobody has seen a single ringgit move.', 'rumour');       // NE district
  informer('Awang', -86, 58, outfit(7), 'Don’t go near the old blue house after Maghrib — a pontianak wails there. Stay away, ya.', 'crime', 's1');          // NW district
  informer('Hjh Noraini', -98, 8, outfit(9), 'On still nights a pale light drifts over Jong Batu, and a cold wind follows it. Some things we leave to Allah.', 'sacred'); // far W
  informer('Pak Mat', 98, 8, outfit(1), 'Strange boats slip up the channel after Isyak and leave again empty before dawn. I’ve counted three.', 'crime', 's2');     // far E
  informer('Cikgu Rahim', 58, -46, outfit(2), 'The fund vanished the very week Pak Long sailed home rich and changed. Too neat to be chance.', 'rumour');          // SE / school
  informer('Sarjan (Police)', -58, -46, outfit(2), 'No proof, no arrest. Bring me what’s true — separate the gossip from the crime — and I’ll act.', 'sacred');   // SW / police
  // far kampong informant (after the boat) — names the culprit
  const farInf = informer('Bilal Tua', 0, -104, outfit(3), 'Pak Long keeps a locked store on Batu Masap. That cursed rock hides no ghost — it hides his poison.', 'crime', 's3');
  farInf._far = true;

  // stashes (hidden, revealed when their crime claim is judged correctly)
  function makeStash(id, x, z) {
    const g = new THREE.Group(); g.position.set(x, DECK_Y, z); g.visible = false; wgrp.add(g);
    const crate = toon(new THREE.BoxGeometry(1, 0.8, 0.7), 0x6a4a2a, { thickness: 0.03 }); place(crate, 0, 0.4, 0); g.add(crate);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.5, 7, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); place(beam, 0, 3.6, 0); g.add(beam);
    const st = { id, x, z, group: g, beam, revealed: false, cleared: false };
    stashes.push(st); totalStashes++; return st;
  }
  makeStash('s1', HAUNTED_X, HAUNTED_Z - 3); makeStash('s2', 58, -8); makeStash('s3', 0, -108);

  // ---- vendor stalls (gerai) — spread to the corners; visiting each rewards
  // tokens + a clue, so the mission rewards exploring the whole kampong. ------
  function vendorStall(x, z, name, clue) {
    const rot = Math.atan2(-x, -z);                                   // face the kampong centre
    const g = new THREE.Group(); g.position.set(x, DECK_Y, z); g.rotation.y = rot; wgrp.add(g);
    const skirt = toon(new THREE.BoxGeometry(2.0, 0.9, 1.0), 0xb23a3a, { thickness: 0.03 }); place(skirt, 0, 0.55, 0); g.add(skirt);
    const top = toon(new THREE.BoxGeometry(2.1, 0.16, 1.1), 0x8a6234, { thickness: 0.03 }); place(top, 0, 1.05, 0); g.add(top);
    for (const sx of [-1, 1]) { const post = toon(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6), 0x6e4f30, { thickness: 0.02 }); place(post, sx * 0.95, 1.15, -0.45); g.add(post); }
    const canopy = toon(new THREE.BoxGeometry(2.5, 0.12, 1.5), 0xf0c419, { thickness: 0.03 }); place(canopy, 0, 2.35, -0.15); canopy.rotation.x = -0.14; g.add(canopy);
    const goods = [0xd9695a, 0x6cae6a, 0xe0b24a, 0x4f9ad0];
    for (let i = 0; i < 4; i++) { const gd = toon(new THREE.BoxGeometry(0.3, 0.3, 0.3), goods[i], { thickness: 0.02 }); place(gd, -0.6 + i * 0.4, 1.28, 0.16); g.add(gd); }
    const vp = person({ ...outfit((Math.random() * OUTFITS.length) | 0) }); vp.group.position.set(x - Math.sin(rot) * 0.95, DECK_Y, z - Math.cos(rot) * 0.95); vp.group.rotation.y = rot; wgrp.add(vp.group);
    addSolid(x, z, 1.0);
    markets.push({ x: x + Math.sin(rot) * 1.8, z: z + Math.cos(rot) * 1.8, name, clue, visited: false }); // visit point in front
  }
  vendorStall(86, 92, 'Gerai Mak Som', 'fresh ikan and tapai — and plenty of gossip');
  vendorStall(-86, 92, 'Gerai Pak Atan', 'kuih and strong kopi for tired feet');
  vendorStall(98, -20, 'Gerai Awang Itam', 'nets, rope and lampu for the night boats');
  vendorStall(-98, 34, 'Gerai Hjh Mona', 'songket and sampin brought from upriver');
  vendorStall(86, -50, 'Gerai Kak Ani', 'sayur and buah by the school jetty');
  vendorStall(-86, -50, 'Gerai Pak Usop', 'belacan and budu — you can smell it from afar!');

  // ---- UI helpers --------------------------------------------------------
  const marketsNeeded = () => Math.max(1, markets.length - 1);   // visit all but one
  function refreshHud() { elFol.textContent = followers; elTok.textContent = tokens; elBoat.textContent = boatParts; elMkt.textContent = marketsVisited + '/' + markets.length; elTrust.style.width = Math.round((followers / informants.length) * 100) + '%'; }
  function setObjective() {
    let t;
    const judged = informants.filter((i) => i.judged && !i._far).length;
    if (judged < 6) t = 'Walk the whole kampong — the villagers are spread to every corner. <b>Talk to each and judge their claim</b>.';
    else if (marketsVisited < marketsNeeded()) t = `Explore further — <b>visit the gerai (market stalls)</b> in every corner (${marketsVisited}/${markets.length}).`;
    else if (stashesCleared < 2) t = 'Crime hides behind ghost stories. <b>Clear the drug stashes</b> you’ve uncovered.';
    else if (!boatBuilt) t = `Earn tokens, then <b>build the boat</b> at the waterfront (${boatParts}/3) to reach the far kampong.`;
    else if (!mysterySolved) t = 'Cross to the far kampong and <b>confront Pak Long</b> on Batu Masap.';
    else t = 'Rally the kampong — you’ve earned their trust.';
    objEl.innerHTML = t;
  }
  refreshHud(); setObjective();

  function judge(inf, verdict) {
    const correct = inf.truth === verdict;
    judgeRow.innerHTML = '';
    if (correct) {
      inf.judged = true; if (!inf.follower) { inf.follower = true; followers++; }
      tokens += 2; sfx.pickup();
      if (inf.truth === 'crime' && inf.stashId) { const st = stashes.find((s) => s.id === inf.stashId); if (st && !st.revealed) { st.revealed = true; st.group.visible = true; showBanner('A stash uncovered — the “ghost” was a cover! 🔥', 2600); } else showBanner('Trust earned. +2🎟', 1800); }
      else if (inf.truth === 'sacred') showBanner('You left it be, out of respect. Trust earned.', 2200);
      else showBanner('You saw through the gossip. Trust earned. +2🎟', 2200);
      if (inf._far) culpritReady = true;
      q('.kq-text').textContent = 'Terima kasih, adik. You see clearly. I stand with you.';
    } else {
      q('.kq-text').textContent = 'Hmm… not quite. Cross-check with the others before you decide.';
    }
    refreshHud(); setObjective(); checkWin();
  }
  function tryTalk(inf) {
    if (dialogOpen || won) return; sfx.unlock(); sfx.talk();
    q('.kq-dialog .kq-who').textContent = inf.name; q('.kq-text').textContent = inf.claim;
    judgeRow.innerHTML = inf.judged ? '' : `<button class="kq-jr">🗣 Rumour</button><button class="kq-jc">🔪 Crime</button><button class="kq-js">👻 Leave it</button>`;
    if (!inf.judged) { judgeRow.querySelector('.kq-jr').onclick = () => judge(inf, 'rumour'); judgeRow.querySelector('.kq-jc').onclick = () => judge(inf, 'crime'); judgeRow.querySelector('.kq-js').onclick = () => judge(inf, 'sacred'); }
    dialog.hidden = false; dialogOpen = true;
  }
  function clearStash(st) { st.cleared = true; st.group.visible = false; stashesCleared++; tokens += 5; sfx.win(); showBanner(`Stash destroyed (${stashesCleared}/2 in the kampong). +5🎟`, 2400); refreshHud(); setObjective(); checkWin(); }
  function buildBoat() { if (boatParts >= 3 || tokens < 4) { if (tokens < 4) showBanner('Need 4🎟 for the next boat part.', 1800); return; } tokens -= 4; boatParts++; sfx.pickup(); if (boatParts >= 3) { boatBuilt = true; WALK.push(...FAR); rasterize(true); showBanner('The boat is ready! The far kampong is open — sail north. 🛶', 3000); } else showBanner(`Boat part fitted (${boatParts}/3). +parts with tokens.`, 2200); refreshHud(); setObjective(); }
  function confront() { if (mysterySolved) return; mysterySolved = true; sfx.win(); showBanner('Pak Long is exposed. The poison stops here. ⚖', 2800); setObjective(); checkWin(); }
  function checkWin() {
    if (won) return;
    if (stashesCleared >= 2 && mysterySolved && followers >= 5 && marketsVisited >= marketsNeeded()) {
      won = true; sfx.win();
      q('.kq-win h2').textContent = 'THE KAMPONG STANDS TOGETHER';
      q('.kq-win p').textContent = `You walked every lorong and won every corner — ${followers} households behind you, the drugs gone, the truth told.`;
      q('.kq-win').hidden = false;
    }
  }

  function doAction() {
    if (won || dialogOpen || !actTarget) return;
    if (actTarget.kind === 'talk') tryTalk(actTarget.inf);
    else if (actTarget.kind === 'stash') clearStash(actTarget.st);
    else if (actTarget.kind === 'boat') buildBoat();
    else if (actTarget.kind === 'confront') confront();
  }

  // boat-building point at the waterfront jetty; confront point on Batu Masap
  const BOAT_PT = { x: 0, z: -56 }, CONFRONT_PT = { x: 0, z: -112 };

  // ---- mission plumbing --------------------------------------------------
  function collide(p) { for (const s of solids) { const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + PLAYER_R; if (d < min && d > 1e-4) { p.x = s.x + dx / d * min; p.z = s.z + dz / d * min; } } for (const pd of peds) if (pd.blocking) { const dx = p.x - pd.x, dz = p.z - pd.z, d = Math.hypot(dx, dz), min = 0.85 + PLAYER_R; if (d < min && d > 1e-4) { p.x = pd.x + dx / d * min; p.z = pd.z + dz / d * min; } } }
  function clampWalk(p) { if (WALK.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1)) return; let best = null, bd = Infinity; for (const r of WALK) { const cx = clamp(p.x, r.x0, r.x1), cz = clamp(p.z, r.z0, r.z1); const d = (cx - p.x) ** 2 + (cz - p.z) ** 2; if (d < bd) { bd = d; best = { x: cx, z: cz }; } } p.x = best.x; p.z = best.z; }
  function endMission(win, quit = false) { if (ended) return; ended = true; let stars = 0; if (win) { stars = 1; if (followers >= informants.length) stars++; if (stashesCleared >= totalStashes) stars++; } cleanup(); onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit }); }
  function cleanup() { running = false; cancelAnimationFrame(raf); removeEventListener('mousemove', onMM); removeEventListener('mouseup', onMU); removeEventListener('wheel', onWheel); removeEventListener('keydown', onKD); removeEventListener('keyup', onKU); removeEventListener('resize', onResize); removeEventListener('orientationchange', onOrient); renderer.dispose(); renderer.forceContextLoss?.(); overlay.remove(); }

  // ---- loop --------------------------------------------------------------
  const clock = new THREE.Clock(); let stepAcc = 0;
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    if (blocked) { renderer.render(scene, camera); return; }
    if (sfx.ready) sfx.music({ ambience: true });
    if (!won) elapsed += dt; const tnow = clock.elapsedTime;
    let ix = stick.dx, iy = stick.dy;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (keys.has('w') || keys.has('arrowup')) iy -= 1; if (keys.has('s') || keys.has('arrowdown')) iy += 1;
    const mag = Math.hypot(ix, iy); let moving = false; if (stun > 0) stun -= dt;
    if (mag > 0.05 && !dialogOpen && !won) {
      moving = true; const nx = ix / (mag > 1 ? mag : 1), ny = iy / (mag > 1 ? mag : 1);
      const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw), rightX = Math.cos(camYaw), rightZ = -Math.sin(camYaw);
      const mvX = rightX * nx + fwdX * ny, mvZ = rightZ * nx + fwdZ * ny, spd = 6.2;
      // move along the walkable grid (titian + roads + house platforms); slide along walls
      const ox = kid.position.x, oz = kid.position.z, nX = ox + mvX * spd * dt, nZ = oz + mvZ * spd * dt; let px = ox, pz = oz;
      if (walkableAt(nX, nZ)) { px = nX; pz = nZ; } else if (walkableAt(nX, oz)) px = nX; else if (walkableAt(ox, nZ)) pz = nZ;
      kid.position.x = px; kid.position.z = pz; collide(kid.position);
      if (!walkableAt(kid.position.x, kid.position.z)) { kid.position.x = px; kid.position.z = pz; }
      kid.rotation.y = Math.atan2(mvX, mvZ); stepAcc += dt; if (stepAcc > 0.28) { stepAcc = 0; sfx.footstep(); }
    }
    const sw = moving ? Math.sin(tnow * 11) : 0; if (legs[0]) { legs[0].rotation.x = sw * 0.6; legs[1].rotation.x = -sw * 0.6; } if (arms[0]) { arms[0].rotation.x = -sw * 0.5; arms[1].rotation.x = sw * 0.5; }
    kid.position.y = DECK_Y + (moving ? Math.abs(Math.sin(tnow * 11)) * 0.04 : 0);

    // salam on proximity
    if (!salamBusy && !dialogOpen && !won) { for (const gg of greetables) { if (gg.greeted) continue; if (Math.hypot(kid.position.x - gg.x, kid.position.z - gg.z) < 3) { gg.greeted = true; saySalam(); break; } } }
    // visit a market stall on proximity → reward + clue (rewards exploring)
    if (!won && !dialogOpen) for (const m of markets) { if (m.visited) continue; if (Math.hypot(kid.position.x - m.x, kid.position.z - m.z) < 3.2) { m.visited = true; marketsVisited++; tokens += 2; sfx.pickup(); showBanner(`${m.name}: ${m.clue}. +2🎟 (markets ${marketsVisited}/${markets.length})`, 2800); refreshHud(); setObjective(); checkWin(); break; } }
    for (const k of kids) { k.t -= dt; if (k.t <= 0) { const rm = k.roam ?? 3.5; k.t = rand(1, 3); k.tx = k.hx + rand(-rm, rm); k.tz = k.hz + rand(-rm, rm); } const dx = k.tx - k.group.position.x, dz = k.tz - k.group.position.z, d = Math.hypot(dx, dz); let mv = false; if (d > 0.25) { mv = true; k.group.position.x += dx / d * k.spd * dt; k.group.position.z += dz / d * k.spd * dt; k.group.rotation.y = Math.atan2(dx, dz); } const ks = mv ? Math.sin(tnow * 12 + k.ph) : 0; if (k.legs[0]) { k.legs[0].rotation.x = ks * 0.7; k.legs[1].rotation.x = -ks * 0.7; } k.group.position.y = DECK_Y + (mv ? Math.abs(Math.sin(tnow * 12 + k.ph)) * 0.05 : 0); }
    for (const c of cats) { c.t -= dt; if (c.t <= 0) { c.t = rand(2, 5); c.tx = c.hx + rand(-3, 3); c.tz = c.hz + rand(-3, 3); } const dx = c.tx - c.group.position.x, dz = c.tz - c.group.position.z, d = Math.hypot(dx, dz); if (d > 0.2) { c.group.position.x += dx / d * c.spd * dt; c.group.position.z += dz / d * c.spd * dt; c.group.rotation.y = Math.atan2(dx, dz); } c.meowCd -= dt; if (c.meowCd <= 0) { c.meowCd = rand(7, 16); if (Math.hypot(kid.position.x - c.group.position.x, kid.position.z - c.group.position.z) < 10) sfx.meow(); } }
    for (const st of stashes) if (st.revealed && !st.cleared) { st.beam.material.opacity = 0.25 + Math.sin(tnow * 4) * 0.12; st.group.rotation.y += dt * 0.5; }

    // pick the nearest contextual action
    actTarget = null; let bd = Infinity;
    const consider = (kind, x, z, range, extra) => { const d = Math.hypot(kid.position.x - x, kid.position.z - z); if (d < range && d < bd) { bd = d; actTarget = { kind, ...extra }; } };
    for (const st of stashes) if (st.revealed && !st.cleared) consider('stash', st.x, st.z, 2.4, { st });
    for (const inf of informants) { if (inf._far && !boatBuilt) continue; consider('talk', inf.x, inf.z, 2.8, { inf }); }
    if (!boatBuilt) consider('boat', BOAT_PT.x, BOAT_PT.z, 3.2, {});
    if (boatBuilt && culpritReady && !mysterySolved) consider('confront', CONFRONT_PT.x, CONFRONT_PT.z, 4, {});
    if (actTarget && !dialogOpen && !won) { actBtn.hidden = false; actBtn.textContent = actTarget.kind === 'talk' ? '💬 Talk' : actTarget.kind === 'stash' ? '🔥 Clear stash' : actTarget.kind === 'boat' ? `🛶 Build boat (4🎟)` : '⚖ Confront'; } else actBtn.hidden = true;

    updateCamera(false);
    if (stick.id === null) joy.style.opacity = '0'; else { joy.style.opacity = '1'; joy.style.left = stick.ox + 'px'; joy.style.top = stick.oy + 'px'; joy.style.setProperty('--kx', stick.dx * MAXR + 'px'); joy.style.setProperty('--ky', stick.dy * MAXR + 'px'); }
    renderer.render(scene, camera);
  }
  function loop() { if (!running) return; try { tick(); } catch (e) { console.error(e); } raf = requestAnimationFrame(loop); }
  loop();
  showBanner('Selamat pulang. The kampong is fraying — listen, and earn their trust.', 3600);

  // ---- debug hook --------------------------------------------------------
  window.__kampong = {
    state: () => ({ x: +kid.position.x.toFixed(1), z: +kid.position.z.toFixed(1), tokens, followers, boatParts, boatBuilt, stashesCleared, totalStashes, mysterySolved, culpritReady, won, ended, walkRects: WALK.length, judged: informants.filter((i) => i.judged).length, marketsVisited, markets: markets.length, villagers: kids.length }),
    marketPts: () => markets.map((m) => [+m.x.toFixed(1), +m.z.toFixed(1)]),
    infPts: () => informants.map((i) => [i.name, +i.x.toFixed(1), +i.z.toFixed(1)]),
    teleport: (x, z) => { kid.position.x = x; kid.position.z = z; updateCamera(true); },
    cam: (yaw, pitch, dist) => { camYaw = yaw; camPitch = pitch; camDist = dist; updateCamera(true); },
    judgeAll: () => informants.forEach((i) => { if (!i._far || boatBuilt) judge(i, i.truth); }),
    clearStashes: () => stashes.forEach((s) => { if (s.revealed && !s.cleared) clearStash(s); }),
    addTokens: (n) => { tokens += n; refreshHud(); },
    buildBoat: () => { while (!boatBuilt) { tokens = Math.max(tokens, 4); buildBoat(); } },
    confront: () => confront(),
    walkable: (x, z) => walkableAt(x, z),
    houses: () => houseXf.length,
    nearestHouseTo: (x, z) => { let bn = 1e9, bh = null; for (const h of houseXf) { const d = Math.hypot(h.x - x, h.z - z); if (d < bn) { bn = d; bh = h; } } return bh ? { x: +bh.x.toFixed(1), z: +bh.z.toFixed(1), d: +bn.toFixed(1) } : null; },
    reach: (tx, tz) => { const si = gidx(0, 46), ti = gidx(tx, tz); if (si < 0 || ti < 0 || grid[si] !== 1 || grid[ti] !== 1) return false; const seen = new Uint8Array(grid.length); const stack = [si]; seen[si] = 1; while (stack.length) { const c = stack.pop(); if (c === ti) return true; const cx = c % GW; const cand = [[c + 1, cx + 1 < GW], [c - 1, cx > 0], [c + GW, true], [c - GW, true]]; for (const [ni, okk] of cand) { if (okk && ni >= 0 && ni < grid.length && !seen[ni] && grid[ni] === 1) { seen[ni] = 1; stack.push(ni); } } } return false; },
  };
  return overlay;
}
