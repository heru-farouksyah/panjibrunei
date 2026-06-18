// Landing at Muara — a top-down NAVAL ARENA SURVIVAL mini-game.
//
// This is deliberately a *different game* from the 3D RTS that the rest of the
// campaign runs: a 2D canvas arcade in the spirit of Survivor.io / Archero.
// You pilot Awang Semaun's lone war perahu into the Muara channel; raider boats
// swarm in from every side. Your ship auto-fires at the nearest raider inside
// its attack ring — your only job is to STEER (one finger / WASD) and keep
// kiting until you clear the Sub-Goal and break ashore.
//
// Self-contained: own full-screen overlay, own canvas + RAF loop, own arcade
// RNG (Math.random — this is not the deterministic sim). It plugs into the same
// campaign reward loop via onResult({ win, stars, minutes }).

const PALETTE = {
  waterTop: '#dff1fb', waterMid: '#a9d4ec', waterDeep: '#6fa9cf',
  ink: '#1c3a4a', brass: '#c0851a',
  hull: '#caa46a', hullDark: '#9a7741', sail: '#f3f7fb',
  foe: '#d6584e', foeDark: '#9c352d',
  ring: 'rgba(86,190,255,0.85)', ringFill: 'rgba(120,205,255,0.12)',
};

// Enemy archetypes — escalate by introducing the tougher ones in later phases.
const FOES = {
  sampan:  { name: 'Sampan',  hp: 26,  speed: 52, dmg: 7,  r: 15, gold: 1, color: '#d6584e' },
  perahu:  { name: 'Perahu',  hp: 60,  speed: 40, dmg: 12, r: 19, gold: 2, color: '#c64536' },
  laju:    { name: 'Laju',    hp: 18,  speed: 96, dmg: 9,  r: 13, gold: 2, color: '#e8893a' }, // fast skiff
  gergasi: { name: 'Gergasi', hp: 220, speed: 26, dmg: 22, r: 30, gold: 6, color: '#8c2f8a' }, // brute
};

export function showMuara(audio, { mission, onResult }) {
  // ---- overlay + canvas ---------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay muara';
  overlay.innerHTML =
    `<canvas class="muara-canvas"></canvas>` +
    `<button class="muara-quit" aria-label="Quit">‹</button>` +
    `<div class="muara-toast"></div>`;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('.muara-canvas');
  const ctx = canvas.getContext('2d');
  const quitBtn = overlay.querySelector('.muara-quit');
  const toastEl = overlay.querySelector('.muara-toast');

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = overlay.clientWidth; H = overlay.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- world / state ------------------------------------------------------
  // Per-mission tuning: Muara is the gentle intro; Sungai Damuan reuses this
  // engine as a tougher "fleet battle" that ends with an enemy flagship boss.
  const cfg = mission?.naval || {};
  const GOAL = cfg.goal || 30;     // Sub-Goal: raiders to defeat before landing
  const HAS_BOSS = !!cfg.boss;     // if set, clearing the sub-goal summons a boss you must sink
  const HP_SCALE = cfg.hpScale || 1;
  const SPAWN_BASE = cfg.spawn || 1.5;
  const PAR_MIN = cfg.par || 3;
  const INTRO = cfg.intro || `Steer — your perahu fires itself. Clear ${GOAL} raiders!`;
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();
  let bossSpawned = false, boss = null;

  const ship = {
    x: W / 2, y: H * 0.62, r: 16, hp: 100, maxHp: 100,
    speed: 168, range: 132, dmg: 12, fireEvery: 0.42, cool: 0,
    level: 1, xp: 0, xpNext: 6, facing: -Math.PI / 2, hitFlash: 0,
  };
  const foes = [];
  const shots = [];      // player projectiles
  const fx = [];         // transient splashes / pops
  const islands = [];    // decorative atolls
  for (let i = 0; i < 7; i++) {
    islands.push({ x: rand(0, W), y: rand(0, H), r: rand(34, 78), seed: rand(0, 6.28) });
  }

  let kills = 0, started = now(), elapsed = 0, minHpFrac = 1, hitsTaken = 0;
  let spawnAcc = 0, phase = 0, running = true, ended = false, paused = false;

  // ---- input: floating joystick (touch) + WASD/drag (desktop) -------------
  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  const keys = new Set();
  const MAX_R = 56;

  function stickStart(px, py) { stick.active = true; stick.ox = stick.x = px; stick.oy = stick.y = py; stick.dx = stick.dy = 0; }
  function stickMove(px, py) {
    if (!stick.active) return;
    let dx = px - stick.ox, dy = py - stick.oy;
    const d = Math.hypot(dx, dy) || 1;
    if (d > MAX_R) { dx = dx / d * MAX_R; dy = dy / d * MAX_R; }
    stick.x = stick.ox + dx; stick.y = stick.oy + dy;
    stick.dx = dx / MAX_R; stick.dy = dy / MAX_R; // -1..1
  }
  function stickEnd() { stick.active = false; stick.dx = stick.dy = 0; }

  canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; stickStart(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { const t = e.changedTouches[0]; stickMove(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { stickEnd(); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('mousedown', (e) => stickStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => stickMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', stickEnd);
  const mkKey = (down) => (e) => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      down ? keys.add(k) : keys.delete(k); e.preventDefault();
    } else if (down && (k === 'escape' || k === 'p')) { paused = !paused; }
  };
  const onKeyDown = mkKey(true), onKeyUp = mkKey(false);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  quitBtn.onclick = () => { audio?.play?.('ui_click'); finish(false, true); };

  function toast(msg, ms = 1100) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ---- spawning -----------------------------------------------------------
  // A boat enters from just outside a random edge and homes on the player.
  function spawnFoe() {
    // phase grows with time; later phases unlock tougher boats + faster waves
    const roll = Math.random();
    let kind = 'sampan';
    if (phase >= 3 && roll > 0.92) kind = 'gergasi';
    else if (phase >= 1 && roll > 0.62) kind = 'laju';
    else if (phase >= 2 && roll > 0.5) kind = 'perahu';
    const def = FOES[kind];
    const edge = (Math.random() * 4) | 0;
    let x, y;
    if (edge === 0) { x = rand(0, W); y = -40; }
    else if (edge === 1) { x = W + 40; y = rand(0, H); }
    else if (edge === 2) { x = rand(0, W); y = H + 40; }
    else { x = -40; y = rand(0, H); }
    const hpScale = (1 + phase * 0.18) * HP_SCALE;
    foes.push({ kind, x, y, r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      speed: def.speed, dmg: def.dmg, gold: def.gold, color: def.color, atkCool: 0, hitFlash: 0, bob: rand(0, 6.28) });
  }

  // The enemy flagship — summoned once the sub-goal is cleared (Sungai variant).
  // A huge, slow brute; sinking it wins the mission.
  function spawnBoss() {
    bossSpawned = true;
    boss = { kind: 'flagship', boss: true, x: W / 2, y: -70, r: 46,
      hp: 700 * HP_SCALE, maxHp: 700 * HP_SCALE, speed: 24, dmg: 30, gold: 25,
      color: '#7a2f8a', atkCool: 0, hitFlash: 0, bob: 0 };
    foes.push(boss);
    toast('The enemy flagship approaches — sink it!', 2600);
    audio?.play?.('attack_warning');
  }

  // ---- combat -------------------------------------------------------------
  function fire() {
    // target the nearest live foe within range
    let best = null, bd = ship.range;
    for (const f of foes) { const d = Math.hypot(f.x - ship.x, f.y - ship.y); if (d < bd) { bd = d; best = f; } }
    if (!best) return;
    const a = Math.atan2(best.y - ship.y, best.x - ship.x);
    ship.facing = a;
    shots.push({ x: ship.x, y: ship.y, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, dmg: ship.dmg, life: 1.2, trail: ship.facing });
    audio?.play?.('arrow_release', { rateLimitMs: 60 });
  }

  function damageFoe(f, dmg) {
    f.hp -= dmg; f.hitFlash = 0.12;
    if (f.hp <= 0) killFoe(f);
  }
  function killFoe(f) {
    const i = foes.indexOf(f); if (i < 0) return;
    foes.splice(i, 1);
    const big = f.boss || f.kind === 'gergasi';
    burst(f.x, f.y, f.color, f.boss ? 30 : big ? 18 : 9);
    audio?.play?.(big ? 'boss_slain' : 'unit_death', { rateLimitMs: 50 });
    gainXp(f.boss ? 10 : big ? 4 : 1);
    if (f.boss) { boss = null; finish(true); return; }   // flagship down → win
    kills++;
    if (kills >= GOAL) {
      if (HAS_BOSS && !bossSpawned) spawnBoss();           // sub-goal cleared → summon flagship
      else if (!HAS_BOSS) finish(true);                    // plain survival → win at the goal
    }
  }
  function gainXp(n) {
    ship.xp += n;
    while (ship.xp >= ship.xpNext) {
      ship.xp -= ship.xpNext; ship.level++; ship.xpNext = Math.round(ship.xpNext * 1.45 + 2);
      levelUp();
    }
  }
  // Auto-upgrade on level (a light roguelite buff — no menu, keeps it fast).
  function levelUp() {
    const buffs = [
      () => { ship.fireEvery = Math.max(0.16, ship.fireEvery * 0.86); return 'Faster volleys'; },
      () => { ship.dmg = Math.round(ship.dmg * 1.18); return 'Sharper arrows'; },
      () => { ship.range += 18; return 'Longer range'; },
      () => { ship.maxHp += 18; ship.hp = Math.min(ship.maxHp, ship.hp + 22); return 'Reinforced hull'; },
      () => { ship.speed += 14; return 'Swifter perahu'; },
    ];
    const msg = buffs[(Math.random() * buffs.length) | 0]();
    toast(`Lv ${ship.level} — ${msg}`);
    audio?.play?.('era_up');
    for (let i = 0; i < 14; i++) fx.push({ x: ship.x, y: ship.y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.6, max: 0.6, c: PALETTE.brass, r: 3 });
  }

  function burst(x, y, c, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), s = rand(30, 150);
      fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, c, r: rand(2, 4) });
    }
  }

  // ---- step ---------------------------------------------------------------
  function step(dt) {
    elapsed = (now() - started) / 1000;
    phase = Math.min(4, Math.floor(elapsed / 18)); // ramp every 18s

    // movement input → velocity
    let mx = stick.dx, my = stick.dy;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    ship.x = Math.max(ship.r, Math.min(W - ship.r, ship.x + mx * ship.speed * dt));
    ship.y = Math.max(ship.r, Math.min(H - ship.r, ship.y + my * ship.speed * dt));
    if (m > 0.05) ship.facing = Math.atan2(my, mx);
    if (ship.hitFlash > 0) ship.hitFlash -= dt;

    // auto-fire
    ship.cool -= dt;
    if (ship.cool <= 0) { fire(); ship.cool = ship.fireEvery; }

    // spawn cadence tightens with phase
    spawnAcc += dt;
    const interval = Math.max(0.35, 1.5 - phase * 0.26);
    const capacity = 8 + phase * 5;
    if (spawnAcc >= interval && foes.length < capacity) { spawnAcc = 0; spawnFoe(); }

    // foes home in; ram the ship on contact
    for (const f of foes) {
      f.bob += dt * 3;
      if (f.hitFlash > 0) f.hitFlash -= dt;
      const dx = ship.x - f.x, dy = ship.y - f.y, d = Math.hypot(dx, dy) || 1;
      const touch = f.r + ship.r;
      if (d > touch) { f.x += dx / d * f.speed * dt; f.y += dy / d * f.speed * dt; f.atkCool = Math.max(0, f.atkCool - dt); }
      else {
        f.atkCool -= dt;
        if (f.atkCool <= 0) {
          f.atkCool = 0.8;
          ship.hp -= f.dmg; ship.hitFlash = 0.18; hitsTaken++;
          burst(ship.x, ship.y, '#ffd2c2', 6);
          audio?.play?.('impact_small', { rateLimitMs: 80 });
          if (ship.hp <= 0) { ship.hp = 0; finish(false); }
        }
      }
    }
    minHpFrac = Math.min(minHpFrac, ship.hp / ship.maxHp);

    // projectiles
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let hit = false;
      for (const f of foes) {
        if (Math.hypot(f.x - s.x, f.y - s.y) < f.r) { damageFoe(f, s.dmg); hit = true; break; }
      }
      if (hit || s.life <= 0 || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) shots.splice(i, 1);
    }

    // fx
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt;
      if (p.life <= 0) fx.splice(i, 1);
    }
  }

  // ---- render -------------------------------------------------------------
  function draw() {
    // water gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.waterTop); g.addColorStop(0.45, PALETTE.waterMid); g.addColorStop(1, PALETTE.waterDeep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // islands (decorative)
    for (const is of islands) {
      ctx.save(); ctx.translate(is.x, is.y);
      ctx.fillStyle = 'rgba(120,180,140,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 0, is.r, is.r * 0.78, is.seed, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(238,224,170,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, is.r * 0.6, is.r * 0.46, is.seed, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(70,120,80,0.55)';
      ctx.beginPath(); ctx.arc(-is.r * 0.1, -is.r * 0.12, is.r * 0.26, 0, 6.28); ctx.fill();
      ctx.restore();
    }

    // attack ring
    ctx.beginPath(); ctx.arc(ship.x, ship.y, ship.range, 0, 6.28);
    ctx.fillStyle = PALETTE.ringFill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = PALETTE.ring; ctx.setLineDash([6, 8]); ctx.stroke(); ctx.setLineDash([]);

    // projectiles (white tracers)
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const s of shots) {
      ctx.beginPath(); ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - Math.cos(s.trail) * 14, s.y - Math.sin(s.trail) * 14); ctx.stroke();
    }

    // foes
    for (const f of foes) drawBoat(f.x, f.y + Math.sin(f.bob) * 1.5, f.r, Math.atan2(ship.y - f.y, ship.x - f.x), f.color, f.hitFlash > 0, true, f);

    // player ship
    drawBoat(ship.x, ship.y, ship.r, ship.facing, PALETTE.hull, ship.hitFlash > 0, false, ship);

    // fx particles
    for (const p of fx) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    // joystick
    if (stick.active) {
      ctx.beginPath(); ctx.arc(stick.ox, stick.oy, MAX_R, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(stick.x, stick.y, 22, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    }

    drawHud();
    if (paused) drawPause();
  }

  function drawBoat(x, y, r, ang, color, flash, isFoe, ent) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    // hull
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.quadraticCurveTo(r * 0.8, -r * 0.2, r * 0.62, r * 0.9);
    ctx.lineTo(-r * 0.62, r * 0.9);
    ctx.quadraticCurveTo(-r * 0.8, -r * 0.2, 0, -r * 1.15);
    ctx.closePath();
    ctx.fillStyle = flash ? '#ffffff' : color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = isFoe ? PALETTE.foeDark : PALETTE.hullDark; ctx.stroke();
    // sail
    ctx.beginPath(); ctx.moveTo(0, -r * 0.2); ctx.lineTo(0, -r * 0.95);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#7a5a30'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.5, -r * 0.4); ctx.lineTo(0, -r * 0.25); ctx.closePath();
    ctx.fillStyle = isFoe ? 'rgba(255,255,255,0.55)' : PALETTE.sail; ctx.fill();
    ctx.restore();

    // hp bar
    const frac = Math.max(0, ent.hp / ent.maxHp);
    if (frac < 1 || !isFoe) {
      const bw = isFoe ? r * 2 : 46, bx = x - bw / 2, by = y - r - (isFoe ? 9 : 16);
      ctx.fillStyle = 'rgba(20,40,60,0.55)'; ctx.fillRect(bx, by, bw, isFoe ? 4 : 6);
      ctx.fillStyle = isFoe ? '#ff6a5a' : (frac > 0.4 ? '#5fd06a' : '#e8b84a');
      ctx.fillRect(bx, by, bw * frac, isFoe ? 4 : 6);
      if (!isFoe) {
        // level badge for the player ("Fan 4"-style)
        ctx.fillStyle = PALETTE.brass; ctx.beginPath(); ctx.arc(bx - 9, by + 3, 9, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ship.level, bx - 9, by + 4);
      }
    }
  }

  function drawHud() {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const bossLive = boss && boss.hp > 0;
    // objective label (top-left, beside the back button)
    ctx.font = 'bold 16px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(20,40,60,0.5)'; ctx.shadowBlur = 4;
    ctx.fillText(bossLive ? 'Sink the flagship!' : `Sub Goal  ${Math.min(kills, GOAL)}/${GOAL}`, 56, 16);
    ctx.shadowBlur = 0;

    // progress bar under it — sub-goal progress, or the boss's health
    const pw = Math.min(220, W - 72), px = 56, py = 40;
    const frac = bossLive ? boss.hp / boss.maxHp : Math.min(kills, GOAL) / GOAL;
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; roundRect(px, py, pw, 7, 4); ctx.fill();
    ctx.fillStyle = bossLive ? '#d6584e' : PALETTE.brass; roundRect(px, py, pw * frac, 7, 4); ctx.fill();

    // timer + phase (top-right)
    ctx.textAlign = 'right'; ctx.font = 'bold 15px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(20,40,60,0.5)'; ctx.shadowBlur = 4;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'), ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
    ctx.fillText(`${mm}:${ss}   Wave ${phase + 1}`, W - 14, 16);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(15,40,60,0.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px system-ui'; ctx.fillText('Paused', W / 2, H / 2 - 10);
    ctx.font = '15px system-ui'; ctx.fillText('tap to resume', W / 2, H / 2 + 24);
    ctx.textAlign = 'left';
  }
  // tap-to-resume when paused
  canvas.addEventListener('click', () => { if (paused) paused = false; });

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- loop ---------------------------------------------------------------
  let last = now();
  function frame() {
    if (!running) return;
    const t = now(); let dt = (t - last) / 1000; last = t;
    dt = Math.min(0.05, dt);
    if (!paused && !ended) step(dt);
    draw();
    requestAnimationFrame(frame);
  }
  // a brief intro toast so the player knows what to do
  toast(INTRO, 2400);
  requestAnimationFrame(frame);

  // ---- finish -------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false;
    const minutes = elapsed / 60;
    // ★ win · ★ swift (under par) · ★ unscathed (kept hull healthy)
    let stars = 0;
    if (win) {
      stars = 1;
      if (minutes <= PAR_MIN) stars++;
      if (minHpFrac >= 0.6) stars++;
    }
    audio?.play?.(win ? 'victory' : 'defeat');
    cleanup();
    onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes, quit });
  }
  function cleanup() {
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', stickMove);
    window.removeEventListener('mouseup', stickEnd);
    overlay.remove();
  }

  // debug/test hook
  window.__muara = {
    ship, foes, shots,
    state: () => ({ kills, goal: GOAL, hp: ship.hp, ended, level: ship.level, phase, elapsed,
      foes: foes.length, hasBoss: HAS_BOSS, bossSpawned, bossHp: boss ? boss.hp : null }),
    spawn: spawnFoe,
    summonBoss: () => { if (HAS_BOSS && !bossSpawned) spawnBoss(); },
    killBoss: () => { if (boss) killFoe(boss); },
    forceWin: () => finish(true),
  };

  return overlay;
}
