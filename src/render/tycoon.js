// Skirmish at the Tamu — a MARKET-TYCOON mini-game.
//
// The one campaign node that isn't a battle: the tamu (open-air market). You run
// four stalls that serve a rush of customers for gold; stock drains as they sell,
// so you must restock before a stall runs dry and reinvest the surplus into
// upgrades — all while rival kampongs earn alongside you and the bell counts
// down. Out-earn the target (and ideally every rival) before time runs out.
//
// DOM-based (the genre is buttons + bars, not pixels). Plugs into the same
// campaign reward loop via onResult({ win, stars, minutes }).

const GOODS = [
  { good: 'Ikan', icon: '🐟', tint: '#8fd0e6' },   // fish
  { good: 'Buah', icon: '🥭', tint: '#f0c24a' },   // fruit
  { good: 'Kuih', icon: '🧁', tint: '#f0a0bf' },   // sweet cakes
  { good: 'Kraf', icon: '🧺', tint: '#c2a878' },   // crafts
];

export function showTycoon(audio, { mission, onResult }) {
  const cfg = mission?.tycoon || {};
  const SECS = cfg.secs || 80;
  const TARGET = cfg.target || 650;
  const now = () => performance.now();

  // per-level economics for a stall
  const price = (lvl) => 2 + (lvl - 1) * 2;          // gold per customer
  const flow = (lvl) => 2 + (lvl - 1) * 0.6;          // customers / sec (also stock/sec)
  const maxStock = (lvl) => 12 + (lvl - 1) * 8;
  const restockCost = (lvl) => Math.round(maxStock(lvl) * 0.45);
  const upgradeCost = (lvl) => Math.round(45 * Math.pow(1.7, lvl - 1));

  // ---- DOM ----------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'screen-overlay tycoon';
  overlay.innerHTML =
    `<button class="ty-quit" aria-label="Quit">‹</button>` +
    `<div class="ty-hud">` +
      `<div class="ty-purse">💰 <b id="ty-gold">0</b></div>` +
      `<div class="ty-goal"><div class="ty-goal-bar"><span id="ty-goalfill"></span></div>` +
        `<small>Target <b>${TARGET}</b>g · Rivals <b id="ty-rival">0</b>g</small></div>` +
      `<div class="ty-clock" id="ty-clock">${SECS}s</div>` +
    `</div>` +
    `<div class="ty-stalls" id="ty-stalls"></div>` +
    `<div class="ty-toast" id="ty-toast"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.ty-quit').onclick = () => { audio?.play?.('ui_click'); finish(false, true); };

  const goldEl = overlay.querySelector('#ty-gold');
  const rivalEl = overlay.querySelector('#ty-rival');
  const clockEl = overlay.querySelector('#ty-clock');
  const goalFill = overlay.querySelector('#ty-goalfill');
  const toastEl = overlay.querySelector('#ty-toast');
  const stallsWrap = overlay.querySelector('#ty-stalls');

  function toast(msg, ms = 1100) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms); }

  // ---- state --------------------------------------------------------------
  let gold = cfg.startGold || 60;
  let rival = 0;
  let time = SECS;
  let started = now(), running = true, ended = false;
  const stalls = GOODS.map((g) => ({ ...g, lvl: 1, stock: maxStock(1), maxS: maxStock(1), accrued: 0 }));

  // build a card per stall, cache its dynamic nodes
  stalls.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'ty-stall';
    card.style.setProperty('--tint', s.tint);
    card.innerHTML =
      `<div class="ty-top"><span class="ty-icon">${s.icon}</span>` +
        `<span class="ty-meta"><b>${s.good}</b><small class="ty-lvl">Lv 1</small></span>` +
        `<span class="ty-rate">+0/s</span></div>` +
      `<div class="ty-stockbar"><span class="ty-stockfill"></span><i class="ty-stocktxt">stock</i></div>` +
      `<div class="ty-btns">` +
        `<button class="ty-restock">Restock</button>` +
        `<button class="ty-upg">Upgrade</button>` +
      `</div>`;
    stallsWrap.appendChild(card);
    s.el = {
      card, lvl: card.querySelector('.ty-lvl'), rate: card.querySelector('.ty-rate'),
      fill: card.querySelector('.ty-stockfill'), stxt: card.querySelector('.ty-stocktxt'),
      restock: card.querySelector('.ty-restock'), upg: card.querySelector('.ty-upg'),
    };
    s.el.restock.onclick = () => doRestock(i);
    s.el.upg.onclick = () => doUpgrade(i);
  });

  function doRestock(i) {
    const s = stalls[i]; const c = restockCost(s.lvl);
    if (gold < c) { toast('Not enough gold to restock'); return; }
    gold -= c; s.stock = s.maxS; audio?.play?.('train_done', { rateLimitMs: 80 }); pop(s, '+stock', '#3fae6a');
  }
  function doUpgrade(i) {
    const s = stalls[i]; const c = upgradeCost(s.lvl);
    if (gold < c) { toast('Not enough gold to upgrade'); return; }
    gold -= c; s.lvl++; s.maxS = maxStock(s.lvl); s.stock = s.maxS;
    audio?.play?.('era_up'); pop(s, `Lv ${s.lvl}!`, '#c0851a');
  }
  function pop(s, text, color) {
    const f = document.createElement('div'); f.className = 'ty-pop'; f.textContent = text; f.style.color = color;
    s.el.card.appendChild(f); setTimeout(() => f.remove(), 750);
  }

  // ---- economy tick -------------------------------------------------------
  let coinAcc = 0;
  function tick(dt) {
    time = Math.max(0, SECS - (now() - started) / 1000);

    for (const s of stalls) {
      if (s.stock > 0) {
        const rate = price(s.lvl) * flow(s.lvl);
        const earn = rate * dt;
        gold += earn; s.accrued += earn;
        s.stock = Math.max(0, s.stock - flow(s.lvl) * dt);
      }
    }
    // rivals earn passively, ramping up over the round
    const elapsed = SECS - time;
    rival += (5 + elapsed * 0.12) * dt;

    // occasional coin juice from the best-earning stocked stall
    coinAcc += dt;
    if (coinAcc > 0.5) { coinAcc = 0; const s = stalls.find((x) => x.stock > 0); if (s) pop(s, '🪙', '#e7b53c'); }

    render();
    if (time <= 0) finish(gold >= TARGET);
  }

  function render() {
    goldEl.textContent = Math.floor(gold);
    rivalEl.textContent = Math.floor(rival);
    clockEl.textContent = Math.ceil(time) + 's';
    clockEl.classList.toggle('low', time <= 10);
    goalFill.style.width = Math.min(100, (gold / TARGET) * 100) + '%';
    for (const s of stalls) {
      const rate = s.stock > 0 ? Math.round(price(s.lvl) * flow(s.lvl)) : 0;
      s.el.rate.textContent = `+${rate}/s`;
      s.el.rate.classList.toggle('idle', rate === 0);
      s.el.lvl.textContent = `Lv ${s.lvl}`;
      const frac = s.stock / s.maxS;
      s.el.fill.style.width = (frac * 100) + '%';
      s.el.fill.classList.toggle('low', frac < 0.25);
      s.el.stxt.textContent = s.stock <= 0 ? 'EMPTY — restock!' : `${Math.ceil(s.stock)}/${s.maxS}`;
      s.el.card.classList.toggle('empty', s.stock <= 0);
      const rc = restockCost(s.lvl), uc = upgradeCost(s.lvl);
      s.el.restock.textContent = `Restock ${rc}g`;
      s.el.upg.textContent = `Upgrade ${uc}g`;
      s.el.restock.classList.toggle('off', gold < rc);
      s.el.upg.classList.toggle('off', gold < uc);
    }
  }
  render();
  toast('Restock stalls before they run dry — beat the target before the bell!', 2600);

  // ---- loop ---------------------------------------------------------------
  let last = now();
  function frame() {
    if (!running) return;
    const t = now(); let dt = (t - last) / 1000; last = t; dt = Math.min(0.05, dt);
    if (!ended) tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- finish -------------------------------------------------------------
  function finish(win, quit = false) {
    if (ended) return; ended = true; running = false;
    let stars = 0;
    if (win) { stars = 1; if (gold >= TARGET * 1.4) stars++; if (gold >= rival) stars++; }
    audio?.play?.(win ? 'victory' : 'defeat');
    cleanup();
    onResult?.({ win: quit ? false : win, stars: quit ? 0 : stars, minutes: (SECS - time) / 60, quit });
  }
  function cleanup() { window.removeEventListener('resize', noop); overlay.remove(); }
  function noop() {}

  // debug/test hook
  window.__tycoon = {
    state: () => ({ gold: Math.floor(gold), rival: Math.floor(rival), time: Math.ceil(time), target: TARGET, ended,
      stalls: stalls.map((s) => ({ lvl: s.lvl, stock: Math.ceil(s.stock) })) }),
    restock: doRestock, upgrade: doUpgrade, addGold: (n) => { gold += n; },
    endNow: (w) => finish(w),
  };

  return overlay;
}
