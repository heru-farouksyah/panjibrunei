// Skirmish at the Tamu — a 3D vertical PLATFORM-CLIMBER (cel-shaded Three.js).
//
// Your trader (in traditional Bruneian dress — songkok, baju melayu, gold
// songket sampin) auto-bounces up a tower of floating market-garden platforms.
// Steer left/right (the tower wraps), scoop coins, grab balloons for a big
// boost, and reach the Tamu banner at the top. Fall off the bottom and the run
// ends. Plays in 2.5D (action on one plane) but rendered in full 3D with depth,
// lighting and shadows. Upbeat procedural music. Plugs into the campaign loop.

import * as THREE from 'three';
import { RAMP, toon, place, canvasTex, skyDome } from './toonkit.js';
import { Audio as KAudio } from './kampongAudio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function showClimb(audio, { mission, onResult } = {}) {
  const cfg = mission?.climb || {};
  const GOAL = cfg.goalY || 92;          // world height (Y) to reach
  const COIN_STAR = cfg.coins || 20;
  const PAR_MIN = cfg.par || 1.6;
  const X = 9;                            // half-width of the tower (wraps)
  const rand = (a, b) => a + Math.random() * (b - a);
  const sfx = new KAudio();

  // ---- overlay + renderer ------------------------------------------------
  const overlay = document.createElement('div'); overlay.className = 'screen-overlay climb'; document.body.appendChild(overlay);
  overlay.innerHTML =
    `<button class="cl-quit" aria-label="Quit">‹</button>` +
    `<div class="cl-hud"><span class="cl-coin">🪙 <b id="cl-c">0</b></span><span class="cl-h">⛰ <b id="cl-hm">0</b>m</span></div>` +
    `<div class="cl-prog"><span id="cl-pf"></span></div>` +
    `<button class="cl-left" aria-label="Left">‹</button><button class="cl-right" aria-label="Right">›</button>` +
    `<div class="cl-toast"></div>`;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'cl-canvas'; overlay.appendChild(renderer.domElement);
  const elC = overlay.querySelector('#cl-c'), elH = overlay.querySelector('#cl-hm'), progFill = overlay.querySelector('#cl-pf'), toastEl = overlay.querySelector('.cl-toast');
  overlay.querySelector('.cl-quit').onclick = () => { sfx.unlock(); finish(false, true); };

  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9fdcc4, 40, 110);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.2); sun.position.set(-8, 18, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 30; sc.bottom = -30; sun.shadow.bias = -0.0005;
  scene.add(sun, new THREE.HemisphereLight(0xdff3e8, 0x6f9a86, 1.0), new THREE.AmbientLight(0xcfeede, 0.3));
  const sky = skyDome(); scene.add(sky);

  function resize() { renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize);

  // ---- traditional-dress climber -----------------------------------------
  const songket = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3a1f2a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(217,178,74,0.7)'; g.lineWidth = 2; for (let i = -w; i < w; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } g.fillStyle = '#e8c75a'; for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); } });
  const climber = new THREE.Group(); scene.add(climber);
  const legs = [];
  for (const s of [-1, 1]) { const leg = toon(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), 0x16554a, { thickness: 0.03 }); place(leg, s * 0.15, 0.45, 0); climber.add(leg); legs.push(leg); }
  const torso = toon(new THREE.CapsuleGeometry(0.28, 0.55, 6, 12), 0x1f6f5a, { thickness: 0.035 }); place(torso, 0, 1.12, 0); climber.add(torso);
  const armL = toon(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), 0x1f6f5a, { thickness: 0.03 }); place(armL, -0.34, 1.12, 0); climber.add(armL);
  const armR = toon(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), 0x1f6f5a, { thickness: 0.03 }); place(armR, 0.34, 1.12, 0); climber.add(armR);
  const sampin = toon(new THREE.CylinderGeometry(0.32, 0.37, 0.46, 16), 0xb08820, { thickness: 0.025, map: songket }); place(sampin, 0, 0.82, 0); climber.add(sampin);
  const head = toon(new THREE.SphereGeometry(0.25, 16, 14), 0xe9b58a, { thickness: 0.03 }); place(head, 0, 1.56, 0); climber.add(head);
  const songkok = toon(new THREE.CylinderGeometry(0.25, 0.27, 0.28, 16), 0x14140f, { thickness: 0.025 }); place(songkok, 0, 1.74, 0); climber.add(songkok);
  climber.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---- platforms / coins / balloons --------------------------------------
  const plats = [], coins = [], balloons = [];
  function platMesh(kind) {
    const g = new THREE.Group();
    const grass = toon(new THREE.CylinderGeometry(1.6, 1.45, 0.4, 16), kind === 'break' ? 0xcabfa0 : 0x6fc05a, { thickness: 0.04 }); g.add(grass);
    const dirt = toon(new THREE.CylinderGeometry(1.45, 1.0, 0.8, 16), kind === 'break' ? 0xa9966f : 0xa9743a, { thickness: 0.04 }); place(dirt, 0, -0.55, 0); g.add(dirt);
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    if (kind === 'move') { const m = toon(new THREE.SphereGeometry(0.18, 8, 7), 0xffffff, { thickness: 0.02 }); place(m, 0, 0.3, 0); g.add(m); }
    return g;
  }
  function addPlat(x, y, kind) { const g = platMesh(kind); g.position.set(x, y, 0); scene.add(g); plats.push({ g, x, y, r: 1.6, kind, vx: kind === 'move' ? (Math.random() < 0.5 ? -1 : 1) * rand(2, 3.4) : 0, broken: false }); return plats[plats.length - 1]; }
  function addCoin(x, y) { const g = new THREE.Group(); const c = toon(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14), 0xe7b53c, { thickness: 0.02 }); c.rotation.x = Math.PI / 2; g.add(c); g.position.set(x, y, 0); scene.add(g); coins.push({ g, x, y, got: false }); }
  function addBalloon(x, y) { const g = new THREE.Group(); const b = toon(new THREE.SphereGeometry(0.5, 14, 12), 0xe23b4e, { thickness: 0.03 }); b.scale.set(1, 1.2, 1); g.add(b); const str = toon(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), 0x444, { outline: false }); place(str, 0, -0.7, 0); g.add(str); g.position.set(x, y, 0); scene.add(g); balloons.push({ g, x, y, got: false, bob: rand(0, 6.28) }); }

  // build the tower
  addPlat(0, 0, 'normal');
  let topY = 0;
  while (topY < GOAL) {
    topY += rand(2.6, 4.2);
    const x = rand(-X + 1, X - 1); const climbed = topY / GOAL; const roll = Math.random();
    const kind = climbed > 0.45 && roll > 0.85 ? 'break' : climbed > 0.2 && roll > 0.78 ? 'move' : 'normal';
    addPlat(x, topY, kind);
    if (Math.random() < 0.4) addCoin(x + rand(-1, 1), topY + rand(1, 2));
    if (Math.random() < 0.08) addBalloon(rand(-X + 1, X - 1), topY + rand(1.5, 3));
  }
  // Tamu banner platform at the top (the goal)
  const goalP = addPlat(0, GOAL, 'normal'); goalP.r = 2.2; goalP.g.scale.set(1.4, 1, 1.4);
  const banner = toon(new THREE.BoxGeometry(3.4, 0.8, 0.12), 0x2f7f78, { thickness: 0.03, map: canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#2f7f78'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `bold ${h * 0.5}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAMU', w / 2, h / 2); }) });
  place(banner, 0, GOAL + 1.6, 0); scene.add(banner);

  // ---- physics + state ---------------------------------------------------
  const GRAV = -42, JUMP = 20.5, MOVE = 11;
  const player = { x: 0, y: 1, vy: JUMP, vx: 0, face: 1 };
  let camY = 6, maxY = 0, coinN = 0, dir = 0, started = 0, elapsed = 0, running = true, ended = false, won = false, raf = 0;

  // ---- input -------------------------------------------------------------
  const keys = new Set();
  const onKD = (e) => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') { keys.add('l'); sfx.unlock(); } else if (k === 'd' || k === 'arrowright') { keys.add('r'); sfx.unlock(); } };
  const onKU = (e) => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') keys.delete('l'); else if (k === 'd' || k === 'arrowright') keys.delete('r'); };
  addEventListener('keydown', onKD); addEventListener('keyup', onKU);
  const hold = (sel, d) => { const el = overlay.querySelector(sel); const set = (v) => (e) => { dir = v; sfx.unlock(); e.preventDefault(); }; el.addEventListener('touchstart', set(d), { passive: false }); el.addEventListener('mousedown', set(d)); el.addEventListener('touchend', set(0), { passive: false }); el.addEventListener('mouseup', set(0)); el.addEventListener('mouseleave', set(0)); el.addEventListener('touchcancel', set(0), { passive: false }); };
  hold('.cl-left', -1); hold('.cl-right', 1);
  const cv = renderer.domElement;
  cv.addEventListener('touchstart', (e) => { dir = e.changedTouches[0].clientX < innerWidth / 2 ? -1 : 1; sfx.unlock(); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', () => { dir = 0; }, { passive: false });
  cv.addEventListener('mousedown', (e) => { dir = e.clientX < innerWidth / 2 ? -1 : 1; sfx.unlock(); });
  const upClear = () => { dir = 0; }; addEventListener('mouseup', upClear);
  function toast(m, ms = 1200) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms); }

  // ---- loop --------------------------------------------------------------
  const clock = new THREE.Clock();
  function step(dt) {
    elapsed += dt;
    if (sfx.ready) sfx.music({ ambience: false });   // upbeat bed, no water in the sky
    let mv = dir; if (keys.has('l')) mv -= 1; if (keys.has('r')) mv += 1;
    player.vx = mv * MOVE; if (mv) player.face = mv > 0 ? 1 : -1;
    player.x += player.vx * dt;
    if (player.x < -X) player.x += 2 * X; else if (player.x > X) player.x -= 2 * X;   // wrap
    player.vy += GRAV * dt; player.y += player.vy * dt;
    // moving platforms
    for (const p of plats) if (p.vx) { p.x += p.vx * dt; if (p.x < -X + 1 || p.x > X - 1) p.vx *= -1; p.g.position.x = p.x; }
    // bounce on landing
    if (player.vy < 0) {
      const prev = player.y - player.vy * dt;
      for (const p of plats) {
        if (p.broken) continue;
        if (Math.abs(player.x - p.x) < p.r + 0.3 && player.y <= p.y + 0.4 && prev >= p.y + 0.1) {
          player.vy = JUMP * (p.kind === 'goal' ? 0.7 : 1); player.y = p.y + 0.4; sfx.hop();
          if (p.kind === 'break') { p.broken = true; p.g.visible = false; }
          break;
        }
      }
    }
    maxY = Math.max(maxY, player.y); camY = Math.max(camY, player.y + 4);
    // coins / balloons
    for (const c of coins) { if (c.got) continue; c.g.rotation.y += dt * 3; if (Math.abs(player.x - c.x) < 1 && Math.abs(player.y - c.y) < 1.1) { c.got = true; c.g.visible = false; coinN++; elC.textContent = coinN; sfx.pickup(); } }
    for (const bal of balloons) { if (bal.got) continue; bal.bob += dt * 3; bal.g.position.y = bal.y + Math.sin(bal.bob) * 0.2; if (Math.abs(player.x - bal.x) < 1.1 && Math.abs(player.y - bal.y) < 1.2) { bal.got = true; bal.g.visible = false; player.vy = JUMP * 2.1; sfx.win(); toast('Balloon boost! 🎈', 900); } }
    // win / lose
    if (maxY >= GOAL) finish(true);
    else if (player.y < camY - 13) finish(false);
    // present
    const sx = clamp(player.x, -X, X);
    climber.position.set(player.x, player.y, 0); climber.rotation.y = player.face > 0 ? 0.4 : -0.4;
    const sq = player.vy > 0 ? 1.06 : 0.96; climber.scale.set(1, sq, 1);
    legs[0].rotation.x = player.vy > 0 ? -0.5 : 0.3; legs[1].rotation.x = player.vy > 0 ? -0.5 : 0.3;
    camera.position.set(clamp(player.x * 0.25, -3, 3), camY + 1.5, 13); camera.lookAt(sx * 0.18, camY - 0.5, 0);
    sky.position.set(0, camY, 0);
    elH.textContent = Math.floor(maxY / 4); progFill.style.height = Math.min(100, (maxY / GOAL) * 100) + '%';
  }
  function loop() { if (!running) return; const dt = Math.min(0.05, clock.getDelta()); if (!ended) step(dt); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }
  started = performance.now(); loop();
  toast('Hold ‹ / › to steer — bounce up to the Tamu!', 2600);

  // ---- finish ------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false; cancelAnimationFrame(raf);
    let stars = 0; if (win) { stars = 1; if (coinN >= COIN_STAR) stars++; if (elapsed / 60 <= PAR_MIN) stars++; }
    sfx.stopMusic(); if (win) sfx.win(); else sfx.bump();
    cleanup(); onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit });
  }
  function cleanup() { removeEventListener('resize', resize); removeEventListener('keydown', onKD); removeEventListener('keyup', onKU); removeEventListener('mouseup', upClear); renderer.dispose(); renderer.forceContextLoss?.(); overlay.remove(); }

  // debug/test hook
  window.__climb = {
    state: () => ({ height: Math.floor(maxY / 4), coins: coinN, goalY: GOAL, maxY: +maxY.toFixed(1), y: +player.y.toFixed(1), ended, won: maxY >= GOAL }),
    boost: () => { player.vy = JUMP * 3; }, addCoins: (n) => { coinN += n; elC.textContent = coinN; },
    forceWin: () => finish(true), forceLose: () => finish(false),
  };
  return overlay;
}
