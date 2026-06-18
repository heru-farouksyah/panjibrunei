// Kianggeh Stand — a lane TOWER-DEFENCE mini-game.
//
// A different game again: a Plants-vs-Zombies-style hold-the-line. Raiders
// march DOWN the lanes from the stream toward your kampong at the bottom; you
// spend gold to plant defenders in a grid. Ranged defenders shoot up their lane
// at incoming raiders; a raider that reaches a defender stops to hack it down
// first (so walls buy time), and any raider that crosses the bottom line wounds
// the kampong. Hold through every wave to win.
//
// Self-contained 2D canvas (own overlay, loop, arcade RNG). Plugs into the same
// campaign reward loop via onResult({ win, stars, minutes }).

const PAL = {
  grassTop: '#bfe3c4', grassMid: '#a7d6b4', bankWet: '#9ccbe0', water: '#7fb6d8',
  ink: '#1c3a4a', brass: '#c0851a', laneEven: 'rgba(255,255,255,0.05)', laneOdd: 'rgba(20,60,40,0.05)',
  foe: '#d6584e', foeDark: '#9c352d', gold: '#e7b53c',
};

// Defenders you can plant. atk=0 means a pure wall. gold>0 means an earner.
const TOWERS = {
  pondok:  { name: 'Pondok',  cost: 50,  hp: 120, glyph: '🏠', col: '#caa46a', income: 14, every: 4.2 },
  pemanah: { name: 'Pemanah', cost: 50,  hp: 90,  glyph: '🏹', col: '#5b8f4e', atk: 9,  every: 0.85, proj: 300 },
  kubu:    { name: 'Kubu',    cost: 120, hp: 220, glyph: '🗼', col: '#7f93a6', atk: 26, every: 1.5,  proj: 360, splash: 0.6 },
  pagar:   { name: 'Pagar',   cost: 30,  hp: 360, glyph: '🧱', col: '#a98a5b' },
};

// Raider archetypes that march down the lanes.
const RAIDERS = {
  perompak: { name: 'Perompak', hp: 60,  speed: 22, dps: 14, bite: 1, gold: 8,  r: 15, col: '#d6584e' },
  laju:     { name: 'Laju',     hp: 36,  speed: 44, dps: 10, bite: 1, gold: 8,  r: 13, col: '#e8893a' },
  gergasi:  { name: 'Gergasi',  hp: 240, speed: 14, dps: 34, bite: 1, gold: 24, r: 24, col: '#8c2f8a' },
};

import { Audio as KAudio } from './kampongAudio.js';

export function showTowerDefense(audio, { mission, onResult }) {
  const td = mission?.td || {};
  const COLS = 5;
  const ROWS = 5;
  const WAVES = td.waves || 6;
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  // ---- overlay + toolbar --------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay td';
  overlay.innerHTML =
    `<canvas class="td-canvas"></canvas>` +
    `<button class="td-quit" aria-label="Quit">‹</button>` +
    `<div class="td-toast"></div>` +
    `<div class="td-bar">` +
      Object.entries(TOWERS).map(([k, t]) =>
        `<button class="td-card" data-k="${k}"><span class="td-ic">${t.glyph}</span>` +
        `<span class="td-nm">${t.name}</span><span class="td-co">${t.cost}g</span></button>`).join('') +
    `</div>`;
  document.body.appendChild(overlay);
  // upbeat anime-opening-style background music (starts on first gesture)
  const bgm = new KAudio();
  const startBgm = () => { bgm.unlock(); bgm.music({ ambience: false }); };
  overlay.addEventListener('pointerdown', startBgm, { once: true });
  addEventListener('keydown', startBgm, { once: true });

  const canvas = overlay.querySelector('.td-canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = overlay.querySelector('.td-toast');
  overlay.querySelector('.td-quit').onclick = () => { audio?.play?.('ui_click'); finish(false, true); };

  let selected = null;
  const cards = [...overlay.querySelectorAll('.td-card')];
  for (const c of cards) c.onclick = () => {
    selected = selected === c.dataset.k ? null : c.dataset.k;
    for (const x of cards) x.classList.toggle('on', x.dataset.k === selected);
    audio?.play?.('ui_click');
  };

  // ---- layout / sizing ----------------------------------------------------
  let W = 0, H = 0, DPR = 1, gridTop = 0, gridBot = 0, laneW = 0, cellH = 0;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = overlay.clientWidth; H = overlay.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const barH = overlay.querySelector('.td-bar').offsetHeight || 84;
    gridTop = 84; gridBot = H - barH - 26;
    laneW = W / COLS; cellH = (gridBot - gridTop) / ROWS;
  }
  resize();
  window.addEventListener('resize', resize);

  const cellX = (c) => (c + 0.5) * laneW;
  const cellY = (r) => gridTop + (r + 0.5) * cellH;
  const colAt = (px) => Math.max(0, Math.min(COLS - 1, Math.floor(px / laneW)));
  const rowAt = (py) => Math.floor((py - gridTop) / cellH);

  // ---- state --------------------------------------------------------------
  let gold = td.startGold || 150;
  let kampong = td.kampongHp || 100;
  const kampongMax = kampong;
  const towers = [];   // { type, col, row, x, y, hp, maxHp, cool, def }
  const raiders = [];
  const shots = [];
  const fx = [];
  let wave = 0, waveTimer = 2.5, spawnQueue = [], spawnAcc = 0;
  let started = now(), elapsed = 0, running = true, ended = false, paused = false, breached = 0;
  const occupied = (c, r) => towers.some((t) => t.col === c && t.row === r && t.hp > 0);

  // ---- input: place a defender on tap ------------------------------------
  function tap(px, py) {
    if (paused) { paused = false; return; }
    const c = colAt(px), r = rowAt(py);
    if (r < 0 || r >= ROWS) return;
    if (!selected) { toast('Pick a defender below, then tap a tile'); return; }
    const def = TOWERS[selected];
    if (gold < def.cost) { toast('Not enough gold'); audio?.play?.('select'); return; }
    if (occupied(c, r)) { toast('Tile taken'); return; }
    gold -= def.cost;
    towers.push({ type: selected, def, col: c, row: r, x: cellX(c), y: cellY(r), hp: def.hp, maxHp: def.hp, cool: rand(0, def.every || 1) });
    audio?.play?.('building_done');
    coinFx(cellX(c), cellY(r), '#bfe3c4');
  }
  canvas.addEventListener('click', (e) => { const rect = canvas.getBoundingClientRect(); tap(e.clientX - rect.left, e.clientY - rect.top); });
  canvas.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; const rect = canvas.getBoundingClientRect();
    tap(t.clientX - rect.left, t.clientY - rect.top); e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', onKey);
  function onKey(e) { if (e.key === 'Escape' || e.key.toLowerCase() === 'p') paused = !paused; }

  function toast(msg, ms = 1100) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms); }
  function coinFx(x, y, c) { for (let i = 0; i < 7; i++) { const a = rand(0, 6.28), s = rand(20, 80); fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.5, max: 0.5, c, r: rand(2, 3.5) }); } }

  // ---- waves --------------------------------------------------------------
  function buildWave(n) {
    // n is 1-based. Each wave: more raiders, tougher mix, faster trickle.
    const count = 4 + n * 2;
    const q = [];
    for (let i = 0; i < count; i++) {
      let kind = 'perompak';
      const roll = Math.random();
      if (n >= 2 && roll > 0.8) kind = 'gergasi';
      else if (roll > 0.5) kind = 'laju';
      q.push({ kind, at: i * Math.max(0.5, 1.4 - n * 0.12), col: (Math.random() * COLS) | 0 });
    }
    return q;
  }
  function startWave() {
    wave++;
    spawnQueue = buildWave(wave);
    spawnAcc = 0;
    toast(`Wave ${wave} of ${WAVES}`, 1600);
    audio?.play?.('attack_warning');
  }
  function spawnRaider(kind, col) {
    const d = RAIDERS[kind];
    const hp = d.hp * (1 + (wave - 1) * 0.12);
    raiders.push({ kind, def: d, col, x: cellX(col), y: gridTop - 24, hp, maxHp: hp, speed: d.speed, hitFlash: 0, gold: d.gold });
  }

  // ---- combat helpers -----------------------------------------------------
  function frontRaiderAbove(col, y) {
    // nearest raider in this column at-or-above y (the incoming one to shoot)
    let best = null, by = -1e9;
    for (const rd of raiders) { if (rd.col === col && rd.y <= y + 8 && rd.y > by) { by = rd.y; best = rd; } }
    return best;
  }
  function blockerBelow(col, y) {
    // nearest living defender in this column just ahead (below) of y
    let best = null, by = 1e9;
    for (const t of towers) { if (t.col === col && t.hp > 0 && t.y >= y - 6 && t.y < by) { by = t.y; best = t; } }
    return best;
  }
  function hurtRaider(rd, dmg, splash) {
    rd.hp -= dmg; rd.hitFlash = 0.1;
    if (splash) for (const o of raiders) { if (o !== rd && o.col === rd.col && Math.abs(o.y - rd.y) < cellH * 0.7) o.hp -= dmg * splash; }
    cleanupRaiders();
  }
  function cleanupRaiders() {
    for (let i = raiders.length - 1; i >= 0; i--) {
      const rd = raiders[i];
      if (rd.hp <= 0) {
        gold += rd.gold; raiders.splice(i, 1);
        burst(rd.x, rd.y, rd.def.col, rd.kind === 'gergasi' ? 16 : 8);
        audio?.play?.(rd.kind === 'gergasi' ? 'boss_slain' : 'unit_death', { rateLimitMs: 50 });
      }
    }
  }
  function burst(x, y, c, n) { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(30, 140); fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, c, r: rand(2, 4) }); } }

  // ---- step ---------------------------------------------------------------
  function step(dt) {
    elapsed = (now() - started) / 1000;

    // wave pacing: a breather countdown, then drip the queue, then next wave
    if (spawnQueue.length === 0 && raiders.length === 0) {
      if (wave >= WAVES) { finish(true); return; }
      waveTimer -= dt;
      if (waveTimer <= 0) { startWave(); waveTimer = 6; }
    }
    if (spawnQueue.length) {
      spawnAcc += dt;
      while (spawnQueue.length && spawnAcc >= spawnQueue[0].at) { const s = spawnQueue.shift(); spawnRaider(s.kind, s.col); }
    }

    // towers act
    for (const t of towers) {
      if (t.hp <= 0) continue;
      if (t.def.income) { t.cool -= dt; if (t.cool <= 0) { t.cool = t.def.every; gold += t.def.income; coinFx(t.x, t.y - 6, PAL.gold); audio?.play?.('train_done', { rateLimitMs: 120 }); } continue; }
      if (!t.def.atk) continue; // wall
      t.cool -= dt;
      if (t.cool <= 0) {
        const target = frontRaiderAbove(t.col, t.y);
        if (target) {
          t.cool = t.def.every;
          shots.push({ x: t.x, y: t.y - 10, col: t.col, vy: -(t.def.proj), dmg: t.def.atk, splash: t.def.splash || 0 });
          audio?.play?.(t.type === 'kubu' ? 'cannon_fire' : 'arrow_release', { rateLimitMs: 50 });
        }
      }
    }

    // projectiles travel up their lane
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.y += s.vy * dt;
      let hit = false;
      for (const rd of raiders) { if (rd.col === s.col && Math.abs(rd.y - s.y) < rd.def.r + 6) { hurtRaider(rd, s.dmg, s.splash); hit = true; break; } }
      if (hit || s.y < gridTop - 40) shots.splice(i, 1);
    }

    // raiders march down; stop to hack a defender in the way; breach at bottom
    for (let i = raiders.length - 1; i >= 0; i--) {
      const rd = raiders[i];
      if (rd.hitFlash > 0) rd.hitFlash -= dt;
      const block = blockerBelow(rd.col, rd.y);
      if (block && block.y - rd.y < rd.def.r + 20) {
        block.hp -= rd.def.dps * dt; rd.hitFlash = 0; // gnawing
        if (block.hp <= 0) burst(block.x, block.y, '#caa46a', 10);
      } else {
        rd.y += rd.speed * dt;
        if (rd.y >= gridBot + 6) {
          kampong -= rd.kind === 'gergasi' ? 18 : 10; breached++;
          raiders.splice(i, 1);
          audio?.play?.('impact_big'); shake = 0.3;
          if (kampong <= 0) { kampong = 0; finish(false); return; }
        }
      }
    }

    // fx
    for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy = p.vy * 0.92 + 60 * dt; p.life -= dt; if (p.life <= 0) fx.splice(i, 1); }
    if (shake > 0) shake -= dt;
  }
  let shake = 0;

  // ---- render -------------------------------------------------------------
  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-3, 3), rand(-2, 2));
    // background: stream at top → grassy banks → kampong at bottom
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.water); g.addColorStop(0.14, PAL.bankWet); g.addColorStop(0.4, PAL.grassMid); g.addColorStop(1, PAL.grassTop);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // lanes
    for (let c = 0; c < COLS; c++) { ctx.fillStyle = c % 2 ? PAL.laneOdd : PAL.laneEven; ctx.fillRect(c * laneW, gridTop, laneW, gridBot - gridTop); }
    // grid cells (subtle), highlight a valid placement target under the finger
    ctx.strokeStyle = 'rgba(20,60,40,0.10)'; ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * laneW, gridTop); ctx.lineTo(c * laneW, gridBot); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, gridTop + r * cellH); ctx.lineTo(W, gridTop + r * cellH); ctx.stroke(); }

    // kampong line (the thing you defend)
    ctx.fillStyle = 'rgba(192,133,26,0.18)'; ctx.fillRect(0, gridBot, W, 8);
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(0, gridBot + 4); ctx.lineTo(W, gridBot + 4); ctx.stroke(); ctx.setLineDash([]);

    // towers
    for (const t of towers) if (t.hp > 0) drawTower(t);
    // projectiles
    ctx.fillStyle = '#fff'; for (const s of shots) { ctx.beginPath(); ctx.arc(s.x, s.y, s.splash ? 5 : 3, 0, 6.28); ctx.fill(); }
    // raiders
    for (const rd of raiders) drawRaider(rd);
    // fx
    for (const p of fx) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1;

    drawHud();
    ctx.restore();
    if (paused) drawPause();
  }

  function token(x, y, s, fill, glyph) {
    ctx.fillStyle = fill; roundRect(x - s, y - s, s * 2, s * 2, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,50,0.35)'; ctx.lineWidth = 2; roundRect(x - s, y - s, s * 2, s * 2, 7); ctx.stroke();
    ctx.font = `${Math.round(s * 1.5)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y + 1);
  }
  function hpbar(x, y, w, frac, good) {
    ctx.fillStyle = 'rgba(20,40,60,0.5)'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = good ? '#5fd06a' : '#ff6a5a'; ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 4);
  }
  function drawTower(t) {
    const s = Math.min(laneW, cellH) * 0.34;
    token(t.x, t.y, s, t.def.col, t.def.glyph);
    if (t.hp < t.maxHp) hpbar(t.x, t.y - s - 6, s * 2, t.hp / t.maxHp, true);
  }
  function drawRaider(rd) {
    const r = rd.def.r;
    ctx.fillStyle = rd.hitFlash > 0 ? '#fff' : rd.def.col;
    ctx.beginPath(); ctx.arc(rd.x, rd.y, r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = PAL.foeDark; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `${Math.round(r * 1.1)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText('⚔', rd.x, rd.y + 1);
    hpbar(rd.x, rd.y - r - 7, r * 2, rd.hp / rd.maxHp, false);
  }

  function drawHud() {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(20,40,60,0.5)'; ctx.shadowBlur = 4;
    ctx.font = 'bold 17px system-ui'; ctx.fillStyle = PAL.brass;
    ctx.fillText(`💰 ${gold}`, 56, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.textAlign = 'center';
    ctx.fillText(wave === 0 ? 'Brace…' : `Wave ${wave}/${WAVES}`, W / 2, 16);
    ctx.shadowBlur = 0; ctx.textAlign = 'left';
    // kampong health bar across the bottom of the field
    const bw = W - 40, bx = 20, by = gridBot + 14;
    ctx.fillStyle = 'rgba(20,40,60,0.35)'; roundRect(bx, by, bw, 8, 4); ctx.fill();
    ctx.fillStyle = kampong > kampongMax * 0.4 ? '#5fd06a' : '#e8b84a'; roundRect(bx, by, bw * (kampong / kampongMax), 8, 4); ctx.fill();
    ctx.fillStyle = PAL.ink; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'right'; ctx.fillText(`Kampong ${Math.ceil(kampong)}`, bx + bw, by - 14); ctx.textAlign = 'left';
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(15,40,60,0.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px system-ui'; ctx.fillText('Paused', W / 2, H / 2 - 10);
    ctx.font = '15px system-ui'; ctx.fillText('tap to resume', W / 2, H / 2 + 24); ctx.textAlign = 'left';
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---- loop ---------------------------------------------------------------
  let last = now();
  function frame() {
    if (!running) return;
    const t = now(); let dt = (t - last) / 1000; last = t; dt = Math.min(0.05, dt);
    if (!paused && !ended) step(dt);
    draw();
    requestAnimationFrame(frame);
  }
  toast('Plant defenders to hold the kampong — survive every wave!', 2400);
  requestAnimationFrame(frame);

  // ---- finish -------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false;
    let stars = 0;
    if (win) { stars = 1; if (kampong >= kampongMax * 0.6) stars++; if (breached === 0) stars++; }
    audio?.play?.(win ? 'victory' : 'defeat');
    cleanup();
    onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: elapsed / 60, quit });
  }
  function cleanup() {
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    removeEventListener('keydown', startBgm); bgm.close();
    overlay.remove();
  }

  // debug/test hook
  window.__td = {
    state: () => ({ gold, kampong, wave, waves: WAVES, towers: towers.length, raiders: raiders.length, ended, breached }),
    place: (k, c, r) => { selected = k; tap(cellX(c), cellY(r)); },
    addGold: (n) => { gold += n; },
    skipToEnd: () => { wave = WAVES; spawnQueue = []; raiders.length = 0; },
    breach: () => { spawnRaider('perompak', 0); raiders[raiders.length - 1].y = gridBot + 10; },
  };

  return overlay;
}
