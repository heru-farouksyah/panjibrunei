import factionsData from '../data/factions.json' with { type: 'json' };

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// Opening disclaimer: this is an unfinished, educational project, with an
// apology to anyone it might inadvertently offend. Auto-advances, or tap.
export function showDisclaimer(onContinue) {
  const overlay = el('div', 'dedication', document.body);
  overlay.innerHTML =
    `<div class="dedi-title">PANJI BRUNEI</div>` +
    `<div class="disc-sub">` +
      `This is an <b>unfinished work in progress</b>, created purely for ` +
      `<b>educational purposes</b>.<br><br>` +
      `It is a fan-made, non-commercial project and is not affiliated with, ` +
      `nor endorsed by, any government, institution, or organisation.<br><br>` +
      `We sincerely apologise if any of its content unintentionally offends ` +
      `any party.<br>` +
      `<span class="disc-malay">Maaf sekiranya terdapat sebarang unsur yang ` +
      `menyinggung mana-mana pihak.</span>` +
    `</div>` +
    `<div class="dedi-cont">tap to continue</div>`;

  let done = false;
  const advance = () => {
    if (done) return;
    done = true;
    overlay.classList.add('out');
    setTimeout(() => {
      overlay.remove();
      onContinue();
    }, 900);
  };
  overlay.addEventListener('click', advance);
  overlay.addEventListener('touchstart', (e) => { e.preventDefault(); advance(); }, { passive: false });
  const timer = setTimeout(advance, 7000);
  overlay.addEventListener('click', () => clearTimeout(timer));
  return overlay;
}

// Title screen -> faction select -> match.
export function showTitle(onPlay) {
  const overlay = el('div', 'screen-overlay', document.body);
  el('h1', 'screen-title', overlay, 'PANJI BRUNEI');
  el('div', 'screen-sub', overlay, 'Banners of the river kingdom');
  el('div', 'title-flavor', overlay,
    'From the myths of Awang Semaun to the resistance of Haji Saman — raise your banner, work the river, and unite the kampongs.');
  const btn = el('button', 'start-btn', overlay, 'Play');
  btn.onclick = () => {
    overlay.remove();
    onPlay();
  };
  return overlay;
}

// Victory / defeat with match stats and a military-score graph.
export function showEndScreen(sim, winner, { onReplay, onChangeBanner }) {
  const overlay = el('div', 'screen-overlay end-screen', document.body);
  const won = winner === 0;
  const title = el('h1', 'screen-title', overlay, won ? 'VICTORY' : 'DEFEAT');
  title.style.color = won ? '#c9a23b' : '#a04545';
  const mins = Math.floor(sim.tick / 20 / 60);
  const secs = Math.floor((sim.tick / 20) % 60);
  el('div', 'screen-sub', overlay,
    `${factionsData[sim.players[winner].factionId].name} prevails — ${mins}:${String(secs).padStart(2, '0')}`);

  // stats table
  const table = el('div', 'stats-table', overlay);
  const header = el('div', 'stats-row stats-head', table);
  el('span', null, header, '');
  el('span', null, header, 'You');
  el('span', null, header, 'Enemy');
  const rows = [
    ['Food gathered', (p) => Math.floor(p.gathered.food)],
    ['Timber gathered', (p) => Math.floor(p.gathered.timber)],
    ['Gold gathered', (p) => Math.floor(p.gathered.gold)],
    ['Camphor gathered', (p) => Math.floor(p.gathered.camphor)],
    ['Units lost', (p) => p.unitsLost],
    ['Units destroyed', (p) => p.unitsKilled],
  ];
  for (const [label, fn] of rows) {
    const row = el('div', 'stats-row', table);
    el('span', null, row, label);
    el('span', null, row, String(fn(sim.players[0])));
    el('span', null, row, String(fn(sim.players[1])));
  }

  // military score graph
  el('div', 'graph-label', overlay, 'Military strength over time');
  const canvas = el('canvas', 'score-graph', overlay);
  canvas.width = 520;
  canvas.height = 150;
  drawScoreGraph(canvas, sim);

  const row = el('div', 'screen-row', overlay);
  const replay = el('button', 'start-btn', row, 'Play Again');
  replay.onclick = onReplay;
  const change = el('button', 'diff-btn', row, 'Change Banner');
  change.onclick = onChangeBanner;
  return overlay;
}

function drawScoreGraph(canvas, sim) {
  const ctx = canvas.getContext('2d');
  const hist = sim.statsHistory;
  ctx.fillStyle = 'rgba(10, 12, 8, 0.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (hist.length < 2) return;
  const maxScore = Math.max(20, ...hist.map((h) => Math.max(h.scores[0], h.scores[1])));
  const colors = [
    factionsData[sim.players[0].factionId].color,
    factionsData[sim.players[1].factionId].color,
  ];
  for (let p = 0; p < 2; p++) {
    ctx.strokeStyle = colors[p];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const x = (i / (hist.length - 1)) * (canvas.width - 16) + 8;
      const y = canvas.height - 10 - (hist[i].scores[p] / maxScore) * (canvas.height - 24);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Faction select: 6 banners with name, bonus, hero and ultimate text.
// Returns a DOM overlay; calls onStart(factionId, difficulty) when chosen.
export function showFactionSelect(onStart) {
  const overlay = el('div', 'screen-overlay', document.body);
  el('h1', 'screen-title', overlay, 'PANJI BRUNEI');
  el('div', 'screen-sub', overlay, 'Choose your banner');

  const grid = el('div', 'faction-grid', overlay);
  let chosen = null;
  const cards = new Map();

  for (const [id, f] of Object.entries(factionsData)) {
    if (id.startsWith('_')) continue;
    const card = el('div', 'faction-card', grid);
    const banner = el('div', 'faction-banner', card);
    banner.style.background = f.color;
    el('div', 'faction-name', card, f.name);
    el('div', 'faction-hero', card, f.heroTitle);
    el('div', 'faction-bonus', card, f.bonusText);
    el('div', 'faction-ult', card, `${f.ult.name}: ${f.ult.desc}`);
    card.onclick = () => {
      chosen = id;
      for (const c of cards.values()) c.classList.remove('chosen');
      card.classList.add('chosen');
      startBtn.disabled = false;
    };
    cards.set(id, card);
  }

  const row = el('div', 'screen-row', overlay);
  el('span', 'diff-label', row, 'Difficulty:');
  let difficulty = 'normal';
  const easyBtn = el('button', 'diff-btn', row, 'Easy');
  const normalBtn = el('button', 'diff-btn chosen', row, 'Normal');
  easyBtn.onclick = () => {
    difficulty = 'easy';
    easyBtn.classList.add('chosen');
    normalBtn.classList.remove('chosen');
  };
  normalBtn.onclick = () => {
    difficulty = 'normal';
    normalBtn.classList.add('chosen');
    easyBtn.classList.remove('chosen');
  };

  const startBtn = el('button', 'start-btn', overlay, 'Begin the Campaign');
  startBtn.disabled = true;
  startBtn.onclick = () => {
    overlay.remove();
    onStart(chosen, difficulty);
  };

  return overlay;
}
