import factionsData from '../data/factions.json' with { type: 'json' };
import { iconSVG } from './icons.js';
import { THEMES, THEME_IDS, DEFAULT_THEME } from './themes.js';
import { MAP_SIZES } from '../sim/constants.js';
import { getGraphics, setGraphics, GFX_LEVELS, getControlGroups, setControlGroups } from './settings.js';
import { heroPortraitSVG } from './portraits.js';

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
    `<div class="disc-credit">Created by <b>Blooming Barakah</b> · 2026<br>Heru &amp; Hasanah</div>` +
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

// A 4-slide how-to-play tutorial shown over the (paused) match. A Skip button
// sits at the bottom-left. Calls onDone() when finished or skipped.
// Each slide has a desktop `body` (mouse + keyboard) and a `touchBody` shown on
// phones/tablets, where there is no right-click or keyboard.
const TUTORIAL_SLIDES = [
  {
    icon: 'penduduk', title: '1 · Gather & Pile',
    body: 'Left-click a <b>Penduduk</b> (villager), then right-click a tree, ' +
      'sago palm, gold rock, camphor grove or your farm to gather. They carry ' +
      'the load back to your Istana on their own. Build more villagers and ' +
      'houses to grow your kampong.',
    touchBody: '<b>Tap</b> a <b>Penduduk</b> (villager), tap a tree, sago palm, ' +
      'gold rock, camphor grove or your farm to aim, then tap the <b>✓</b> bubble ' +
      'to send them gathering. (Dragging just scrolls the map.) They carry the ' +
      'load back to your Istana on their own.',
  },
  {
    icon: 'kubu', title: '2 · Protect',
    body: 'Select a villager and use the build menu to raise <b>Pagar</b> walls ' +
      'and <b>Kubu</b> watchtowers around your base and the river fords. ' +
      'Towers fire on any enemy that comes close — your first line of defence.',
    touchBody: '<b>Tap</b> a villager, then pick a building from the bottom ' +
      'card to raise <b>Pagar</b> walls and <b>Kubu</b> watchtowers around your ' +
      'base and the river fords. Tap the map to place it. Towers fire on any ' +
      'enemy that comes close — your first line of defence.',
  },
  {
    icon: 'pahlawan_kampilan', title: '3 · Attack',
    body: 'Drag a box to select your army, then right-click an enemy to attack, ' +
      'or press <b>A</b> then click to attack-move. <b>Kampilan</b> swordsmen and ' +
      '<b>Pemanah</b> archers fight units; your <b>Lela</b> destroyer smashes ' +
      'buildings. Mix them — archers beat infantry, skirmishers beat archers.',
    touchBody: '<b>Long-press</b> then drag a box over your army to select it. ' +
      'Tap a target or spot, then tap the <b>✓</b> bubble to commit the order ' +
      '(dragging just scrolls). <b>Kampilan</b> swordsmen and <b>Pemanah</b> ' +
      'archers fight units; your <b>Lela</b> destroyer smashes buildings. Mix ' +
      'them — archers beat infantry.',
  },
  {
    icon: 'hero', title: '4 · Win',
    body: 'March on the enemy kingdom and <b>slay their Boss</b> — or <b>raze ' +
      'their Istana</b> — to win. Defend your own Istana at all costs. ' +
      'Good luck, Panglima!',
  },
];

export function showTutorial(onDone) {
  const overlay = el('div', 'tutorial-overlay', document.body);
  const card = el('div', 'tut-card', overlay);
  let i = 0;

  const dots = TUTORIAL_SLIDES.map(() => '<span class="tut-dot"></span>').join('');
  const touch = document.body.classList.contains('touch');
  const render = () => {
    const s = TUTORIAL_SLIDES[i];
    const last = i === TUTORIAL_SLIDES.length - 1;
    card.innerHTML =
      `<div class="tut-icon">${iconSVG(s.icon, 52)}</div>` +
      `<div class="tut-title">${s.title}</div>` +
      `<div class="tut-body">${touch && s.touchBody ? s.touchBody : s.body}</div>` +
      `<div class="tut-dots">${dots}</div>` +
      `<div class="tut-nav">` +
        `<button class="tut-skip">Skip</button>` +
        `<button class="tut-next">${last ? 'Begin!' : 'Next ›'}</button>` +
      `</div>`;
    card.querySelectorAll('.tut-dot')[i]?.classList.add('on');
    card.querySelector('.tut-skip').onclick = finish;
    card.querySelector('.tut-next').onclick = () => {
      if (last) finish();
      else { i++; render(); }
    };
  };
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    overlay.classList.add('out');
    setTimeout(() => { overlay.remove(); onDone(); }, 300);
  };
  render();
  return overlay;
}

// A portrait-orientation nag for phones: asks the player to rotate to
// landscape. Hidden automatically once the device is wide enough.
export function showRotatePrompt() {
  if (document.getElementById('rotate-prompt')) return;
  const el2 = document.createElement('div');
  el2.id = 'rotate-prompt';
  el2.innerHTML =
    `<div class="rot-icon">⟳</div>` +
    `<div class="rot-text">Please rotate your device to <b>landscape</b><br>for the best view.</div>`;
  document.body.appendChild(el2);
  const check = () => {
    const portrait = window.innerHeight > window.innerWidth;
    const touch = document.body.classList.contains('touch');
    el2.style.display = touch && portrait ? 'flex' : 'none';
  };
  check();
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
}

// Title screen -> faction select -> match.
export function showTitle(onSkirmish, { onCampaign = null, onResume = null, onSettings = null } = {}) {
  const overlay = el('div', 'screen-overlay', document.body);
  el('h1', 'screen-title', overlay, 'PANJI BRUNEI');
  el('div', 'screen-sub', overlay, 'Banners of the river kingdom');
  el('div', 'title-flavor', overlay,
    'From the myths of Awang Semaun to the resistance of Haji Saman — raise your banner, work the river, and unite the kampongs.');

  // Campaign is the headline (the journey/progression loop); Skirmish is a free match.
  if (onCampaign) {
    const camp = el('button', 'start-btn', overlay, '🗺 Campaign');
    camp.onclick = () => { overlay.remove(); onCampaign(); };
  }
  const skirmish = el('button', onCampaign ? 'diff-btn' : 'start-btn', overlay, onCampaign ? 'Skirmish (free match)' : 'Play');
  skirmish.onclick = () => { overlay.remove(); onSkirmish(); };

  const row = el('div', 'screen-row', overlay);
  if (onResume) {
    const resume = el('button', 'diff-btn', row, '▸ Resume last game');
    resume.onclick = () => { overlay.remove(); onResume(); };
  }
  if (onSettings) {
    const settings = el('button', 'diff-btn', row, '⚙ Settings');
    settings.onclick = () => onSettings();
  }
  return overlay;
}

// Settings overlay: audio volumes (wired live to the AudioManager), graphics
// quality preset (consumed by the renderer), and a controls reference.
export function showSettings(audio, { onClose } = {}) {
  const overlay = el('div', 'screen-overlay settings-screen', document.body);
  el('h1', 'screen-title', overlay, 'Settings');
  const panel = el('div', 'settings-panel', overlay);

  const slider = (label, get, set) => {
    const rowEl = el('div', 'settings-row', panel);
    el('span', 'settings-label', rowEl, label);
    const input = el('input', 'settings-slider', rowEl);
    input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(Math.round(get() * 100));
    const val = el('span', 'settings-val', rowEl, `${input.value}%`);
    input.oninput = () => { set(input.value / 100); val.textContent = `${input.value}%`; };
    return input;
  };

  if (audio) {
    slider('Master volume', () => audio.vol.master, (v) => audio.setVolume('master', v));
    slider('Music', () => audio.vol.music, (v) => audio.setVolume('music', v));
    slider('Sound effects', () => audio.vol.sfx, (v) => audio.setVolume('sfx', v));
    const muteRow = el('div', 'settings-row', panel);
    el('span', 'settings-label', muteRow, 'Mute all');
    const mute = el('button', 'diff-btn' + (audio.muted ? ' chosen' : ''), muteRow, audio.muted ? 'Muted' : 'On');
    mute.onclick = () => { audio.setMuted(!audio.muted); mute.classList.toggle('chosen', audio.muted); mute.textContent = audio.muted ? 'Muted' : 'On'; };
  }

  // graphics quality
  const gfxRow = el('div', 'settings-row', panel);
  el('span', 'settings-label', gfxRow, 'Graphics quality');
  const gfxBtns = {};
  let current = getGraphics();
  for (const lvl of GFX_LEVELS) {
    const b = el('button', 'diff-btn' + (lvl === current ? ' chosen' : ''), gfxRow, lvl[0].toUpperCase() + lvl.slice(1));
    b.onclick = () => {
      current = lvl; setGraphics(lvl);
      for (const k of GFX_LEVELS) gfxBtns[k].classList.toggle('chosen', k === lvl);
      window.dispatchEvent(new CustomEvent('panji-gfx', { detail: lvl }));
    };
    gfxBtns[lvl] = b;
  }
  el('div', 'settings-hint', panel, 'Graphics changes apply to the next match (and lighting now).');

  // on-screen control-group bar (1–5) — touch players can hide it to declutter
  const cgRow = el('div', 'settings-row', panel);
  el('span', 'settings-label', cgRow, 'Control groups (1–5)');
  let cgOn = getControlGroups();
  const cg = el('button', 'diff-btn' + (cgOn ? ' chosen' : ''), cgRow, cgOn ? 'Shown' : 'Hidden');
  cg.onclick = () => {
    cgOn = !cgOn; setControlGroups(cgOn);
    cg.classList.toggle('chosen', cgOn); cg.textContent = cgOn ? 'Shown' : 'Hidden';
    document.body.classList.toggle('hide-groups', !cgOn);
  };
  el('div', 'settings-hint', panel, 'Tap a number to recall a saved squad; long-press to assign the current selection.');

  // controls reference
  const help = el('div', 'settings-help', panel);
  el('div', 'settings-subhead', help, 'Controls');
  const controls = [
    ['Left-drag', 'select units'], ['Right-click', 'move / attack / gather'],
    ['WASD / edge', 'pan camera'], ['Wheel / pinch', 'zoom'],
    ['M', 'mute'], ['F5', 'save game'], ['Space', 'pause'],
  ];
  for (const [k, d] of controls) {
    const r = el('div', 'settings-ctl', help);
    el('kbd', null, r, k); el('span', null, r, d);
  }

  const close = el('button', 'start-btn', overlay, 'Done');
  close.onclick = () => { overlay.remove(); onClose?.(); };
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
// Themed loading screen shown while a match's world + assets build, so there's
// no blank flash. Reused (one element); hideLoading fades it out.
export function showLoading(text = 'Preparing the kampong…') {
  let overlay = document.getElementById('loading-screen');
  if (!overlay) {
    overlay = el('div', 'screen-overlay loading-screen', document.body);
    overlay.id = 'loading-screen';
  }
  overlay.classList.remove('fade-out');
  overlay.innerHTML = '';
  el('h1', 'screen-title', overlay, 'PANJI BRUNEI');
  el('div', 'loading-spinner', overlay);
  el('div', 'screen-sub', overlay, text);
  return overlay;
}

export function hideLoading() {
  const o = document.getElementById('loading-screen');
  if (!o) return;
  o.classList.add('fade-out');
  setTimeout(() => o.remove(), 450);
}

// Returns a DOM overlay; calls onStart(factionId, difficulty, themeId, seed) when chosen.
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
    // hero portrait: a real image if the faction provides one, else a
    // procedural SVG bust tinted by the faction colour (drop-in, no code change)
    if (f.portrait) {
      banner.innerHTML = `<img class="hero-portrait-img" src="${f.portrait}" alt="">`;
    } else {
      banner.innerHTML = heroPortraitSVG(id, f.color);
    }
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
  const diffBtns = {};
  for (const [id, label] of [
    ['easy', 'Easy · 2 kingdoms'],
    ['normal', 'Normal · 4 kingdoms'],
    ['hard', 'Hard · early rush'],
  ]) {
    const b = el('button', 'diff-btn' + (id === difficulty ? ' chosen' : ''), row, label);
    b.onclick = () => {
      difficulty = id;
      for (const k in diffBtns) diffBtns[k].classList.toggle('chosen', k === id);
    };
    diffBtns[id] = b;
  }

  // Environment colour theme: recolours land, water, sky, fog and lighting.
  const envRow = el('div', 'screen-row env-row', overlay);
  el('span', 'diff-label', envRow, 'Environment:');
  let themeId = DEFAULT_THEME;
  const themeBtns = new Map();
  for (const id of THEME_IDS) {
    const th = THEMES[id];
    const btn = el('button', 'env-btn' + (id === themeId ? ' chosen' : ''), envRow);
    // a little two-tone swatch: land over water, capped by the sky horizon
    const sw = el('span', 'env-swatch', btn);
    sw.style.background =
      `linear-gradient(160deg, #${th.sky.horizon.toString(16).padStart(6, '0')} 0%,` +
      ` #${th.terrain.grass.toString(16).padStart(6, '0')} 45%,` +
      ` #${th.water.shallow.toString(16).padStart(6, '0')} 100%)`;
    const label = el('span', 'env-label', btn);
    el('span', 'env-name', label, th.name);
    el('span', 'env-blurb', label, th.blurb);
    btn.onclick = () => {
      themeId = id;
      for (const b of themeBtns.values()) b.classList.remove('chosen');
      btn.classList.add('chosen');
    };
    themeBtns.set(id, btn);
  }

  // Map size: small / medium / large grid.
  const sizeRow = el('div', 'screen-row', overlay);
  el('span', 'diff-label', sizeRow, 'Map size:');
  let mapSize = MAP_SIZES.medium;
  const sizeBtns = {};
  for (const [label, val] of [['Small', MAP_SIZES.small], ['Medium', MAP_SIZES.medium], ['Large', MAP_SIZES.large]]) {
    const b = el('button', 'diff-btn' + (val === mapSize ? ' chosen' : ''), sizeRow, `${label} · ${val}²`);
    b.onclick = () => {
      mapSize = val;
      for (const k in sizeBtns) sizeBtns[k].classList.toggle('chosen', sizeBtns[k] === b);
    };
    sizeBtns[label] = b;
  }

  // Map: a seed gives a reproducible world. Re-roll for a fresh map, or type a
  // seed to share/replay one.
  const mapRow = el('div', 'screen-row', overlay);
  el('span', 'diff-label', mapRow, 'Map seed:');
  let seed = (Math.random() * 1e9) | 0;
  const seedInput = el('input', 'seed-input', mapRow);
  seedInput.type = 'text';
  seedInput.value = String(seed);
  seedInput.oninput = () => {
    const n = parseInt(seedInput.value.replace(/[^0-9]/g, ''), 10);
    seed = Number.isFinite(n) ? n : seed;
  };
  const reroll = el('button', 'diff-btn', mapRow, '🎲 New map');
  reroll.onclick = () => { seed = (Math.random() * 1e9) | 0; seedInput.value = String(seed); };

  const startBtn = el('button', 'start-btn', overlay, 'Begin the Campaign');
  startBtn.disabled = true;
  startBtn.onclick = () => {
    overlay.remove();
    onStart(chosen, difficulty, themeId, seed, mapSize);
  };

  return overlay;
}
