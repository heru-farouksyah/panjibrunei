// Kianggeh Stand — a cozy HARVEST-MOON-style farming mini-game.
//
// Top-down farm: walk up to a plot and tap the action button to do the right
// thing — hoe grass into soil, plant a seed, water it (refill your can at the
// well), then harvest the ripe crop. Fill the quota before the day ends. A
// chicken wanders the yard and lays eggs you can scoop up for bonus coins.
//
// Self-contained 2D canvas; plugs into the campaign reward loop via onResult().

import { Audio as KAudio } from './kampongAudio.js';

const PAL = {
  grass: '#8cc56a', grassDk: '#6fae4f', soil: '#7a5230', soilWet: '#553620',
  ink: '#2a3a20', gold: '#e7b53c', house: '#d9695a', roof: '#a33b32', barn: '#b06a3a',
  well: '#7f93a6', water: '#4fa6d0', fence: '#9a6b3a', skin: '#e9b58a', hat: '#e6c66a', shirt: '#3f8ad0',
};
const CROP_C = ['#7fb56a', '#5fa84a', '#3f9a3a', '#e0843a']; // stages: sprout → ripe (orange = ready)

export function showFarm(audio, { mission, onResult } = {}) {
  const cfg = mission?.farm || {};
  const QUOTA = cfg.quota || 8;       // crops to harvest to win
  const DAY = cfg.day || 210;         // seconds in the "day"
  const CAN_MAX = cfg.can || 6;
  const STAGE_T = 2.6;                // seconds per growth stage (when watered)
  const RIPE = 3;
  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- overlay + canvas --------------------------------------------------
  const overlay = document.createElement('div'); overlay.className = 'screen-overlay farm'; document.body.appendChild(overlay);
  overlay.innerHTML =
    `<canvas class="fm-canvas"></canvas>` +
    `<button class="fm-quit" aria-label="Quit">‹</button>` +
    `<div class="fm-hud"><span>🌾 <b id="fm-q">0</b>/${QUOTA}</span><span>🪙 <b id="fm-g">0</b></span><span>💧 <b id="fm-w">${CAN_MAX}</b></span><span>⏱ <b id="fm-t">0:00</b></span></div>` +
    `<div class="fm-joy"></div>` +
    `<button class="fm-act">✋</button>` +
    `<div class="fm-toast"></div>`;
  const canvas = overlay.querySelector('.fm-canvas');
  const ctx = canvas.getContext('2d');
  const elQ = overlay.querySelector('#fm-q'), elG = overlay.querySelector('#fm-g'), elW = overlay.querySelector('#fm-w'), elT = overlay.querySelector('#fm-t');
  const actBtn = overlay.querySelector('.fm-act'), toastEl = overlay.querySelector('.fm-toast'), joy = overlay.querySelector('.fm-joy');
  overlay.querySelector('.fm-quit').onclick = () => { bgm.unlock(); finish(false, true); };
  const bgm = new KAudio();
  const startBgm = () => { bgm.unlock(); bgm.music({ ambience: false }); };
  overlay.addEventListener('pointerdown', startBgm, { once: true });
  addEventListener('keydown', startBgm, { once: true });

  let W = 0, H = 0, DPR = 1, TS = 48, fox = 0, foy = 0; // field origin + tile size
  const COLS = 7, ROWS = 5;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1); W = overlay.clientWidth; H = overlay.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    TS = Math.min(Math.floor((W * 0.92) / COLS), Math.floor((H * 0.5) / ROWS), 64);
    fox = (W - COLS * TS) / 2; foy = H * 0.42;
  }
  resize(); addEventListener('resize', resize);

  // ---- world objects -----------------------------------------------------
  const field = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) field.push({ c, r, state: 'grass', stage: 0, watered: false, grow: 0, bob: rand(0, 6.28) });
  const tileAt = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS) ? field[r * COLS + c] : null;
  const tileCenter = (t) => ({ x: fox + (t.c + 0.5) * TS, y: foy + (t.r + 0.5) * TS });
  const well = () => ({ x: W * 0.84, y: H * 0.24, r: TS * 0.6 });
  const player = { x: 0, y: 0, dir: { x: 0, y: 1 } };
  function placePlayer() { player.x = W / 2; player.y = foy + ROWS * TS + TS * 0.6; }
  placePlayer();
  const chicken = { x: W * 0.22, y: H * 0.24, tx: W * 0.22, ty: H * 0.24, t: 0, layCd: rand(6, 12) };
  const eggs = [], fx = [];

  let gold = 0, harvested = 0, can = CAN_MAX, time = DAY, started = now(), elapsed = 0, running = true, ended = false, won = false;

  // ---- input -------------------------------------------------------------
  const keys = new Set(); const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 }; const MAXR = 58;
  const isLeft = (x) => x < W * 0.5;
  canvas.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) if (isLeft(t.clientX) && stick.id === null) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.dx = stick.dy = 0; } e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === stick.id) { let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const d = Math.hypot(dx, dy) || 1; if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; } stick.dx = dx / MAXR; stick.dy = dy / MAXR; } e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.id = null; stick.dx = stick.dy = 0; } e.preventDefault(); }, { passive: false });
  let md = false;
  canvas.addEventListener('mousedown', (e) => { md = true; stick.ox = e.clientX; stick.oy = e.clientY; });
  addEventListener('mousemove', (e) => { if (!md) return; let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy) || 1; if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; } stick.dx = dx / MAXR; stick.dy = dy / MAXR; });
  addEventListener('mouseup', () => { md = false; stick.dx = stick.dy = 0; });
  function onKD(e) { const k = e.key.toLowerCase(); if ('wasd'.includes(k) || k.startsWith('arrow')) keys.add(k); if (k === 'e' || k === ' ') act(); }
  function onKU(e) { keys.delete(e.key.toLowerCase()); }
  addEventListener('keydown', onKD); addEventListener('keyup', onKU);
  actBtn.onclick = act;
  function toast(m, ms = 1200) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms); }

  // ---- the faced tile + context action -----------------------------------
  function facedTile() { const tx = player.x + player.dir.x * TS * 0.7, ty = player.y + player.dir.y * TS * 0.7; const c = Math.floor((tx - fox) / TS), r = Math.floor((ty - foy) / TS); return tileAt(c, r); }
  function nearWell() { const w = well(); return Math.hypot(player.x - w.x, player.y - w.y) < w.r + 26; }
  function actionLabel() {
    if (nearWell() && can < CAN_MAX) return '💧 Fill can';
    const t = facedTile(); if (!t) return '—';
    if (t.state === 'grass') return '⛏ Till';
    if (t.state === 'soil') return '🌱 Plant';
    if (t.state === 'crop') return t.stage >= RIPE ? '🧺 Harvest' : (t.watered ? '… growing' : '💧 Water');
    return '—';
  }
  function act() {
    bgm.unlock();
    if (nearWell() && can < CAN_MAX) { can = CAN_MAX; elW.textContent = can; toast('Watering can filled! 💧'); audio?.play?.('train_done'); return; }
    const t = facedTile(); if (!t) return;
    if (t.state === 'grass') { t.state = 'soil'; audio?.play?.('chop', { rateLimitMs: 60 }); puff(t, '#8a6234'); }
    else if (t.state === 'soil') { t.state = 'crop'; t.stage = 0; t.watered = false; t.grow = 0; audio?.play?.('select'); puff(t, '#5fa84a'); }
    else if (t.state === 'crop') {
      if (t.stage >= RIPE) { t.state = 'soil'; t.stage = 0; harvested++; gold += 12; elQ.textContent = harvested; elG.textContent = gold; audio?.play?.('train_done'); pop(t, '+12'); if (harvested >= QUOTA) finish(true); }
      else if (!t.watered) { if (can > 0) { can--; elW.textContent = can; t.watered = true; audio?.play?.('dig', { rateLimitMs: 60 }); puff(t, '#4fa6d0'); } else toast('Watering can empty — fill it at the well'); }
      else toast('It’s growing — give it time 🌱');
    }
  }
  function puff(t, c) { const p = tileCenter(t); for (let i = 0; i < 6; i++) fx.push({ x: p.x, y: p.y, vx: rand(-50, 50), vy: rand(-60, -10), life: 0.5, max: 0.5, r: rand(2, 4), c, txt: null }); }
  function pop(t, txt) { const p = tileCenter(t); fx.push({ x: p.x, y: p.y - 10, vx: 0, vy: -36, life: 0.8, max: 0.8, txt, c: '#fff' }); }

  // ---- step --------------------------------------------------------------
  function step(dt) {
    elapsed = (now() - started) / 1000; time = Math.max(0, DAY - elapsed);
    // move
    let mx = stick.dx, my = stick.dy;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1; if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1; if (keys.has('s') || keys.has('arrowdown')) my += 1;
    const m = Math.hypot(mx, my); let moving = false;
    if (m > 0.05) { moving = true; const nx = mx / (m > 1 ? m : 1), ny = my / (m > 1 ? m : 1); const spd = 210; player.x = Math.max(20, Math.min(W - 20, player.x + nx * spd * dt)); player.y = Math.max(H * 0.12, Math.min(H - 40, player.y + ny * spd * dt)); if (Math.abs(nx) > Math.abs(ny)) player.dir = { x: Math.sign(nx), y: 0 }; else player.dir = { x: 0, y: Math.sign(ny) }; }
    player._bob = (player._bob || 0) + (moving ? dt * 10 : 0);
    // crops grow when watered
    for (const t of field) { if (t.state === 'crop' && t.watered && t.stage < RIPE) { t.grow += dt; if (t.grow >= STAGE_T) { t.grow = 0; t.stage++; } } if (t.state === 'crop') t.bob += dt * 2; }
    // chicken wanders, lays eggs
    chicken.t -= dt; if (chicken.t <= 0) { chicken.t = rand(2, 5); chicken.tx = rand(W * 0.1, W * 0.4); chicken.ty = rand(H * 0.15, H * 0.34); }
    { const dx = chicken.tx - chicken.x, dy = chicken.ty - chicken.y, d = Math.hypot(dx, dy); if (d > 2) { chicken.x += dx / d * 60 * dt; chicken.y += dy / d * 60 * dt; } }
    chicken.layCd -= dt; if (chicken.layCd <= 0) { chicken.layCd = rand(10, 18); eggs.push({ x: chicken.x, y: chicken.y + 6, bob: 0 }); }
    for (let i = eggs.length - 1; i >= 0; i--) { const e = eggs[i]; e.bob += dt * 4; if (Math.hypot(player.x - e.x, player.y - e.y) < 26) { eggs.splice(i, 1); gold += 8; elG.textContent = gold; audio?.play?.('train_done', { rateLimitMs: 60 }); toast('Fresh egg! +8 🪙', 900); } }
    // fx
    for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; p.x += (p.vx || 0) * dt; p.y += p.vy * dt; if (!p.txt) p.vy += 120 * dt; p.life -= dt; if (p.life <= 0) fx.splice(i, 1); }
    elT.textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    actBtn.textContent = actionLabel();
    if (time <= 0) finish(harvested >= QUOTA);
  }

  // ---- render ------------------------------------------------------------
  function draw() {
    ctx.fillStyle = PAL.grass; ctx.fillRect(0, 0, W, H);
    // grass speckle
    ctx.fillStyle = PAL.grassDk; for (let i = 0; i < 60; i++) { const x = (i * 97) % W, y = (i * 53) % H; ctx.fillRect(x, y, 3, 6); }
    // house + barn + trees + fence + well
    drawHouse(W * 0.16, H * 0.2); drawBarn(W * 0.5, H * 0.16);
    drawTree(W * 0.06, H * 0.46); drawTree(W * 0.95, H * 0.5);
    drawWell();
    // field tiles
    for (const t of field) drawTile(t);
    // field fence
    ctx.strokeStyle = PAL.fence; ctx.lineWidth = 4; ctx.strokeRect(fox - 6, foy - 6, COLS * TS + 12, ROWS * TS + 12);
    // eggs
    for (const e of eggs) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(e.x, e.y + Math.sin(e.bob) * 1.5, 8, 10, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#e0d8c0'; ctx.lineWidth = 1.5; ctx.stroke(); }
    drawChicken(chicken.x, chicken.y);
    // faced-tile highlight
    const ft = facedTile(); if (ft) { const p = tileCenter(ft); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.strokeRect(p.x - TS / 2 + 2, p.y - TS / 2 + 2, TS - 4, TS - 4); }
    drawPlayer();
    // fx
    for (const p of fx) { ctx.globalAlpha = Math.max(0, p.life / p.max); if (p.txt) { ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(20,40,20,0.6)'; ctx.lineWidth = 3; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.strokeText(p.txt, p.x, p.y); ctx.fillText(p.txt, p.x, p.y); } else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); } } ctx.globalAlpha = 1;
  }
  function drawTile(t) {
    const x = fox + t.c * TS, y = foy + t.r * TS;
    if (t.state === 'grass') { ctx.fillStyle = t.r % 2 === t.c % 2 ? PAL.grass : PAL.grassDk; ctx.fillRect(x, y, TS, TS); }
    else { ctx.fillStyle = (t.state === 'crop' && t.watered) ? PAL.soilWet : PAL.soil; ctx.fillRect(x + 1, y + 1, TS - 2, TS - 2); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2); }
    if (t.state === 'crop') {
      const cx = x + TS / 2, cy = y + TS / 2, s = TS * (0.18 + t.stage * 0.12), wob = Math.sin(t.bob) * 1.5;
      ctx.fillStyle = CROP_C[Math.min(t.stage, 3)];
      if (t.stage >= RIPE) { ctx.beginPath(); ctx.arc(cx + wob, cy - s * 0.4, s * 0.8, 0, 7); ctx.fill(); ctx.fillStyle = '#3f9a3a'; ctx.fillRect(cx - 1.5, cy - s * 0.4, 3, s); }
      else { ctx.fillRect(cx - 2, cy - s, 4, s); for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sx * s * 0.5 + wob, cy - s * 0.7, s * 0.4, s * 0.22, sx * 0.5, 0, 7); ctx.fill(); } }
    }
  }
  function drawPlayer() {
    const x = player.x, y = player.y, b = Math.abs(Math.sin(player._bob || 0)) * 2;
    ctx.fillStyle = 'rgba(20,40,20,0.2)'; ctx.beginPath(); ctx.ellipse(x, y + 14, 13, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = PAL.shirt; ctx.beginPath(); ctx.ellipse(x, y + 2 - b, 11, 13, 0, 0, 7); ctx.fill();      // body
    ctx.fillStyle = PAL.skin; ctx.beginPath(); ctx.arc(x, y - 12 - b, 8, 0, 7); ctx.fill();                   // head
    ctx.fillStyle = PAL.hat; ctx.beginPath(); ctx.ellipse(x, y - 15 - b, 13, 5, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, y - 17 - b, 6, Math.PI, 0); ctx.fill(); // straw hat
    // facing pip
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(x + player.dir.x * 6, y - 12 - b + player.dir.y * 4, 1.6, 0, 7); ctx.fill();
  }
  function drawChicken(x, y) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, 11, 9, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + 8, y - 6, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#e23b4e'; ctx.beginPath(); ctx.arc(x + 8, y - 11, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#e8a23a'; ctx.beginPath(); ctx.moveTo(x + 13, y - 6); ctx.lineTo(x + 19, y - 4); ctx.lineTo(x + 13, y - 2); ctx.fill(); }
  function drawHouse(x, y) { ctx.fillStyle = PAL.house; ctx.fillRect(x - 34, y - 10, 68, 46); ctx.fillStyle = PAL.roof; ctx.beginPath(); ctx.moveTo(x - 42, y - 10); ctx.lineTo(x, y - 40); ctx.lineTo(x + 42, y - 10); ctx.fill(); ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 8, y + 12, 16, 24); }
  function drawBarn(x, y) { ctx.fillStyle = PAL.barn; ctx.fillRect(x - 30, y - 6, 60, 40); ctx.fillStyle = '#8a4f2a'; ctx.beginPath(); ctx.moveTo(x - 36, y - 6); ctx.lineTo(x, y - 30); ctx.lineTo(x + 36, y - 6); ctx.fill(); ctx.fillStyle = '#f2efe2'; ctx.fillRect(x - 8, y + 10, 16, 24); }
  function drawTree(x, y) { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 4, y, 8, 22); ctx.fillStyle = '#4f9a3a'; for (const o of [[-10, -8], [10, -8], [0, -18], [0, -2]]) { ctx.beginPath(); ctx.arc(x + o[0], y + o[1], 14, 0, 7); ctx.fill(); } }
  function drawWell() { const w = well(); ctx.fillStyle = PAL.well; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill(); ctx.fillStyle = PAL.water; ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.62, 0, 7); ctx.fill(); ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.stroke(); ctx.fillStyle = '#6a4f30'; ctx.fillRect(w.x - w.r, w.y - w.r - 14, 4, 18); ctx.fillRect(w.x + w.r - 4, w.y - w.r - 14, 4, 18); ctx.fillRect(w.x - w.r, w.y - w.r - 16, w.r * 2, 5); }

  // ---- loop --------------------------------------------------------------
  function updateJoy() { if (stick.id === null && !md) { joy.style.opacity = '0'; return; } joy.style.opacity = '1'; joy.style.left = stick.ox + 'px'; joy.style.top = stick.oy + 'px'; joy.style.setProperty('--kx', stick.dx * MAXR + 'px'); joy.style.setProperty('--ky', stick.dy * MAXR + 'px'); }
  let last = now(), raf = 0;
  function loop() { if (!running) return; const t = now(); let dt = Math.min(0.05, (t - last) / 1000); last = t; if (!ended) step(dt); draw(); updateJoy(); raf = requestAnimationFrame(loop); }
  loop();
  toast('Hoe the soil, plant, water, harvest — fill the cart! 🌾', 2800);

  // ---- finish ------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false; cancelAnimationFrame(raf);
    let stars = 0; if (win) { stars = 1; if (harvested >= QUOTA + 4) stars++; if (time > DAY * 0.4) stars++; }
    bgm.stopMusic(); audio?.play?.(win ? 'victory' : 'defeat');
    cleanup(); onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit });
  }
  function cleanup() { removeEventListener('resize', resize); removeEventListener('keydown', onKD); removeEventListener('keyup', onKU); removeEventListener('keydown', startBgm); bgm.close(); overlay.remove(); }

  // debug/test hook
  window.__farm = {
    state: () => ({ harvested, quota: QUOTA, gold, can, time: Math.ceil(time), ended, won: harvested >= QUOTA, eggs: eggs.length }),
    tillAll: () => field.forEach((t) => { if (t.state === 'grass') t.state = 'soil'; }),
    harvestN: (n) => { for (let i = 0; i < n; i++) { harvested++; gold += 12; } elQ.textContent = harvested; elG.textContent = gold; if (harvested >= QUOTA) finish(true); },
    ripenAll: () => field.forEach((t) => { if (t.state === 'crop') { t.stage = RIPE; } }),
    forceWin: () => finish(true),
  };
  return overlay;
}
