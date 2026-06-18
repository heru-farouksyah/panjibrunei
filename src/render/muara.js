// Landing at Muara — a top-down NAVAL COMBAT ROGUELITE.
//
// A different game from the 3D RTS: a 2D canvas arcade in the spirit of
// Survivor.io / Archero, but naval. You pilot Awang Semaun's war perahu into the
// channel; raider boats swarm from every side. Your cannons auto-fire at the
// nearest enemies in range — you STEER (one finger / WASD), dodge enemy fire,
// scoop up plunder, and on each level pick one of three upgrades. Clear the
// sub-goal (and, in the Sungai variant, sink the enemy flagship) to win.
//
// Self-contained: own overlay, RAF loop, arcade RNG (Math.random — not the
// deterministic sim). Plugs into the campaign reward loop via onResult().

const PAL = {
  sea0: '#cdeafa', sea2: '#6fa9cf', sea3: '#4d86b0',
  ink: '#15384c', brass: '#c0851a',
  hull: '#caa46a', hullDk: '#8f6f3c', deck: '#e7cf9c', sail: '#f5f8fb',
  foeHull: '#b14a40', foeHullDk: '#7c2f29', foeSail: '#e8c4bf',
  foam: 'rgba(255,255,255,0.85)', ring: 'rgba(96,196,255,0.9)', ringFill: 'rgba(120,205,255,0.10)',
};

// Enemy archetypes. behaviour: 'ram' charges you, 'gun' keeps distance & shoots,
// 'swarm' is fast/fragile, 'brute' is slow/tanky.
const FOES = {
  sampan:  { name: 'Sampan',  hp: 30,  speed: 54, dmg: 8,  r: 15, gold: 1, xp: 1, behaviour: 'ram',   color: '#c95a4e' },
  skiff:   { name: 'Skiff',   hp: 18,  speed: 104, dmg: 7, r: 12, gold: 1, xp: 1, behaviour: 'swarm', color: '#e8893a' },
  gunboat: { name: 'Gunboat', hp: 46,  speed: 46, dmg: 14, r: 17, gold: 2, xp: 2, behaviour: 'gun', standoff: 220, fireEvery: 2.4, shotSpeed: 190, color: '#b0496a' },
  junk:    { name: 'Junk',    hp: 150, speed: 30, dmg: 20, r: 26, gold: 4, xp: 3, behaviour: 'brute', color: '#8c4f2f' },
};

// Level-up upgrade pool — the roguelite choice each level.
const UPGRADES = [
  { id: 'cannon', name: 'Extra Cannon', desc: '+1 cannon', icon: '⚓', apply: (s) => { s.guns++; } },
  { id: 'rate',   name: 'Quick Reload', desc: '+22% fire rate', icon: '⏱', apply: (s) => { s.fireEvery *= 0.82; } },
  { id: 'dmg',    name: 'Heavy Shot',   desc: '+25% damage', icon: '💥', apply: (s) => { s.dmg = Math.round(s.dmg * 1.25); } },
  { id: 'range',  name: 'Long Guns',    desc: '+18% range', icon: '🎯', apply: (s) => { s.range *= 1.18; } },
  { id: 'hull',   name: 'Reinforced Hull', desc: '+30 max HP & repair', icon: '🛡', apply: (s) => { s.maxHp += 30; s.hp = Math.min(s.maxHp, s.hp + 36); } },
  { id: 'speed',  name: 'Trim Sails',   desc: '+12% speed', icon: '💨', apply: (s) => { s.speed *= 1.12; } },
  { id: 'pierce', name: 'Chain Shot',   desc: 'shots pierce +1', icon: '🔗', apply: (s) => { s.pierce++; } },
  { id: 'repair', name: 'Repair Crew',  desc: 'heal 45 HP now', icon: '❤️', apply: (s) => { s.hp = Math.min(s.maxHp, s.hp + 45); }, repeatable: true },
];

export function showMuara(audio, { mission, onResult }) {
  // ---- per-mission tuning -------------------------------------------------
  const cfg = mission?.naval || {};
  const GOAL = cfg.goal || 30;
  const HAS_BOSS = !!cfg.boss;
  const HP_SCALE = cfg.hpScale || 1;
  const SPAWN_BASE = cfg.spawn || 1.5;
  const PAR_MIN = cfg.par || 2.5;
  const GUNS_FROM = cfg.gunboatsFrom != null ? cfg.gunboatsFrom : 1; // wave phase gunboats appear
  const INTRO = cfg.intro || `Steer — your cannons fire themselves. Sink ${GOAL} raiders!`;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const now = () => performance.now();

  // ---- overlay + canvas ---------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay muara';
  overlay.innerHTML =
    `<canvas class="muara-canvas"></canvas>` +
    `<button class="muara-quit" aria-label="Quit">‹</button>` +
    `<div class="muara-toast"></div>` +
    `<div class="muara-cards" hidden><div class="mc-title">Choose an upgrade</div><div class="mc-row"></div></div>`;
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('.muara-canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = overlay.querySelector('.muara-toast');
  const cardsEl = overlay.querySelector('.muara-cards');
  const cardRow = overlay.querySelector('.mc-row');
  overlay.querySelector('.muara-quit').onclick = () => { audio?.play?.('ui_click'); finish(false, true); };

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

  // ---- state --------------------------------------------------------------
  const ship = {
    x: W / 2, y: H * 0.6, vx: 0, vy: 0, r: 17, hp: 120, maxHp: 120,
    speed: 172, range: 152, dmg: 14, fireEvery: 0.62, guns: 1, pierce: 0, cool: 0,
    heading: -Math.PI / 2, level: 1, xp: 0, xpNext: 5, hitFlash: 0, wakeT: 0,
  };
  const foes = [], shots = [], eshots = [], fx = [], sinks = [], drops = [], islands = [];
  for (let i = 0; i < 7; i++) islands.push(makeIsland());
  function makeIsland() {
    const r = rand(36, 86);
    const palms = []; for (let k = 0; k < (r > 60 ? 4 : 2); k++) palms.push({ a: rand(0, 6.28), d: rand(0, r * 0.4) });
    return { x: rand(0, W), y: rand(0, H), r, rot: rand(0, 6.28), palms };
  }

  let kills = 0, started = now(), elapsed = 0, minHpFrac = 1, gold = 0;
  let spawnAcc = 0, phase = 0, running = true, ended = false, paused = false, choosing = false;
  let shake = 0, bossSpawned = false, boss = null, t = 0;

  // ---- input: floating joystick + WASD ------------------------------------
  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, id: null };
  const keys = new Set();
  const MAXR = 60;
  function sStart(px, py, id) { stick.active = true; stick.id = id; stick.ox = stick.x = px; stick.oy = stick.y = py; stick.dx = stick.dy = 0; }
  function sMove(px, py) { if (!stick.active) return; let dx = px - stick.ox, dy = py - stick.oy; const d = Math.hypot(dx, dy) || 1; if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; } stick.x = stick.ox + dx; stick.y = stick.oy + dy; stick.dx = dx / MAXR; stick.dy = dy / MAXR; }
  function sEnd() { stick.active = false; stick.dx = stick.dy = 0; stick.id = null; }
  canvas.addEventListener('touchstart', (e) => { const t0 = e.changedTouches[0]; sStart(t0.clientX, t0.clientY, t0.identifier); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { for (const t0 of e.changedTouches) if (t0.identifier === stick.id) sMove(t0.clientX, t0.clientY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { for (const t0 of e.changedTouches) if (t0.identifier === stick.id) sEnd(); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('mousedown', (e) => sStart(e.clientX, e.clientY, 'm'));
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', sEnd);
  function onMouseMove(e) { sMove(e.clientX, e.clientY); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  function onKeyDown(e) { const k = e.key.toLowerCase(); if ('wasd'.includes(k) || k.startsWith('arrow')) { keys.add(k); e.preventDefault(); } else if (k === 'escape' || k === 'p') { if (!choosing) paused = !paused; } }
  function onKeyUp(e) { keys.delete(e.key.toLowerCase()); }
  canvas.addEventListener('click', () => { if (paused) paused = false; });

  function toast(msg, ms = 1200) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms); }

  // ---- spawning -----------------------------------------------------------
  function spawnFoe(forceKind) {
    let kind = forceKind;
    if (!kind) {
      const roll = Math.random();
      kind = 'sampan';
      if (phase >= 2 && roll > 0.9) kind = 'junk';
      else if (phase >= GUNS_FROM && roll > 0.6) kind = 'gunboat';
      else if (phase >= 1 && roll > 0.45) kind = 'skiff';
    }
    const def = FOES[kind];
    const edge = (Math.random() * 4) | 0;
    let x, y;
    if (edge === 0) { x = rand(0, W); y = -40; }
    else if (edge === 1) { x = W + 40; y = rand(0, H); }
    else if (edge === 2) { x = rand(0, W); y = H + 40; }
    else { x = -40; y = rand(0, H); }
    const hs = (1 + phase * 0.16) * HP_SCALE;
    foes.push({ kind, def, x, y, r: def.r, hp: def.hp * hs, maxHp: def.hp * hs, speed: def.speed,
      dmg: def.dmg, behaviour: def.behaviour, atkCool: 0, fireCool: rand(0.5, (def.fireEvery || 2)), hitFlash: 0,
      heading: 0, bob: rand(0, 6.28), color: def.color });
  }
  function spawnBoss() {
    bossSpawned = true;
    boss = { kind: 'flagship', def: { name: 'Flagship' }, boss: true, x: W / 2, y: -90, r: 50,
      hp: 900 * HP_SCALE, maxHp: 900 * HP_SCALE, speed: 26, dmg: 34, behaviour: 'boss',
      atkCool: 0, fireCool: 2, hitFlash: 0, heading: Math.PI / 2, bob: 0, color: '#7a2f8a' };
    foes.push(boss);
    toast('⚑ The enemy flagship approaches — sink it!', 2600);
    audio?.play?.('attack_warning');
    shake = Math.max(shake, 0.4);
  }

  // ---- combat -------------------------------------------------------------
  function fire() {
    // pick up to `guns` distinct nearest targets in range; fire a ball at each
    const inRange = foes.filter((f) => Math.hypot(f.x - ship.x, f.y - ship.y) <= ship.range)
      .sort((a, b) => Math.hypot(a.x - ship.x, a.y - ship.y) - Math.hypot(b.x - ship.x, b.y - ship.y));
    if (!inRange.length) return;
    for (let g = 0; g < ship.guns; g++) {
      const tgt = inRange[g % inRange.length];
      const a = Math.atan2(tgt.y - ship.y, tgt.x - ship.x) + rand(-0.04, 0.04);
      const mx = ship.x + Math.cos(a) * (ship.r + 4), my = ship.y + Math.sin(a) * (ship.r + 4);
      shots.push({ x: mx, y: my, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, dmg: ship.dmg, pierce: ship.pierce, hits: new Set(), life: 1.4 });
      muzzle(mx, my, a);
    }
    ship.heading = Math.atan2(inRange[0].y - ship.y, inRange[0].x - ship.x);
    audio?.play?.('cannon_fire', { rateLimitMs: 55 });
  }
  function muzzle(x, y, a) {
    fx.push({ type: 'flash', x, y, a, life: 0.09, max: 0.09 });
    for (let i = 0; i < 4; i++) fx.push({ type: 'smoke', x, y, vx: Math.cos(a) * rand(20, 70) + rand(-20, 20), vy: Math.sin(a) * rand(20, 70) + rand(-20, 20), life: rand(0.3, 0.6), max: 0.6, r: rand(3, 6) });
  }
  function hurt(f, dmg) {
    f.hp -= dmg; f.hitFlash = 0.1;
    dmgNum(f.x, f.y - f.r, Math.round(dmg));
    if (f.hp <= 0) kill(f);
  }
  function kill(f) {
    const i = foes.indexOf(f); if (i < 0) return;
    foes.splice(i, 1);
    sinks.push({ x: f.x, y: f.y, r: f.r, ang: f.heading, color: f.color, t: 0, max: f.boss ? 1.1 : 0.7, boss: !!f.boss });
    splash(f.x, f.y, f.boss ? 26 : 12);
    audio?.play?.(f.boss || f.kind === 'junk' ? 'boss_slain' : 'unit_death', { rateLimitMs: 45 });
    gainXp(f.boss ? 12 : f.def.xp || 1);
    gold += f.def.gold || 1;
    if (Math.random() < (f.boss ? 1 : f.kind === 'junk' ? 0.6 : 0.18)) drops.push({ x: f.x, y: f.y, kind: f.boss ? 'repair' : (Math.random() < 0.3 ? 'repair' : 'gold'), bob: 0, life: 9 });
    if (f.boss) { boss = null; finish(true); return; }
    kills++;
    if (kills >= GOAL) { if (HAS_BOSS && !bossSpawned) spawnBoss(); else if (!HAS_BOSS) finish(true); }
  }
  function gainXp(n) {
    ship.xp += n;
    if (ship.xp >= ship.xpNext) { ship.xp -= ship.xpNext; ship.level++; ship.xpNext = Math.round(ship.xpNext * 1.5 + 3); offerUpgrades(); }
  }

  // ---- level-up choice cards ---------------------------------------------
  function offerUpgrades() {
    const pool = UPGRADES.filter((u) => u.repeatable || true);
    const choices = [];
    const bag = [...pool];
    while (choices.length < 3 && bag.length) choices.push(bag.splice((Math.random() * bag.length) | 0, 1)[0]);
    cardRow.innerHTML = choices.map((u) =>
      `<button class="mc-card" data-id="${u.id}"><span class="mc-ic">${u.icon}</span><b>${u.name}</b><small>${u.desc}</small></button>`).join('');
    for (const b of cardRow.querySelectorAll('.mc-card')) b.onclick = () => {
      const u = UPGRADES.find((x) => x.id === b.dataset.id); u.apply(ship);
      cardsEl.hidden = true; choosing = false; last = now();
      audio?.play?.('era_up'); toast(`Lv ${ship.level} — ${u.name}`);
    };
    cardsEl.hidden = false; choosing = true;
    audio?.play?.('train_done');
  }

  function dmgNum(x, y, n) { fx.push({ type: 'dmg', x: x + rand(-4, 4), y, vy: -38, life: 0.7, max: 0.7, n }); }
  function splash(x, y, n) { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(40, 150); fx.push({ type: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.6), max: 0.6, r: rand(2, 4), c: 'rgba(255,255,255,0.9)' }); } }
  function hitSpark(x, y, c) { for (let i = 0; i < 7; i++) { const a = rand(0, 6.28), s = rand(40, 150); fx.push({ type: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, r: rand(2, 4), c }); } }
  function cap() { if (fx.length > 280) fx.splice(0, fx.length - 280); }

  // ---- step ---------------------------------------------------------------
  function step(dt) {
    t += dt; elapsed = (now() - started) / 1000;
    phase = Math.min(5, Math.floor(elapsed / 16));

    // movement: velocity eases toward joystick/keys direction (boat-like weight)
    let mx = stick.dx, my = stick.dy;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    const tvx = mx * ship.speed, tvy = my * ship.speed;
    ship.vx += (tvx - ship.vx) * Math.min(1, dt * 6);
    ship.vy += (tvy - ship.vy) * Math.min(1, dt * 6);
    ship.x = Math.max(ship.r, Math.min(W - ship.r, ship.x + ship.vx * dt));
    ship.y = Math.max(ship.r, Math.min(H - ship.r, ship.y + ship.vy * dt));
    const spd = Math.hypot(ship.vx, ship.vy);
    if (spd > 12) { ship.heading = Math.atan2(ship.vy, ship.vx); ship.wakeT += dt; if (ship.wakeT > 0.05) { ship.wakeT = 0; wake(ship.x, ship.y, ship.heading, 4); } }
    if (ship.hitFlash > 0) ship.hitFlash -= dt;

    // auto-fire
    ship.cool -= dt; if (ship.cool <= 0) { fire(); ship.cool = ship.fireEvery; }

    // spawning
    spawnAcc += dt;
    const interval = Math.max(0.32, SPAWN_BASE - phase * 0.22);
    const capN = 7 + phase * 4;
    if (spawnAcc >= interval && foes.length < capN && !(bossSpawned && foes.length > 3)) { spawnAcc = 0; spawnFoe(); }

    // foes
    for (const f of foes) {
      f.bob += dt * 3; if (f.hitFlash > 0) f.hitFlash -= dt;
      const dx = ship.x - f.x, dy = ship.y - f.y, d = Math.hypot(dx, dy) || 1;
      f.heading = Math.atan2(dy, dx);
      const touch = f.r + ship.r;
      const b = f.behaviour;
      if (b === 'gun') {
        // keep standoff distance, strafe slightly, shoot
        const want = f.def.standoff;
        if (d > want + 14) { f.x += dx / d * f.speed * dt; f.y += dy / d * f.speed * dt; }
        else if (d < want - 14) { f.x -= dx / d * f.speed * 0.7 * dt; f.y -= dy / d * f.speed * 0.7 * dt; }
        f.fireCool -= dt;
        if (f.fireCool <= 0 && d < want + 80) { f.fireCool = f.def.fireEvery; enemyShot(f, ship.x, ship.y, f.def.shotSpeed); }
      } else if (b === 'boss') {
        if (d > 150) { f.x += dx / d * f.speed * dt; f.y += dy / d * f.speed * dt; }
        f.fireCool -= dt;
        if (f.fireCool <= 0) { f.fireCool = 2.2; for (let k = -2; k <= 2; k++) { const a = Math.atan2(dy, dx) + k * 0.22; enemyShot(f, f.x + Math.cos(a) * 60, f.y + Math.sin(a) * 60, 170, a); } shake = Math.max(shake, 0.25); }
        if (d <= touch + 6) bump(f);
      } else {
        // ram / swarm / brute: charge the player
        if (d > touch) { f.x += dx / d * f.speed * dt; f.y += dy / d * f.speed * dt; }
        else bump(f);
      }
    }
    function bump(f) { f.atkCool -= dt; if (f.atkCool <= 0) { f.atkCool = 0.8; ship.hp -= f.dmg; ship.hitFlash = 0.2; shake = Math.max(shake, 0.22); hitSpark(ship.x, ship.y, '#ffd2c2'); audio?.play?.('impact_small', { rateLimitMs: 80 }); if (ship.hp <= 0) { ship.hp = 0; finish(false); } } }
    minHpFrac = Math.min(minHpFrac, ship.hp / ship.maxHp);

    // player projectiles
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let done = s.life <= 0 || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20;
      if (!done) for (const f of foes) {
        if (s.hits.has(f)) continue;
        if (Math.hypot(f.x - s.x, f.y - s.y) < f.r + 4) {
          hurt(f, s.dmg); s.hits.add(f); hitSpark(s.x, s.y, '#ffe6b0');
          if (s.hits.size > s.pierce) { done = true; break; }
        }
      }
      if (done) shots.splice(i, 1);
    }
    // enemy projectiles
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (Math.hypot(ship.x - s.x, ship.y - s.y) < ship.r + 4) {
        ship.hp -= s.dmg; ship.hitFlash = 0.2; shake = Math.max(shake, 0.25); hitSpark(ship.x, ship.y, '#ffd2c2');
        audio?.play?.('impact_small', { rateLimitMs: 80 }); eshots.splice(i, 1);
        if (ship.hp <= 0) { ship.hp = 0; finish(false); return; }
      } else if (s.life <= 0 || s.x < -30 || s.x > W + 30 || s.y < -30 || s.y > H + 30) eshots.splice(i, 1);
    }

    // drops (plunder / repair) — drift, magnet toward ship, collect
    for (let i = drops.length - 1; i >= 0; i--) {
      const dp = drops[i]; dp.bob += dt * 4; dp.life -= dt;
      const dx = ship.x - dp.x, dy = ship.y - dp.y, d = Math.hypot(dx, dy) || 1;
      if (d < 90) { dp.x += dx / d * 160 * dt; dp.y += dy / d * 160 * dt; }
      if (d < ship.r + 8) {
        if (dp.kind === 'repair') { ship.hp = Math.min(ship.maxHp, ship.hp + 18); toast('+18 hull', 700); }
        else { gold += 3; }
        audio?.play?.('train_done', { rateLimitMs: 60 }); drops.splice(i, 1); continue;
      }
      if (dp.life <= 0) drops.splice(i, 1);
    }

    // fx + sinks
    for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; } if (p.vy != null && p.type === 'dmg') p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) fx.splice(i, 1); }
    for (let i = sinks.length - 1; i >= 0; i--) { sinks[i].t += dt; if (sinks[i].t >= sinks[i].max) sinks.splice(i, 1); }
    if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
    cap();
  }
  function enemyShot(f, tx, ty, speed, fixedA) { const a = fixedA != null ? fixedA : Math.atan2(ty - f.y, tx - f.x); eshots.push({ x: f.x, y: f.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg: f.boss ? 16 : 12, life: 3.2 }); audio?.play?.('throw_release', { rateLimitMs: 90 }); }
  function wake(x, y, h, n) { for (let i = 0; i < n; i++) fx.push({ type: 'drop', x: x - Math.cos(h) * 12 + rand(-4, 4), y: y - Math.sin(h) * 12 + rand(-4, 4), vx: -Math.cos(h) * 20 + rand(-12, 12), vy: -Math.sin(h) * 20 + rand(-12, 12), life: rand(0.4, 0.7), max: 0.7, r: rand(2, 4), c: 'rgba(255,255,255,0.55)' }); }

  // ---- render -------------------------------------------------------------
  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 8);
    // sea
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.sea0); g.addColorStop(0.4, PAL.sea2); g.addColorStop(1, PAL.sea3);
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
    drawSeaShimmer();
    for (const is of islands) drawIsland(is);
    // range ring
    ctx.beginPath(); ctx.arc(ship.x, ship.y, ship.range, 0, 6.28); ctx.fillStyle = PAL.ringFill; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = PAL.ring; ctx.setLineDash([5, 9]); ctx.lineDashOffset = -t * 18; ctx.stroke(); ctx.setLineDash([]);
    // sinks (behind live entities)
    for (const s of sinks) drawSink(s);
    // drops
    for (const dp of drops) drawDrop(dp);
    // player shots
    for (const s of shots) drawBall(s.x, s.y, 4, '#2a2a2a');
    // enemy shots
    for (const s of eshots) { drawBall(s.x, s.y, 5, '#d24a3a'); }
    // foes
    for (const f of foes) drawShip(f.x, f.y + Math.sin(f.bob) * 1.5, f.r, f.heading, f.color, FOES_DK(f), f.hitFlash > 0, true, f);
    // player
    drawShip(ship.x, ship.y, ship.r, ship.heading, PAL.hull, PAL.hullDk, ship.hitFlash > 0, false, ship);
    // fx (smoke, flashes, sparks, damage)
    for (const p of fx) drawFx(p);
    // joystick
    if (stick.active) { ctx.beginPath(); ctx.arc(stick.ox, stick.oy, MAXR, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke(); ctx.beginPath(); ctx.arc(stick.x, stick.y, 22, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
    ctx.restore();
    drawHud();
    if (paused) drawPause();
  }
  function FOES_DK(f) { return f.boss ? '#4d1a55' : (FOES[f.kind] ? '#7c2f29' : '#7c2f29'); }

  function drawSeaShimmer() {
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const y = ((i * 137 + t * 18) % (H + 60)) - 30; ctx.beginPath(); for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin((x * 0.03) + t + i) * 6); ctx.stroke(); }
    ctx.restore();
  }
  function drawIsland(is) {
    ctx.save(); ctx.translate(is.x, is.y); ctx.rotate(is.rot);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, is.r * 1.12, is.r * 0.9, 0, 0, 6.28); ctx.fill(); // surf
    ctx.fillStyle = '#ecd9a6'; ctx.beginPath(); ctx.ellipse(0, 0, is.r, is.r * 0.8, 0, 0, 6.28); ctx.fill();             // sand
    ctx.fillStyle = '#7bbd7e'; ctx.beginPath(); ctx.ellipse(0, 0, is.r * 0.68, is.r * 0.54, 0, 0, 6.28); ctx.fill();      // grass
    ctx.fillStyle = '#3f8a52'; for (const p of is.palms) { const px = Math.cos(p.a) * p.d, py = Math.sin(p.a) * p.d; ctx.beginPath(); ctx.arc(px, py, is.r * 0.18, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
  function drawShip(x, y, r, ang, color, dark, flash, isFoe, ent) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    // shadow
    ctx.fillStyle = 'rgba(20,50,70,0.18)'; ctx.beginPath(); ctx.ellipse(2, r * 0.2, r * 0.85, r * 1.05, 0, 0, 6.28); ctx.fill();
    // hull
    ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.quadraticCurveTo(r * 0.85, -r * 0.35, r * 0.6, r * 0.95); ctx.quadraticCurveTo(0, r * 1.18, -r * 0.6, r * 0.95); ctx.quadraticCurveTo(-r * 0.85, -r * 0.35, 0, -r * 1.25); ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = dark; ctx.stroke();
    // deck
    ctx.fillStyle = flash ? '#fff' : (isFoe ? 'rgba(255,255,255,0.18)' : PAL.deck); ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.42, r * 0.78, 0, 0, 6.28); ctx.fill();
    // mast + sail
    ctx.strokeStyle = '#6b4f2a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, r * 0.2); ctx.lineTo(0, -r * 1.0); ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : (isFoe ? PAL.foeSail : PAL.sail); ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.quadraticCurveTo(r * 0.7, -r * 0.45, r * 0.12, -r * 0.1); ctx.lineTo(0, -r * 0.1); ctx.closePath(); ctx.fill();
    if (ent && ent.boss) { ctx.fillStyle = '#d6584e'; ctx.beginPath(); ctx.moveTo(0, -r * 1.0); ctx.lineTo(r * 0.5, -r * 0.82); ctx.lineTo(0, -r * 0.66); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // hp bar
    const frac = Math.max(0, ent.hp / ent.maxHp);
    if (isFoe ? frac < 1 : true) {
      const bw = isFoe ? r * 2 : 50, bx = x - bw / 2, by = y - r - (isFoe ? 9 : 17);
      ctx.fillStyle = 'rgba(20,40,60,0.55)'; ctx.fillRect(bx, by, bw, isFoe ? 4 : 6);
      ctx.fillStyle = isFoe ? '#ff6a5a' : (frac > 0.4 ? '#5fd06a' : '#e8b84a'); ctx.fillRect(bx, by, bw * frac, isFoe ? 4 : 6);
      if (!isFoe) { ctx.fillStyle = PAL.brass; ctx.beginPath(); ctx.arc(bx - 9, by + 3, 9, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ship.level, bx - 9, by + 4); }
    }
  }
  function drawBall(x, y, r, c) { ctx.fillStyle = 'rgba(20,40,60,0.25)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2, r, 0, 6.28); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); }
  function drawDrop(dp) { const yo = Math.sin(dp.bob) * 2; const blink = dp.life < 2 && (dp.life * 6 | 0) % 2 === 0; if (blink) return; ctx.font = '17px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dp.kind === 'repair' ? '❤️' : '🪙', dp.x, dp.y + yo); }
  function drawSink(s) { const k = s.t / s.max; ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(s.x, s.y); ctx.rotate(s.ang + Math.PI / 2 + k * 0.8); const r = s.r * (1 - k * 0.3); ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.8, 0, 0, r); ctx.quadraticCurveTo(-r * 0.8, 0, 0, -r); ctx.fill(); ctx.restore(); ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.6 + k * 1.4), 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
  function drawFx(p) {
    if (p.type === 'flash') { ctx.save(); ctx.globalAlpha = p.life / p.max; ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, -5); ctx.lineTo(16, 5); ctx.closePath(); ctx.fill(); ctx.restore(); return; }
    if (p.type === 'smoke') { ctx.globalAlpha = (p.life / p.max) * 0.5; ctx.fillStyle = '#cfd6dc'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - p.life / p.max)), 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; return; }
    if (p.type === 'dmg') { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(20,40,60,0.6)'; ctx.lineWidth = 3; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.strokeText(p.n, p.x, p.y); ctx.fillText(p.n, p.x, p.y); ctx.globalAlpha = 1; return; }
    // generic droplet/spark
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c || '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 3, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
  }

  function drawHud() {
    const bossLive = boss && boss.hp > 0;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(20,40,60,0.5)'; ctx.shadowBlur = 4;
    ctx.font = 'bold 16px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fillText(bossLive ? 'Sink the flagship!' : `Sub Goal  ${Math.min(kills, GOAL)}/${GOAL}`, 56, 16);
    ctx.shadowBlur = 0;
    const pw = Math.min(220, W - 72), px = 56, py = 40, frac = bossLive ? boss.hp / boss.maxHp : Math.min(kills, GOAL) / GOAL;
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(px, py, pw, 7, 4); ctx.fill();
    ctx.fillStyle = bossLive ? '#d6584e' : PAL.brass; rr(px, py, pw * frac, 7, 4); ctx.fill();
    // top-right: gold + timer + wave
    ctx.textAlign = 'right'; ctx.shadowColor = 'rgba(20,40,60,0.5)'; ctx.shadowBlur = 4; ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.font = 'bold 15px system-ui';
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'), ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
    ctx.fillText(`🪙 ${gold}    ${mm}:${ss}   Wave ${phase + 1}`, W - 14, 16); ctx.shadowBlur = 0; ctx.textAlign = 'left';
    // xp bar (thin, under top)
    const xw = W - 28; ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(14, 62, xw, 4);
    ctx.fillStyle = '#7fe0a0'; ctx.fillRect(14, 62, xw * Math.min(1, ship.xp / ship.xpNext), 4);
  }
  function drawPause() { ctx.fillStyle = 'rgba(15,40,60,0.5)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 28px system-ui'; ctx.fillText('Paused', W / 2, H / 2 - 10); ctx.font = '15px system-ui'; ctx.fillText('tap to resume', W / 2, H / 2 + 24); ctx.textAlign = 'left'; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---- loop ---------------------------------------------------------------
  let last = now();
  function frame() {
    if (!running) return;
    const tn = now(); let dt = (tn - last) / 1000; last = tn; dt = Math.min(0.05, dt);
    if (!paused && !choosing && !ended) step(dt);
    draw();
    requestAnimationFrame(frame);
  }
  toast(INTRO, 2600);
  requestAnimationFrame(frame);

  // ---- finish -------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false;
    const minutes = elapsed / 60; let stars = 0;
    if (win) { stars = 1; if (minutes <= PAR_MIN) stars++; if (minHpFrac >= 0.6) stars++; }
    audio?.play?.(win ? 'victory' : 'defeat');
    cleanup();
    onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes, quit });
  }
  function cleanup() {
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', sEnd);
    overlay.remove();
  }

  // debug/test hook
  window.__muara = {
    ship, foes, shots,
    state: () => ({ kills, goal: GOAL, hp: Math.round(ship.hp), ended, level: ship.level, guns: ship.guns, phase, elapsed, gold, foes: foes.length, choosing, hasBoss: HAS_BOSS, bossSpawned, bossHp: boss ? Math.round(boss.hp) : null }),
    spawn: (k) => spawnFoe(k), summonBoss: () => { if (HAS_BOSS && !bossSpawned) spawnBoss(); }, killBoss: () => { if (boss) kill(boss); },
    levelUp: () => offerUpgrades(), forceWin: () => finish(true),
  };

  return overlay;
}
