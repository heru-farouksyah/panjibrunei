// Landing at Muara — a 3rd-person collect-a-thon over Kampong Ayer (the water
// village). Walk the stilt-village boardwalks, gather the 5 lost baskets, ask
// the local vendors for clues (they reveal beacons over the hidden ones), dodge
// the bicycles rattling along the planks, and carry everything to the waterfront
// jetty. Characters wear traditional Bruneian dress (baju melayu + songkok +
// songket sampin; tudung + baju kurung for the lady vendor).
//
// Self-contained Three.js mission: own renderer/scene/HUD, procedural audio,
// scoped CSS, full teardown. Plugs into the campaign reward loop via onResult().

import * as THREE from 'three';
import { RAMP, toon, place, canvasTex, skyDome, outlineMaterial } from './toonkit.js';
import { Audio as KAudio } from './kampongAudio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// inject the HUD stylesheet once
let styled = false;
function injectStyle() {
  if (styled) return; styled = true;
  const css = `
  .screen-overlay.kampong{padding:0;gap:0;overflow:hidden;background:#5fb9b4;touch-action:none;}
  .kampong canvas{display:block;width:100%;height:100%;touch-action:none;}
  .kampong .kq{position:absolute;inset:0;pointer-events:none;z-index:3;font-family:system-ui,-apple-system,sans-serif;}
  .kampong .kq button{pointer-events:auto;}
  .kampong .kq-quit{position:absolute;top:calc(8px + env(safe-area-inset-top));left:calc(8px + env(safe-area-inset-left));width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.85);color:#16384c;font-size:24px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(20,50,70,0.35);display:flex;align-items:center;justify-content:center;padding:0 4px 2px 0;}
  .kampong .kq-obj{position:absolute;top:calc(10px + env(safe-area-inset-top));left:54px;max-width:58vw;background:rgba(20,55,65,0.55);color:#fff;padding:8px 13px;border-radius:12px;font-size:12.5px;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,0.4);}
  .kampong .kq-obj b{color:#ffe08a;}
  .kampong .kq-count{position:absolute;top:calc(10px + env(safe-area-inset-top));right:14px;background:rgba(20,55,65,0.55);color:#fff;padding:8px 13px;border-radius:12px;font-size:15px;font-weight:700;display:flex;align-items:center;gap:4px;text-shadow:0 1px 2px rgba(0,0,0,0.4);}
  .kampong .kq-count b{color:#ffe08a;}
  .kampong .kq-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.16),rgba(255,255,255,0.06));border:2px solid rgba(255,255,255,0.4);opacity:0;transition:opacity 0.15s;}
  .kampong .kq-joy::after{content:'';position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,0.55);transform:translate(var(--kx,0),var(--ky,0));}
  .kampong .kq-talk{position:absolute;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#e2a23a;color:#3a2a10;border:none;border-radius:999px;padding:13px 26px;font-size:16px;font-weight:800;box-shadow:0 4px 16px rgba(40,90,120,0.4);cursor:pointer;animation:kqbob 1.1s ease-in-out infinite;}
  .kampong .kq-talk[hidden]{display:none;}
  @keyframes kqbob{50%{transform:translateX(-50%) translateY(-4px);}}
  .kampong .kq-dialog{position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(440px,90vw);background:rgba(255,255,255,0.96);color:#16384c;border-radius:16px;padding:15px 18px 13px;box-shadow:0 8px 30px rgba(20,50,70,0.4);border:2px solid #2f7f78;pointer-events:auto;}
  .kampong .kq-dialog[hidden]{display:none;}
  .kampong .kq-who{font-weight:800;color:#2f7f78;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:5px;}
  .kampong .kq-text{font-size:15px;line-height:1.45;margin-bottom:11px;}
  .kampong .kq-ok{float:right;background:#2f7f78;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-weight:700;font-size:14px;cursor:pointer;}
  .kampong .kq-banner{position:absolute;left:50%;top:21%;transform:translateX(-50%) translateY(-8px);background:rgba(20,55,65,0.82);color:#fff;padding:11px 22px;border-radius:999px;font-size:16px;font-weight:700;white-space:nowrap;max-width:92vw;text-align:center;opacity:0;transition:opacity 0.3s,transform 0.3s;box-shadow:0 6px 20px rgba(20,50,70,0.45);}
  .kampong .kq-banner.show{opacity:1;transform:translateX(-50%) translateY(0);}`;
  const el = document.createElement('style'); el.id = 'kq-style'; el.textContent = css; document.head.appendChild(el);
}

export function showKampong(audio, { mission, onResult } = {}) {
  injectStyle();
  const cfg = mission?.explore || {};
  const TOTAL = cfg.baskets || 5;
  const PAR_MIN = cfg.par || 2.5;
  const sfx = new KAudio();
  const rand = (a, b) => a + Math.random() * (b - a);
  // spoken voice via the browser Speech API (no audio files); silently no-ops
  // where unsupported. Used for the salam exchange.
  function speak(text, pitch = 1) {
    try { const ss = window.speechSynthesis; if (!ss) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'ms-MY'; u.pitch = pitch; u.rate = 0.9; ss.speak(u); } catch (e) { /* ignore */ }
  }

  // ---- overlay + renderer ------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay kampong';
  document.body.appendChild(overlay);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  overlay.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9bd9d0, 34, 90);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.1);
  sun.position.set(-12, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  const scam = sun.shadow.camera; scam.left = -34; scam.right = 34; scam.top = 34; scam.bottom = -34; sun.shadow.bias = -0.0004;
  scene.add(sun, new THREE.HemisphereLight(0xd6f3fb, 0x4a6f74, 0.9), new THREE.AmbientLight(0xbfe6e2, 0.25), skyDome());

  const wgrp = new THREE.Group(); scene.add(wgrp);
  const solids = []; const addSolid = (x, z, r) => solids.push({ x, z, r });
  const peds = [], kids = [], cats = [], greetables = [];   // village life + the salam targets

  // ---- water -------------------------------------------------------------
  const rippleTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2f9fc7'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3;
    for (let i = 0; i < 60; i++) { const y = Math.random() * h, x = Math.random() * w, len = 20 + Math.random() * 60; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 6, x + len, y); g.stroke(); }
  }, { repeat: [10, 10] });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshToonMaterial({ color: 0x39a6cc, gradientMap: RAMP, map: rippleTex, transparent: true, opacity: 0.95 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.2; water.receiveShadow = true; scene.add(water);

  // ---- boardwalk ---------------------------------------------------------
  const DECK_Y = 0.6;
  // a branching boardwalk network — a bigger, more tangled water village.
  // adjacent rects overlap so the player crosses junctions seamlessly.
  const HUB   = { x0: -12, x1: 12,  z0: -6,  z1: 16 };   // central square
  const SOUTH = { x0: -3,  x1: 3,   z0: 14,  z1: 26 };   // entry pier (start)
  const NORTH = { x0: -3,  x1: 3,   z0: -26, z1: -4 };   // pier to the waterfront finish
  const WEST  = { x0: -30, x1: -10, z0: 2,   z1: 12 };   // west wing
  const WESTN = { x0: -30, x1: -20, z0: -14, z1: 4 };    // spur north off the west wing
  const EAST  = { x0: 10,  x1: 30,  z0: 0,   z1: 12 };   // east wing
  const EASTN = { x0: 20,  x1: 30,  z0: -12, z1: 2 };    // spur north off the east wing
  const WALK = [HUB, SOUTH, NORTH, WEST, WESTN, EAST, EASTN];
  const plankTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c79a5e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,60,30,0.5)'; g.lineWidth = 3;
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(120,85,45,0.25)';
    for (let i = 0; i < 40; i++) { const y = Math.random() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 4); g.stroke(); }
  }, { repeat: [8, 8] });
  function deck(r) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const tex = plankTex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), new THREE.MeshToonMaterial({ color: 0xcf9f63, gradientMap: RAMP, map: tex }));
    m.position.set((r.x0 + r.x1) / 2, DECK_Y - 0.2, (r.z0 + r.z1) / 2); m.receiveShadow = m.castShadow = true;
    m.add(new THREE.Mesh(m.geometry, outlineMaterial(0.05))); wgrp.add(m);
    for (let x = r.x0 + 1.5; x < r.x1; x += 5) for (let z = r.z0 + 1.5; z < r.z1; z += 5) { const pole = toon(new THREE.CylinderGeometry(0.22, 0.26, 4, 7), 0x6e4f30, { thickness: 0.03 }); place(pole, x, -1.4, z); wgrp.add(pole); }
  }
  WALK.forEach(deck);
  function railing(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    if (len < 0.8) return;
    const rail = toon(new THREE.BoxGeometry(len, 0.12, 0.12), 0xb98a4e, { thickness: 0.02 }); rail.position.set((x0 + x1) / 2, DECK_Y + 0.85, (z0 + z1) / 2); rail.rotation.y = -ang; wgrp.add(rail);
    const n = Math.max(1, Math.floor(len / 2));
    for (let i = 0; i <= n; i++) { const t = i / n; const post = toon(new THREE.BoxGeometry(0.14, 0.95, 0.14), 0xa97c43, { thickness: 0.02 }); place(post, x0 + dx * t, DECK_Y + 0.45, z0 + dz * t); wgrp.add(post); }
  }
  // auto-railing: fence every deck edge that faces open water; skip junctions
  // (segments whose immediate outside is covered by another walkable rect).
  const coveredPt = (px, pz) => WALK.some((r) => px >= r.x0 - 0.05 && px <= r.x1 + 0.05 && pz >= r.z0 - 0.05 && pz <= r.z1 + 0.05);
  function railEdges() {
    for (const r of WALK) {
      const sides = [
        { hor: true, fixed: r.z0, lo: r.x0, hi: r.x1, ox: 0, oz: -0.6 },
        { hor: true, fixed: r.z1, lo: r.x0, hi: r.x1, ox: 0, oz: 0.6 },
        { hor: false, fixed: r.x0, lo: r.z0, hi: r.z1, ox: -0.6, oz: 0 },
        { hor: false, fixed: r.x1, lo: r.z0, hi: r.z1, ox: 0.6, oz: 0 },
      ];
      for (const sd of sides) {
        const len = sd.hi - sd.lo, n = Math.max(1, Math.round(len));
        let run = null;
        for (let i = 0; i < n; i++) {
          const tm = sd.lo + len * ((i + 0.5) / n);
          const mx = sd.hor ? tm : sd.fixed, mz = sd.hor ? sd.fixed : tm;
          const open = !coveredPt(mx + sd.ox, mz + sd.oz);
          if (open && run === null) run = sd.lo + len * (i / n);
          if (!open && run !== null) { emitRail(sd, run, sd.lo + len * (i / n)); run = null; }
        }
        if (run !== null) emitRail(sd, run, sd.hi);
      }
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
    const wallsTex = canvasTex(96, 64, (cx, ww, hh) => { cx.fillStyle = 'rgba(40,55,60,0.9)'; cx.fillRect(ww * 0.18, hh * 0.28, ww * 0.22, hh * 0.5); cx.fillRect(ww * 0.6, hh * 0.28, ww * 0.22, hh * 0.5); cx.strokeStyle = 'rgba(255,255,255,0.6)'; cx.lineWidth = 3; cx.strokeRect(ww * 0.18, hh * 0.28, ww * 0.22, hh * 0.5); cx.strokeRect(ww * 0.6, hh * 0.28, ww * 0.22, hh * 0.5); });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color, gradientMap: RAMP, map: wallsTex }));
    walls.castShadow = walls.receiveShadow = true; walls.position.y = 1.65 + h / 2; walls.add(new THREE.Mesh(walls.geometry, outlineMaterial(0.05))); g.add(walls);
    const roof = toon(new THREE.CylinderGeometry(0.01, w * 0.78, 1.5, 4), 0xb5483b, { thickness: 0.05 }); roof.rotation.y = Math.PI / 4; place(roof, 0, 1.65 + h + 0.7, 0); roof.scale.z = d / w; g.add(roof);
    const door = toon(new THREE.BoxGeometry(0.9, 1.5, 0.1), 0x7a4f2c, { thickness: 0.02 }); place(door, 0, 1.65 + 0.75, d / 2 + 0.02); g.add(door);
    if (collide) addSolid(x, z, Math.max(w, d) * 0.5 + 0.2);
  }
  // backdrop houses ringing the village (over the water, decorative)
  house(-9, -30, 0.15, HC[0], 5, 4.5, 3, false); house(0, -31, 0.05, HC[2], 5, 5, 3.4, false); house(9, -30, -0.15, HC[3], 5, 4.5, 3, false);
  house(-7, 33, 0.1, HC[1], 4.5, 4, 2.8, false); house(7, 33, -0.1, HC[5], 4.5, 4, 2.8, false);
  house(-35, 8, 1.5, HC[2], 5, 5, 3, false); house(-35, -4, 1.5, HC[4], 4.5, 4.5, 2.8, false);
  house(35, 6, -1.5, HC[5], 5, 5, 3, false); house(35, -5, -1.5, HC[1], 4.5, 4.5, 2.8, false);
  // the "painted houses" landmarks beside the two HIDDEN baskets (the clue)
  house(-26, -17, 0.1, HC[4], 5, 4.5, 3, false); house(26, -15, -0.1, HC[0], 5, 4.5, 3, false);
  // obstacle houses ON the decks to weave around
  house(-7, 12, 0.1, HC[3], 3.6, 3.6, 2.4); house(8, 13, -0.1, HC[1], 3.6, 3.6, 2.4);
  house(-18, 10, 0.2, HC[5], 3.4, 3.4, 2.4); house(18, 10, -0.2, HC[2], 3.4, 3.4, 2.4);

  // ---- traditional dress -------------------------------------------------
  const songket = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3a1f2a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(217,178,74,0.7)'; g.lineWidth = 2;
    for (let i = -w; i < w; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.fillStyle = '#e8c75a'; for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
  });
  // a person in traditional dress; returns {group, legs, arms} for optional walk anim
  function person({ skin = 0xe9b58a, baju = 0x1f6f5a, seluar = null, head = 'songkok', hatColor = 0x16181c, sampin = true, female = false, scale = 1 } = {}) {
    seluar = seluar ?? baju;
    const g = new THREE.Group(); g.scale.setScalar(scale);
    const legs = [], arms = [];
    if (female) { const skirt = toon(new THREE.CylinderGeometry(0.3, 0.52, 1.35, 14), baju, { thickness: 0.03 }); place(skirt, 0, 0.7, 0); g.add(skirt); }
    else for (const s of [-1, 1]) { const leg = toon(new THREE.CapsuleGeometry(0.14, 0.55, 4, 8), seluar, { thickness: 0.03 }); place(leg, s * 0.16, 0.55, 0); g.add(leg); legs.push(leg); const shoe = toon(new THREE.BoxGeometry(0.22, 0.13, 0.32), 0x2c2c2c, { thickness: 0.02 }); leg.add(shoe); shoe.position.set(0, -0.42, 0.05); }
    const torso = toon(new THREE.CapsuleGeometry(0.3, 0.62, 6, 12), baju, { thickness: 0.035 }); place(torso, 0, 1.3, 0); g.add(torso);
    for (const s of [-1, 1]) { const arm = toon(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), baju, { thickness: 0.03 }); place(arm, s * 0.38, 1.28, 0); arm.rotation.z = s * 0.15; g.add(arm); arms.push(arm); const hand = toon(new THREE.SphereGeometry(0.1, 8, 7), skin, { thickness: 0.02 }); place(hand, s * 0.44, 0.96, 0); g.add(hand); }
    const collar = toon(new THREE.CylinderGeometry(0.2, 0.23, 0.12, 12), baju, { thickness: 0.02 }); place(collar, 0, 1.64, 0); g.add(collar);
    if (sampin && !female) { const sam = toon(new THREE.CylinderGeometry(0.34, 0.39, 0.5, 16), 0xb08820, { thickness: 0.025, map: songket }); place(sam, 0, 0.96, 0); g.add(sam); const flap = toon(new THREE.BoxGeometry(0.22, 0.5, 0.07), 0xb08820, { thickness: 0.02, map: songket }); place(flap, 0, 0.96, 0.37); g.add(flap); }
    const headM = toon(new THREE.SphereGeometry(0.27, 16, 14), skin, { thickness: 0.03 }); place(headM, 0, 1.96, 0); g.add(headM);
    if (head === 'songkok') { const cap = toon(new THREE.CylinderGeometry(0.27, 0.29, 0.3, 16), hatColor, { thickness: 0.025 }); place(cap, 0, 2.15, 0); g.add(cap); }
    else if (head === 'tudung') { const tud = toon(new THREE.SphereGeometry(0.33, 16, 14), hatColor, { thickness: 0.03 }); tud.scale.set(1, 1.05, 1); place(tud, 0, 1.99, 0); g.add(tud); const drape = toon(new THREE.CylinderGeometry(0.37, 0.26, 0.7, 16, 1, true), hatColor, { outline: false }); place(drape, 0, 1.55, 0); g.add(drape); }
    else { const hair = toon(new THREE.SphereGeometry(0.29, 16, 12), 0x35251c, { thickness: 0.03 }); hair.scale.set(1, 0.85, 1); place(hair, 0, 2.0, -0.02); g.add(hair); }
    return { group: g, legs, arms };
  }

  // ---- vendor stalls (traditional vendors + clues) -----------------------
  const vendors = [];
  function stall(x, z, rot, awn, vendorOpts, clue) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; wgrp.add(g);
    const table = toon(new THREE.BoxGeometry(2.6, 0.2, 1.2), 0x9a6b3a, { thickness: 0.03 }); place(table, 0, DECK_Y + 0.9, 0); g.add(table);
    for (const sx of [-1, 1]) { const leg = toon(new THREE.BoxGeometry(0.16, 0.9, 0.16), 0x7a5230, { thickness: 0.02 }); place(leg, sx * 1.1, DECK_Y + 0.45, 0); g.add(leg); }
    for (const sx of [-1, 1]) { const post = toon(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), 0x8a6a44, { thickness: 0.02 }); place(post, sx * 1.2, DECK_Y + 1.2, -0.4); g.add(post); }
    const awning = toon(new THREE.BoxGeometry(3, 0.12, 1.6), awn, { thickness: 0.03 }); place(awning, 0, DECK_Y + 2.4, -0.1); awning.rotation.x = -0.18; g.add(awning);
    const stripe = toon(new THREE.BoxGeometry(3.02, 0.13, 0.3), 0xffffff, { thickness: 0.02 }); place(stripe, 0, DECK_Y + 2.42, 0.5); stripe.rotation.x = -0.18; g.add(stripe);
    const goods = [0xe0b24a, 0xd9695a, 0x6cae6a, 0xe88a3a];
    for (let i = 0; i < 5; i++) { const fr = toon(new THREE.SphereGeometry(0.16 + Math.random() * 0.06, 8, 7), goods[i % 4], { thickness: 0.02 }); place(fr, -0.9 + i * 0.45, DECK_Y + 1.12, 0.2); g.add(fr); }
    const v = person(vendorOpts); v.group.position.set(0, DECK_Y, -0.9); v.group.rotation.y = Math.PI; g.add(v.group);
    addSolid(x, z, 1.7);
    vendors.push({ x, z, clue, spoken: false });
    greetables.push({ x: x + Math.sin(rot) * 1.4, z: z + Math.cos(rot) * 1.4, greeted: false }); // greet from the customer side
  }
  stall(-6, 8, 0.3, 0xd9695a, { baju: 0x8a2f3a, hatColor: 0x141414, head: 'songkok' }, 'Two baskets are tucked up the narrow spurs, by the painted houses. Talk to me and I’ll light the beacons — follow them, adik!');
  stall(-22, 8, 1.2, 0x4f9ad0, { baju: 0x244f8a, head: 'songkok' }, 'Look to the far ends of the wings — a basket waits at each. The lanterns mark the boardwalks.');
  stall(22, 8, -1.2, 0xe0b24a, { baju: 0x6a2f7a, head: 'tudung', hatColor: 0xead6e6, female: true }, 'When you have all five, bring them to the waterfront jetty in the north, where the boat waits. Mind the bicycles, ya!');

  // lanterns + boats + waterfront arch
  function lantern(x, z) { const pole = toon(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), 0x6a4f30, { thickness: 0.02 }); place(pole, x, DECK_Y + 1.2, z); wgrp.add(pole); const bulb = toon(new THREE.SphereGeometry(0.22, 12, 10), 0xffe08a, { thickness: 0.02, emissive: 0xffb84d }); place(bulb, x, DECK_Y + 2.45, z); wgrp.add(bulb); }
  [[-3, -4], [3, -4], [-3, -14], [3, -14], [-3, -24], [3, -24], [-12, 4], [12, 2], [-22, 4], [22, 3], [-6, 16], [6, 16]].forEach(([x, z]) => lantern(x, z));
  function perahu(x, z, rot, color) { const g = new THREE.Group(); g.position.set(x, -0.05, z); g.rotation.y = rot; wgrp.add(g); const hull = toon(new THREE.CapsuleGeometry(0.55, 2.4, 6, 12), color, { thickness: 0.04 }); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.55); place(hull, 0, 0.25, 0); g.add(hull); const mast = toon(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), 0x6a4f30, { thickness: 0.02 }); place(mast, 0, 1.2, 0); g.add(mast); }
  perahu(-2.6, -28.5, 0.3, 0xd9695a); perahu(2.6, -29, -0.2, 0x4f9ad0); perahu(-5.5, -27.5, 0.8, 0x6cae6a);
  const finishZ = NORTH.z0 + 1.5;
  for (const sx of [-1, 1]) { const post = toon(new THREE.CylinderGeometry(0.16, 0.18, 3.4, 8), 0x8a5a32, { thickness: 0.03 }); place(post, sx * 2.6, 1.5, finishZ); wgrp.add(post); }
  const wfBanner = toon(new THREE.BoxGeometry(6, 1.0, 0.12), 0x2f7f78, { thickness: 0.03, map: canvasTex(384, 64, (g, w, h) => { g.fillStyle = '#2f7f78'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `bold ${h * 0.5}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TEPIAN  AIR  ·  WATERFRONT', w / 2, h / 2); }) });
  place(wfBanner, 0, 3.4, finishZ); wgrp.add(wfBanner);

  // ---- baskets -----------------------------------------------------------
  const items = [];
  function basket(x, z, hidden) {
    const g = new THREE.Group(); g.position.set(x, DECK_Y + 0.7, z); wgrp.add(g);
    const body = toon(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 10), 0xcf9a52, { thickness: 0.03 }); g.add(body);
    const rim = toon(new THREE.TorusGeometry(0.3, 0.05, 8, 14), 0xa9743a, { thickness: 0.02 }); rim.rotation.x = Math.PI / 2; place(rim, 0, 0.2, 0); g.add(rim);
    const handle = toon(new THREE.TorusGeometry(0.28, 0.04, 8, 14, Math.PI), 0xa9743a, { thickness: 0.02 }); place(handle, 0, 0.2, 0); g.add(handle);
    for (let i = 0; i < 3; i++) { const f = toon(new THREE.SphereGeometry(0.12, 8, 7), [0xe0b24a, 0xd9695a, 0x6cae6a][i], { thickness: 0.015 }); place(f, (i - 1) * 0.12, 0.22, 0); g.add(f); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.4, 6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    place(beam, 0, 3.2, 0); g.add(beam); beam.visible = !hidden;
    items.push({ x, z, g, beam, hidden, taken: false });
  }
  basket(0, 9, false);       // hub — the obvious starter
  basket(-28, 7, false);     // far west wing end
  basket(28, 6, false);      // far east wing end
  basket(-26, -10, true);    // NW spur — hidden by a painted house (needs a clue)
  basket(26, -8, true);      // NE spur — hidden by a painted house (needs a clue)

  // ---- bicycles ----------------------------------------------------------
  const bikes = [];
  function bicycle(z, dir, speed, x0, x1) {
    const g = new THREE.Group(); wgrp.add(g);
    const frame = toon(new THREE.BoxGeometry(1.1, 0.12, 0.12), 0x2f6f8f, { thickness: 0.02 }); place(frame, 0, 0.7, 0); g.add(frame);
    const seat = toon(new THREE.BoxGeometry(0.3, 0.12, 0.2), 0x222222, { thickness: 0.02 }); place(seat, -0.4, 0.95, 0); g.add(seat);
    const bar = toon(new THREE.BoxGeometry(0.1, 0.5, 0.1), 0x2f6f8f, { thickness: 0.02 }); place(bar, 0.5, 0.95, 0); g.add(bar);
    for (const sx of [-0.5, 0.5]) { const wheel = toon(new THREE.TorusGeometry(0.42, 0.08, 8, 16), 0x222222, { thickness: 0.02 }); place(wheel, sx, 0.42, 0); wheel.rotation.y = Math.PI / 2; g.add(wheel); wheel._spin = true; }
    const rider = person({ baju: 0x2f7d6b, head: 'songkok', sampin: false, scale: 0.92 }); rider.group.position.set(-0.1, 0.5, 0); g.add(rider.group);
    bikes.push({ g, z, dir, speed, x0, x1, x: dir > 0 ? x0 : x1, bellCd: 0 });
  }
  bicycle(12, 1, 5, -10, 10);     // one along the hub
  bicycle(6, -1, 5, 12, 28);      // one along the east wing

  // ---- village life: blocking folk, playing kids, cats -------------------
  // People who stand in the way at chokepoints; greet them (salam) and they
  // step aside to give way. Each is a static collider until greeted.
  function blocker(x, z, ax, az, opts) {
    const pr = person(opts); pr.group.position.set(x, DECK_Y, z); pr.group.rotation.y = Math.atan2(0 - x, 0 - z); wgrp.add(pr.group);
    const pd = { group: pr.group, x, z, ax, az, blocking: true, stepping: false, bob: rand(0, 6.28) };
    peds.push(pd); greetables.push({ x, z, greeted: false, ped: pd });
  }
  blocker(0, 14.5, 2.4, 14.5, { baju: 0x3a6f8a, head: 'songkok' });           // gateway from the entry pier
  blocker(-10.5, 7, -10.5, 11, { baju: 0x7a3f6a, head: 'tudung', hatColor: 0xe6d2dc, female: true }); // west wing mouth
  blocker(10.5, 6, 10.5, 10.5, { baju: 0x2f6f5a, head: 'songkok' });          // east wing mouth
  blocker(0, -4.5, 2.4, -4.5, { baju: 0x8a6a2f, head: 'songkok' });           // north pier toward the waterfront

  // Kids playing — they run little circuits within a home patch (no collision)
  function playingKid(hx, hz) {
    const pr = person({ baju: [0xd9695a, 0x4f9ad0, 0x6cae6a, 0xe0b24a][(Math.random() * 4) | 0], head: Math.random() < 0.5 ? 'songkok' : 'hair', sampin: false, scale: 0.66 });
    pr.group.position.set(hx, DECK_Y, hz); wgrp.add(pr.group);
    kids.push({ group: pr.group, legs: pr.legs, hx, hz, tx: hx, tz: hz, spd: rand(1.8, 2.6), t: 0, ph: rand(0, 6.28) });
  }
  playingKid(7, 2); playingKid(-7, 1); playingKid(4, -1); playingKid(-22, 6);
  // a ball for them to chase
  const ball = toon(new THREE.SphereGeometry(0.28, 12, 10), 0xf2efe2, { thickness: 0.03 }); place(ball, 5, DECK_Y + 0.28, 0.5); wgrp.add(ball);

  // Cats — wander slowly, sometimes sit, occasional meow
  function buildCat(color) {
    const g = new THREE.Group();
    const body = toon(new THREE.CapsuleGeometry(0.17, 0.4, 4, 8), color, { thickness: 0.02 }); body.rotation.z = Math.PI / 2; place(body, 0, 0.26, 0); g.add(body);
    const head = toon(new THREE.SphereGeometry(0.16, 10, 9), color, { thickness: 0.02 }); place(head, 0.33, 0.38, 0); g.add(head);
    for (const sx of [-1, 1]) { const ear = toon(new THREE.ConeGeometry(0.07, 0.13, 4), color, { thickness: 0.012 }); place(ear, 0.34, 0.54, sx * 0.08); g.add(ear); }
    const tail = toon(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), color, { thickness: 0.012 }); place(tail, -0.36, 0.4, 0); tail.rotation.z = 0.8; g.add(tail);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = toon(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 6), color, { thickness: 0.012 }); place(leg, 0.05 + sx * 0.16, 0.13, sz * 0.1); g.add(leg); }
    return g;
  }
  function spawnCat(hx, hz, color) { const g = buildCat(color); g.position.set(hx, DECK_Y, hz); wgrp.add(g); cats.push({ group: g, hx, hz, tx: hx, tz: hz, t: rand(1, 4), spd: rand(0.8, 1.3), meowCd: rand(4, 10) }); }
  spawnCat(6, 12, 0xd98b46); spawnCat(-20, 8, 0x8a8a8a);

  // ---- player (traditional dress) ----------------------------------------
  const kidP = person({ baju: 0x1f6f5a, seluar: 0x16554a, head: 'songkok', hatColor: 0x14140f, sampin: true });
  const kid = kidP.group; wgrp.add(kid); kid.position.set(0, DECK_Y, 22); kid.rotation.y = Math.PI;
  const legs = kidP.legs, arms = kidP.arms;
  // a woven rattan sling bag for carrying the baskets
  const bag = toon(new THREE.BoxGeometry(0.42, 0.5, 0.22), 0xb5894f, { thickness: 0.03 }); place(bag, 0.16, 1.15, -0.3); kid.add(bag);
  const strap = toon(new THREE.BoxGeometry(0.08, 0.7, 0.06), 0x8a6638, { thickness: 0.015 }); place(strap, -0.12, 1.3, 0.18); strap.rotation.z = 0.4; kid.add(strap);
  const PLAYER_R = 0.5;

  // ---- camera ------------------------------------------------------------
  let camYaw = 0, camPitch = 0.5, camDist = 9;   // camera behind the player, looking north into the village
  const tmpV = new THREE.Vector3();
  function updateCamera(instant) {
    const tx = kid.position.x, ty = kid.position.y + 1.6, tz = kid.position.z;
    const px = tx + Math.sin(camYaw) * Math.cos(camPitch) * camDist, py = ty + Math.sin(camPitch) * camDist, pz = tz + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    if (instant) camera.position.set(px, py, pz); else camera.position.lerp(tmpV.set(px, py, pz), 0.16);
    camera.lookAt(tx, ty, tz);
  }
  updateCamera(true);

  // ---- input -------------------------------------------------------------
  const keys = new Set();
  const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  const drag = { id: null, lx: 0, ly: 0 };
  const MAXR = 60;
  const isLeft = (x) => x < innerWidth * 0.5;
  const cv = renderer.domElement;
  cv.addEventListener('touchstart', (e) => { sfx.unlock(); for (const t of e.changedTouches) { if (isLeft(t.clientX) && stick.id === null) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.dx = stick.dy = 0; } else if (drag.id === null) { drag.id = t.identifier; drag.lx = t.clientX; drag.ly = t.clientY; } } e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const d = Math.hypot(dx, dy) || 1; if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; } stick.dx = dx / MAXR; stick.dy = dy / MAXR; } else if (t.identifier === drag.id) { camYaw -= (t.clientX - drag.lx) * 0.006; camPitch = clamp(camPitch + (t.clientY - drag.ly) * 0.005, 0.12, 1.2); drag.lx = t.clientX; drag.ly = t.clientY; } } e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { stick.id = null; stick.dx = stick.dy = 0; } if (t.identifier === drag.id) drag.id = null; } e.preventDefault(); }, { passive: false });
  cv.addEventListener('mousedown', (e) => { sfx.unlock(); drag.id = 'm'; drag.lx = e.clientX; drag.ly = e.clientY; });
  function onMM(e) { if (drag.id === 'm') { camYaw -= (e.clientX - drag.lx) * 0.005; camPitch = clamp(camPitch + (e.clientY - drag.ly) * 0.004, 0.12, 1.2); drag.lx = e.clientX; drag.ly = e.clientY; } }
  function onMU() { if (drag.id === 'm') drag.id = null; }
  function onWheel(e) { camDist = clamp(camDist + Math.sign(e.deltaY) * 0.8, 5, 18); }
  function onKD(e) { const k = e.key.toLowerCase(); if ('wasd'.includes(k) || k.startsWith('arrow')) { keys.add(k); sfx.unlock(); } if (k === 'e') tryTalk(); }
  function onKU(e) { keys.delete(e.key.toLowerCase()); }
  function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  addEventListener('mousemove', onMM); addEventListener('mouseup', onMU); addEventListener('wheel', onWheel, { passive: true });
  addEventListener('keydown', onKD); addEventListener('keyup', onKU); addEventListener('resize', onResize);

  // ---- HUD ---------------------------------------------------------------
  const hud = document.createElement('div'); hud.className = 'kq'; overlay.appendChild(hud);
  hud.innerHTML =
    `<button class="kq-quit" aria-label="Quit">‹</button>` +
    `<div class="kq-obj">Collect the <b>${TOTAL} baskets</b>, then reach the <b>waterfront</b></div>` +
    `<div class="kq-count">🧺 <b class="kq-num">0</b>/${TOTAL} &nbsp;·&nbsp; ⏱ <b class="kq-time">0:00</b></div>` +
    `<div class="kq-joy"></div>` +
    `<button class="kq-talk" hidden>💬 Talk</button>` +
    `<div class="kq-dialog" hidden><div class="kq-who">Local Vendor</div><div class="kq-text"></div><button class="kq-ok">Got it</button></div>` +
    `<div class="kq-banner"></div>`;
  const q = (s) => hud.querySelector(s);
  const elNum = q('.kq-num'), elTime = q('.kq-time'), talkBtn = q('.kq-talk'), dialog = q('.kq-dialog'), banner = q('.kq-banner'), joy = q('.kq-joy');
  q('.kq-quit').onclick = () => { sfx.unlock(); endMission(false, true); };
  q('.kq-ok').onclick = () => { dialog.hidden = true; dialogOpen = false; };
  talkBtn.onclick = tryTalk;
  let nearVendor = null, dialogOpen = false, salamBusy = false;
  function showBanner(txt, ms = 2200) { banner.textContent = txt; banner.classList.add('show'); clearTimeout(showBanner._t); showBanner._t = setTimeout(() => banner.classList.remove('show'), ms); }
  // the salam exchange — spoken aloud, no tap needed (fires on proximity)
  function saySalam() {
    if (salamBusy) return; salamBusy = true; sfx.unlock(); sfx.clue();
    speak('Assalamualaikum', 0.85); showBanner('🙋 Assalamualaikum!', 1500);
    setTimeout(() => { speak('Waalaikumsalam', 1.5); showBanner('🙂 Waalaikumsalam!', 1600); }, 1150);
    setTimeout(() => { salamBusy = false; }, 2700);
  }
  function tryTalk() {
    if (!nearVendor || dialogOpen || won) return;
    sfx.unlock(); sfx.talk();
    q('.kq-text').textContent = nearVendor.clue; dialog.hidden = false; dialogOpen = true;
    if (!nearVendor.spoken) { nearVendor.spoken = true; let n = 0; for (const it of items) if (!it.taken && it.hidden && !it.beam.visible) { it.beam.visible = true; n++; } if (n) { sfx.clue(); showBanner('A clue! Hidden baskets revealed ✨'); } }
  }

  // ---- mission state -----------------------------------------------------
  let collected = 0, elapsed = 0, won = false, ended = false, stun = 0, bikeHits = 0, running = true, raf = 0;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function collect(it) { it.taken = true; it.g.visible = false; collected++; elNum.textContent = collected; sfx.pickup(); showBanner(collected >= TOTAL ? 'All baskets! Head to the waterfront ⛵' : `Basket ${collected}/${TOTAL}!`); }
  function collide(p) {
    for (const s of solids) { const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + PLAYER_R; if (d < min && d > 1e-4) { p.x = s.x + dx / d * min; p.z = s.z + dz / d * min; } }
    for (const pd of peds) if (pd.blocking) { const dx = p.x - pd.x, dz = p.z - pd.z, d = Math.hypot(dx, dz), min = 0.85 + PLAYER_R; if (d < min && d > 1e-4) { p.x = pd.x + dx / d * min; p.z = pd.z + dz / d * min; } }
  }
  function clampWalk(p) { if (WALK.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1)) return; let best = null, bd = Infinity; for (const r of WALK) { const cx = clamp(p.x, r.x0, r.x1), cz = clamp(p.z, r.z0, r.z1); const d = (cx - p.x) ** 2 + (cz - p.z) ** 2; if (d < bd) { bd = d; best = { x: cx, z: cz }; } } p.x = best.x; p.z = best.z; }

  function finishWin() { if (won) return; won = true; sfx.win(); showBanner('SAMPAI! ⛵ All baskets delivered!', 1600); setTimeout(() => endMission(true), 1500); }
  function endMission(win, quit = false) {
    if (ended) return; ended = true;
    let stars = 0; if (win) { stars = 1; if (elapsed / 60 <= PAR_MIN) stars++; if (bikeHits === 0) stars++; }
    cleanup();
    onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit });
  }
  function cleanup() {
    running = false; cancelAnimationFrame(raf);
    removeEventListener('mousemove', onMM); removeEventListener('mouseup', onMU); removeEventListener('wheel', onWheel);
    removeEventListener('keydown', onKD); removeEventListener('keyup', onKU); removeEventListener('resize', onResize);
    renderer.dispose(); renderer.forceContextLoss?.();
    overlay.remove();
  }

  // ---- loop --------------------------------------------------------------
  const clock = new THREE.Clock();
  let stepAcc = 0;
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    if (!won) elapsed += dt;
    const tnow = clock.elapsedTime;
    let ix = stick.dx, iy = stick.dy;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (keys.has('w') || keys.has('arrowup')) iy -= 1; if (keys.has('s') || keys.has('arrowdown')) iy += 1;
    const mag = Math.hypot(ix, iy); let moving = false;
    if (stun > 0) stun -= dt;
    if (mag > 0.05 && stun <= 0 && !dialogOpen && !won) {
      moving = true; const nx = ix / (mag > 1 ? mag : 1), ny = iy / (mag > 1 ? mag : 1);
      const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw), rightX = Math.cos(camYaw), rightZ = -Math.sin(camYaw);
      const mvX = rightX * nx + fwdX * ny, mvZ = rightZ * nx + fwdZ * ny, spd = 5.4;
      kid.position.x += mvX * spd * dt; kid.position.z += mvZ * spd * dt;
      collide(kid.position); clampWalk(kid.position);
      kid.rotation.y = Math.atan2(mvX, mvZ);
      stepAcc += dt; if (stepAcc > 0.28) { stepAcc = 0; sfx.footstep(); }
    }
    const sw = moving ? Math.sin(tnow * 11) : 0;
    if (legs[0]) { legs[0].rotation.x = sw * 0.6; legs[1].rotation.x = -sw * 0.6; }
    if (arms[0]) { arms[0].rotation.x = -sw * 0.5; arms[1].rotation.x = sw * 0.5; }
    kid.position.y = DECK_Y + (moving ? Math.abs(Math.sin(tnow * 11)) * 0.04 : 0);

    for (const it of items) { if (it.taken) continue; it.g.rotation.y += dt * 1.4; it.g.position.y = DECK_Y + 0.7 + Math.sin(tnow * 2 + it.x) * 0.08; if (it.beam) it.beam.material.opacity = 0.22 + Math.sin(tnow * 4) * 0.12; if (Math.hypot(kid.position.x - it.x, kid.position.z - it.z) < 1.0) collect(it); }

    nearVendor = null; let nd = 2.6;
    for (const v of vendors) { const d = Math.hypot(kid.position.x - v.x, kid.position.z - v.z); if (d < nd) { nd = d; nearVendor = v; } }
    talkBtn.hidden = !nearVendor || dialogOpen || won;

    for (const bk of bikes) {
      bk.x += bk.dir * bk.speed * dt;
      if (bk.x > bk.x1) { bk.x = bk.x1; bk.dir = -1; } if (bk.x < bk.x0) { bk.x = bk.x0; bk.dir = 1; }
      bk.g.position.set(bk.x, DECK_Y, bk.z); bk.g.rotation.y = bk.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      bk.g.traverse((o) => { if (o._spin) o.rotation.x += bk.speed * dt; });
      const d = Math.hypot(kid.position.x - bk.x, kid.position.z - bk.z);
      bk.bellCd -= dt; if (d < 3 && bk.bellCd <= 0) { bk.bellCd = 1.4; sfx.bell(); }
      if (d < 1.1 && stun <= 0) { const a = Math.atan2(kid.position.z - bk.z, kid.position.x - bk.x); kid.position.x += Math.cos(a) * 1.6; kid.position.z += Math.sin(a) * 1.6; collide(kid.position); clampWalk(kid.position); stun = 0.5; bikeHits++; sfx.bump(); showBanner('Awas! A bicycle! 🚲', 1200); }
    }

    // proximity salam — greet whoever you come near (no tap); blockers step aside
    if (!salamBusy && !dialogOpen && !won) {
      for (const g of greetables) {
        if (g.greeted) continue;
        if (Math.hypot(kid.position.x - g.x, kid.position.z - g.z) < 3) {
          g.greeted = true; saySalam();
          if (g.ped) { g.ped.blocking = false; g.ped.stepping = true; showBanner('🙏 Silakan lalu — please pass', 1800); }
          break;
        }
      }
    }
    // blocking folk: bob, and slide aside once greeted
    for (const pd of peds) {
      pd.bob += dt * 3;
      if (pd.stepping) { pd.group.position.x += (pd.ax - pd.group.position.x) * Math.min(1, dt * 3); pd.group.position.z += (pd.az - pd.group.position.z) * Math.min(1, dt * 3); if (Math.hypot(pd.ax - pd.group.position.x, pd.az - pd.group.position.z) < 0.05) pd.stepping = false; }
      pd.group.position.y = DECK_Y + Math.sin(pd.bob) * 0.015;
    }
    // kids running their little circuits
    for (const k of kids) {
      k.t -= dt; if (k.t <= 0) { k.t = rand(1, 3); k.tx = k.hx + rand(-3.5, 3.5); k.tz = k.hz + rand(-3.5, 3.5); }
      const dx = k.tx - k.group.position.x, dz = k.tz - k.group.position.z, d = Math.hypot(dx, dz); let mv = false;
      if (d > 0.25) { mv = true; k.group.position.x += dx / d * k.spd * dt; k.group.position.z += dz / d * k.spd * dt; k.group.rotation.y = Math.atan2(dx, dz); }
      clampWalk(k.group.position);
      const ksw = mv ? Math.sin(tnow * 12 + k.ph) : 0; if (k.legs[0]) { k.legs[0].rotation.x = ksw * 0.7; k.legs[1].rotation.x = -ksw * 0.7; }
      k.group.position.y = DECK_Y + (mv ? Math.abs(Math.sin(tnow * 12 + k.ph)) * 0.05 : 0);
    }
    // cats wandering, the occasional meow
    for (const c of cats) {
      c.t -= dt; if (c.t <= 0) { c.t = rand(2, 5); c.tx = c.hx + rand(-3, 3); c.tz = c.hz + rand(-3, 3); }
      const dx = c.tx - c.group.position.x, dz = c.tz - c.group.position.z, d = Math.hypot(dx, dz);
      if (d > 0.2) { c.group.position.x += dx / d * c.spd * dt; c.group.position.z += dz / d * c.spd * dt; c.group.rotation.y = Math.atan2(dx, dz); }
      clampWalk(c.group.position);
      c.meowCd -= dt; if (c.meowCd <= 0) { c.meowCd = rand(7, 16); if (Math.hypot(kid.position.x - c.group.position.x, kid.position.z - c.group.position.z) < 10) sfx.meow(); }
    }

    if (!won && collected >= TOTAL && kid.position.z < NORTH.z0 + 5) finishWin();
    elTime.textContent = fmt(elapsed);
    updateCamera(false);
    if (stick.id === null) joy.style.opacity = '0'; else { joy.style.opacity = '1'; joy.style.left = stick.ox + 'px'; joy.style.top = stick.oy + 'px'; joy.style.setProperty('--kx', stick.dx * MAXR + 'px'); joy.style.setProperty('--ky', stick.dy * MAXR + 'px'); }
    renderer.render(scene, camera);
  }
  function loop() { if (!running) return; try { tick(); } catch (e) { console.error(e); } raf = requestAnimationFrame(loop); }
  loop();
  showBanner('Selamat datang — Welcome to Kampong Ayer! Find the 5 baskets.', 3200);

  // test/debug hook
  window.__kampong = {
    state: () => ({ collected, total: TOTAL, won, ended, x: +kid.position.x.toFixed(2), z: +kid.position.z.toFixed(2), nearVendor: !!nearVendor, dialogOpen, bikeHits, items: items.map((i) => ({ taken: i.taken, beam: i.beam.visible })) }),
    teleport: (x, z) => { kid.position.x = x; kid.position.z = z; updateCamera(true); },
    talk: () => { nearVendor = vendors.find((v) => !v.spoken) || vendors[0]; tryTalk(); },
    collectAll: () => items.forEach((i) => { if (!i.taken) collect(i); }),
    npcs: () => ({ bikes: bikes.length, kids: kids.length, cats: cats.length, peds: peds.length, blocking: peds.filter((p) => p.blocking).length, greeted: greetables.filter((g) => g.greeted).length }),
    yaw: (y) => { camYaw = y; }, pitch: (p) => { camPitch = p; }, dist: (d) => { camDist = d; updateCamera(true); },
  };
  return overlay;
}
