// Skirmish at the Tamu — a vertical PLATFORM-CLIMBER (Doodle-Jump style).
//
// Your trader auto-bounces up a tower of floating market-garden platforms;
// steer left/right (the screen wraps), scoop coins, grab balloons for a big
// boost, and climb to the Tamu banner at the top to win. Fall off the bottom
// and the run ends. Self-contained 2D canvas; plugs into the campaign reward
// loop via onResult({ win, stars, minutes }).

const PAL = {
  sky0: '#bfe9f5', sky1: '#dff3e8', sky2: '#a9dcc4',
  rock: '#5b6e63', rockDk: '#41524a', grass: '#6fc05a', grassDk: '#4f9a3f', dirt: '#a9743a', dirtDk: '#7c5026',
  ink: '#16384c', gold: '#e7b53c', shirt: '#d6584e', skin: '#e9b58a',
};

export function showClimb(audio, { mission, onResult } = {}) {
  const cfg = mission?.climb || {};
  const GOAL = cfg.goal || 3600;        // world height to reach (win)
  const COIN_STAR = cfg.coins || 30;    // coins for the 2nd star
  const PAR_MIN = cfg.par || 1.5;
  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- overlay + canvas --------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay climb';
  overlay.innerHTML =
    `<canvas class="cl-canvas"></canvas>` +
    `<button class="cl-quit" aria-label="Quit">‹</button>` +
    `<div class="cl-hud"><span class="cl-coin">🪙 <b id="cl-c">0</b></span><span class="cl-h">⛰ <b id="cl-hm">0</b>m</span></div>` +
    `<div class="cl-prog"><span id="cl-pf"></span></div>` +
    `<button class="cl-left" aria-label="Left">‹</button>` +
    `<button class="cl-right" aria-label="Right">›</button>` +
    `<div class="cl-toast"></div>`;
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('.cl-canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = overlay.querySelector('.cl-toast');
  const elCoin = overlay.querySelector('#cl-c'), elH = overlay.querySelector('#cl-hm'), progFill = overlay.querySelector('#cl-pf');
  overlay.querySelector('.cl-quit').onclick = () => { audio?.play?.('ui_click'); finish(false, true); };

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1); W = overlay.clientWidth; H = overlay.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize(); addEventListener('resize', resize);

  // ---- state -------------------------------------------------------------
  const GRAV = -1500, JUMP = 760, MOVE = 330;
  const player = { x: W / 2, y: 60, vy: 0, vx: 0, w: 30, h: 40, face: 1 };
  const plats = [], coins = [], balloons = [], fx = [];
  let camY = 0, topGen = 0, maxY = 0, coinN = 0;
  let started = now(), elapsed = 0, running = true, ended = false, paused = false, dir = 0;

  // seed a wide starting platform under the player, then fill upward
  plats.push({ x: W / 2, y: 30, w: 120, kind: 'normal', vx: 0 });
  topGen = 30;
  while (topGen < GOAL + H) addPlatformRow();
  function addPlatformRow() {
    topGen += rand(78, 124);
    const w = rand(70, 110);
    const x = rand(w / 2 + 8, W - w / 2 - 8);
    let kind = 'normal';
    const climbed = topGen / GOAL;
    const roll = Math.random();
    if (climbed > 0.25 && roll > 0.82) kind = 'move';
    else if (climbed > 0.45 && roll > 0.86) kind = 'break';
    plats.push({ x, y: topGen, w, kind, vx: kind === 'move' ? (Math.random() < 0.5 ? -1 : 1) * rand(60, 110) : 0, broken: false });
    if (Math.random() < 0.4) coins.push({ x: x + rand(-20, 20), y: topGen + rand(26, 46), got: false });
    if (Math.random() < 0.07) balloons.push({ x: rand(40, W - 40), y: topGen + rand(40, 90), got: false, bob: rand(0, 6.28) });
  }
  // goal banner platform at the top
  plats.push({ x: W / 2, y: GOAL, w: 160, kind: 'goal', vx: 0 });

  // ---- input -------------------------------------------------------------
  const keys = new Set();
  const onKD = (e) => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') { keys.add('l'); e.preventDefault(); } else if (k === 'd' || k === 'arrowright') { keys.add('r'); e.preventDefault(); } else if (k === 'p' || k === 'escape') paused = !paused; };
  const onKU = (e) => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') keys.delete('l'); else if (k === 'd' || k === 'arrowright') keys.delete('r'); };
  addEventListener('keydown', onKD); addEventListener('keyup', onKU);
  const hold = (sel, d) => { const el = overlay.querySelector(sel); const set = (v) => (e) => { dir = v; e.preventDefault(); }; el.addEventListener('touchstart', set(d), { passive: false }); el.addEventListener('mousedown', set(d)); el.addEventListener('touchend', set(0), { passive: false }); el.addEventListener('mouseup', set(0)); el.addEventListener('mouseleave', set(0)); el.addEventListener('touchcancel', set(0), { passive: false }); };
  hold('.cl-left', -1); hold('.cl-right', 1);
  // also let taps on the left/right half of the canvas steer
  canvas.addEventListener('touchstart', (e) => { dir = e.changedTouches[0].clientX < W / 2 ? -1 : 1; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', () => { dir = 0; }, { passive: false });
  canvas.addEventListener('mousedown', (e) => { dir = e.clientX < W / 2 ? -1 : 1; });
  addEventListener('mouseup', () => { dir = 0; });

  function toast(m, ms = 1200) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms); }
  const scrY = (wy) => H - (wy - camY);   // world-y (up) → screen-y (down)

  // ---- step --------------------------------------------------------------
  function step(dt) {
    elapsed = (now() - started) / 1000;
    // horizontal
    let mv = dir; if (keys.has('l')) mv -= 1; if (keys.has('r')) mv += 1;
    player.vx = mv * MOVE; if (mv) player.face = mv > 0 ? 1 : -1;
    player.x += player.vx * dt;
    if (player.x < -10) player.x = W + 10; else if (player.x > W + 10) player.x = -10;   // wrap
    // vertical
    player.vy += GRAV * dt; player.y += player.vy * dt;
    // platforms move
    for (const p of plats) { if (p.vx) { p.x += p.vx * dt; if (p.x < p.w / 2 + 6) { p.x = p.w / 2 + 6; p.vx *= -1; } if (p.x > W - p.w / 2 - 6) { p.x = W - p.w / 2 - 6; p.vx *= -1; } } }
    // bounce: falling and feet cross a platform top
    if (player.vy < 0) {
      const feetPrev = player.y - player.vy * dt;   // last frame's foot height (approx)
      for (const p of plats) {
        if (p.broken) continue;
        if (Math.abs(player.x - p.x) < p.w / 2 + 6 && player.y <= p.y + 6 && feetPrev >= p.y - 2) {
          player.vy = JUMP * (p.kind === 'goal' ? 0.6 : 1); player.y = p.y + 6;
          audio?.play?.('move_order', { rateLimitMs: 60 });
          puff(player.x, p.y);
          if (p.kind === 'break') { p.broken = true; setTimeout(() => { }, 0); }
          if (p.kind === 'goal') { /* reached the top platform */ }
          break;
        }
      }
    }
    // camera follows upward only
    const want = player.y - H * 0.45;
    if (want > camY) camY = want;
    maxY = Math.max(maxY, player.y);
    // generate more platforms above as needed
    while (topGen < camY + H + 200 && topGen < GOAL) addPlatformRow();
    // cull below screen
    for (let i = plats.length - 1; i >= 0; i--) if (plats[i].y < camY - 60) plats.splice(i, 1);

    // coins
    for (const c of coins) { if (c.got) continue; if (Math.abs(player.x - c.x) < 26 && Math.abs(player.y - c.y) < 30) { c.got = true; coinN++; elCoin.textContent = coinN; audio?.play?.('train_done', { rateLimitMs: 50 }); coinFx(c.x, c.y); } }
    // balloons → big boost
    for (const bal of balloons) { if (bal.got) continue; bal.bob += dt * 3; if (Math.abs(player.x - bal.x) < 30 && Math.abs(player.y - bal.y) < 34) { bal.got = true; player.vy = JUMP * 2.1; audio?.play?.('era_up'); toast('Balloon boost! 🎈', 900); puff(bal.x, bal.y); } }
    // fx
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 200 * dt; f.life -= dt; if (f.life <= 0) fx.splice(i, 1); }

    // HUD
    elH.textContent = Math.floor(maxY / 20);
    progFill.style.width = Math.min(100, (maxY / GOAL) * 100) + '%';

    // win / lose
    if (maxY >= GOAL) finish(true);
    else if (scrY(player.y) > H + 40) finish(false);   // fell off the bottom
  }
  function puff(x, y) { for (let i = 0; i < 6; i++) fx.push({ x, y, vx: rand(-60, 60), vy: rand(-20, 40), life: 0.4, max: 0.4, c: 'rgba(255,255,255,0.8)', r: rand(2, 4) }); }
  function coinFx(x, y) { for (let i = 0; i < 8; i++) fx.push({ x, y, vx: rand(-90, 90), vy: rand(-120, -20), life: 0.5, max: 0.5, c: PAL.gold, r: rand(2, 4) }); }

  // ---- render ------------------------------------------------------------
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.sky0); g.addColorStop(0.55, PAL.sky1); g.addColorStop(1, PAL.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // parallax clouds (tied to camY)
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 6; i++) { const cy = (i * 240 - (camY * 0.3) % 240 + 1440) % (H + 240) - 120; const cx = (i * 137) % W; cloud(cx, cy, 40 + (i % 3) * 16); }
    // canyon walls
    rockWall(0); rockWall(1);
    // platforms
    for (const p of plats) drawPlat(p);
    // coins
    for (const c of coins) if (!c.got) coin(c.x, scrY(c.y));
    // balloons
    for (const bal of balloons) if (!bal.got) balloon(bal.x + Math.sin(bal.bob) * 4, scrY(bal.y));
    // player
    drawPlayer();
    // fx
    for (const f of fx) { ctx.globalAlpha = Math.max(0, f.life / f.max); ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, scrY(f.y), f.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    if (paused) { ctx.fillStyle = 'rgba(15,40,60,0.5)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui'; ctx.fillText('Paused', W / 2, H / 2); ctx.textAlign = 'left'; }
  }
  function cloud(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r, y + 6, r * 0.8, 0, 7); ctx.arc(x - r * 0.8, y + 8, r * 0.7, 0, 7); ctx.fill(); }
  function rockWall(right) {
    const ww = 26; ctx.save(); if (right) ctx.translate(W, 0), ctx.scale(-1, 1);
    ctx.fillStyle = PAL.rock; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ww, 0);
    for (let y = 0; y <= H; y += 40) ctx.lineTo(ww + (((y + (camY | 0)) % 80 < 40) ? 8 : -4), y);
    ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawPlat(p) {
    const sy = scrY(p.y); if (sy < -40 || sy > H + 40) return;
    if (p.kind === 'goal') {
      ctx.fillStyle = '#caa46a'; ctx.fillRect(p.x - p.w / 2, sy, p.w, 12);
      ctx.fillStyle = '#2f7f78'; ctx.fillRect(p.x - p.w / 2, sy - 34, p.w, 26);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TAMU 🎏', p.x, sy - 20); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      return;
    }
    const broken = p.broken; ctx.globalAlpha = broken ? 0.35 : 1;
    ctx.fillStyle = p.kind === 'break' ? '#b7a98c' : PAL.dirtDk; ctx.beginPath(); ctx.ellipse(p.x, sy + 6, p.w / 2, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = p.kind === 'break' ? '#cabfa0' : PAL.grass; ctx.beginPath(); ctx.ellipse(p.x, sy, p.w / 2, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = p.kind === 'break' ? '#b3a78a' : PAL.grassDk; for (let i = -2; i <= 2; i++) { ctx.fillRect(p.x + i * (p.w / 6) - 1, sy - 6, 2, 5); }
    if (p.kind === 'move') { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 6, sy - 11); ctx.lineTo(p.x + 6, sy - 11); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function coin(x, sy) { ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(x, sy, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff7d0'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', x, sy + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  function balloon(x, sy) { ctx.strokeStyle = 'rgba(60,60,60,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, sy + 14); ctx.lineTo(x, sy + 30); ctx.stroke(); ctx.fillStyle = '#e23b4e'; ctx.beginPath(); ctx.ellipse(x, sy, 14, 17, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - 4, sy - 5, 4, 6, 0, 0, 7); ctx.fill(); }
  function drawPlayer() {
    const x = player.x, sy = scrY(player.y) - 6;
    // squash on the way up vs down
    const stretch = player.vy > 0 ? 1.08 : 0.95;
    ctx.save(); ctx.translate(x, sy); ctx.scale(player.face, 1);
    // legs
    ctx.fillStyle = '#3a4654'; ctx.fillRect(-9, -2, 7, 12); ctx.fillRect(3, -2, 7, 12);
    // body (shirt)
    ctx.fillStyle = PAL.shirt; roundRect(-13, -28 * stretch, 26, 28 * stretch, 7); ctx.fill();
    // head
    ctx.fillStyle = PAL.skin; ctx.beginPath(); ctx.arc(2, -34 * stretch, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#35251c'; ctx.beginPath(); ctx.arc(2, -38 * stretch, 11, Math.PI, 0); ctx.fill();   // hair
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---- loop --------------------------------------------------------------
  let last = now(), raf = 0;
  function loop() { if (!running) return; const t = now(); let dt = Math.min(0.05, (t - last) / 1000); last = t; if (!paused && !ended) step(dt); draw(); raf = requestAnimationFrame(loop); }
  // give the player an initial hop so they start climbing
  player.vy = JUMP;
  loop();
  toast('Hold left / right to steer — bounce up to the Tamu!', 2600);

  // ---- finish ------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false; cancelAnimationFrame(raf);
    let stars = 0; if (win) { stars = 1; if (coinN >= COIN_STAR) stars++; if (elapsed / 60 <= PAR_MIN) stars++; }
    audio?.play?.(win ? 'victory' : 'defeat');
    cleanup();
    onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit });
  }
  function cleanup() { removeEventListener('resize', resize); removeEventListener('keydown', onKD); removeEventListener('keyup', onKU); removeEventListener('mouseup', () => { }); overlay.remove(); }

  // debug/test hook
  window.__climb = {
    state: () => ({ height: Math.floor(maxY / 20), coins: coinN, goalH: GOAL, maxY: Math.round(maxY), ended, won: maxY >= GOAL }),
    boost: () => { player.vy = JUMP * 3; }, addCoins: (n) => { coinN += n; elCoin.textContent = coinN; },
    forceWin: () => finish(true), forceLose: () => finish(false),
  };
  return overlay;
}
