// Campaign map + mission-result screens — the engagement loop wrapped around the
// RTS: a journey map (meta-progression), profile XP/level header, daily streak,
// reward chest and campaign pass. Pure DOM/SVG, light-blue gradient to match.
import { MISSIONS } from './campaignData.js';
import {
  levelXp, totalStars, checkDaily, openChest, passClaimable, claimPass, saveProfile, PASS,
} from './profile.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

const cleared = (p, id) => (p.stars[id] || 0) >= 1;
const unlocked = (p, m) => m.prev === null || cleared(p, m.prev);

function modal(html, buttons = [{ label: 'OK' }]) {
  const ov = el('div', 'camp-modal-ov', document.body);
  const card = el('div', 'camp-modal', ov, html);
  const row = el('div', 'modal-btns', card);
  for (const b of buttons) {
    const btn = el('button', 'modal-btn' + (b.primary ? ' primary' : ''), row, b.label);
    btn.onclick = () => { const keep = b.fn?.(); if (!keep) ov.remove(); };
  }
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  return ov;
}

// ---- campaign map --------------------------------------------------------
export function showCampaign(profile, audio, { onMission, onBack, onSettings }) {
  const overlay = el('div', 'screen-overlay campaign', document.body);
  const header = el('div', 'camp-header', overlay);
  const map = el('div', 'camp-map', overlay);
  renderHeader();
  renderMap();

  const daily = checkDaily(profile);
  if (daily) showDaily(daily);

  function renderHeader() {
    const need = levelXp(profile.level);
    const pct = Math.min(100, (profile.xp / need) * 100);
    header.innerHTML =
      `<button class="camp-back" id="cb">‹ Title</button>` +
      `<div class="camp-lvl"><b>Lv ${profile.level}</b><div class="xp-bar"><span style="width:${pct}%"></span></div><small>${profile.xp}/${need} XP</small></div>` +
      `<div class="camp-stars">★ ${totalStars(profile)} / ${MISSIONS.length * 3}</div>` +
      `<div class="camp-actions">` +
        `<button class="camp-btn ${profile.chests > 0 ? 'glow' : ''}" id="cchest">📦 ${profile.chests}</button>` +
        `<button class="camp-btn" id="cpass">🎖 Pass</button>` +
        `<button class="camp-btn" id="cset">⚙</button>` +
      `</div>`;
    header.querySelector('#cb').onclick = () => { overlay.remove(); onBack(); };
    header.querySelector('#cchest').onclick = () => openChestUI();
    header.querySelector('#cpass').onclick = () => showPass();
    header.querySelector('#cset').onclick = () => onSettings?.();
  }

  function renderMap() {
    const roads = MISSIONS.filter((m) => m.prev).map((m) => {
      const a = MISSIONS.find((n) => n.id === m.prev);
      const mx = (a.x + m.x) / 2, my = (a.y + m.y) / 2 - 26;
      return `<path d="M${a.x} ${a.y} Q ${mx} ${my} ${m.x} ${m.y}" class="road ${cleared(profile, m.prev) ? 'road-done' : ''}"/>`;
    }).join('');
    const nodes = MISSIONS.map((m) => {
      const open = unlocked(profile, m);
      const stars = profile.stars[m.id] || 0;
      const starRow = open ? `<g transform="translate(${m.x},${m.y - 34})">${[0, 1, 2].map((i) =>
        `<text x="${(i - 1) * 14}" y="0" class="cstar ${i < stars ? 'on' : ''}">★</text>`).join('')}</g>` : '';
      const marker = open
        ? `<path d="M${m.x - 15} ${m.y - 16} h30 v20 l-15 14 l-15 -14 z" class="cshield"/><text x="${m.x}" y="${m.y + 1}" class="cnode-ic">⚔</text>`
        : `<circle cx="${m.x}" cy="${m.y}" r="15" class="cshield"/><text x="${m.x}" y="${m.y + 5}" class="cnode-ic lock">🔒</text>`;
      return `<g class="cnode ${open ? 'open' : 'locked'}" data-id="${m.id}">${starRow}${marker}` +
        `<text x="${m.x}" y="${m.y + 30}" class="cnode-name">${m.name}</text></g>`;
    }).join('');
    map.innerHTML = `<div class="camp-title">The River Campaign</div>` +
      `<svg viewBox="0 0 760 360" preserveAspectRatio="xMidYMid meet" class="camp-svg">` +
      `<defs><linearGradient id="csky" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#dff1fb"/><stop offset="42%" stop-color="#a9d4ec"/><stop offset="100%" stop-color="#6fa9cf"/></linearGradient>` +
      `<radialGradient id="cglow" cx="50%" cy="36%" r="70%"><stop offset="0%" stop-color="#fff" stop-opacity="0.45"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="760" height="360" fill="url(#csky)"/><rect width="760" height="360" fill="url(#cglow)"/>` +
      `<path d="M-10 300 C 150 280 220 330 380 312 C 540 296 620 340 770 318" class="cmap-river"/>` +
      `${roads}${nodes}</svg>`;
    for (const g of map.querySelectorAll('.cnode.open')) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => {
        const m = MISSIONS.find((x) => x.id === g.dataset.id);
        showBrief(m);
      });
    }
  }

  // Per-mode briefing: mode name, control hint, the three star conditions, CTA.
  const MODES = {
    naval: { mode: 'Naval arena', ctrl: 'Drag to steer · auto-fire',
      stars: ['clear the raiders', 'under 3 min', 'hull above 60%'], cta: 'Set sail!' },
    td: { mode: 'Tower defence', ctrl: 'Tap a tile to plant defenders',
      stars: ['survive every wave', 'kampong above 60%', 'no breach'], cta: 'Hold the line!' },
    tycoon: { mode: 'Market tycoon', ctrl: 'Tap stalls to stock & sell',
      stars: ['beat the gold target', 'beat it early', 'out-earn every rival'], cta: 'Open the tamu!' },
    explore: { mode: 'Village adventure', ctrl: 'Left side to move · tap to talk',
      stars: ['collect all 5 baskets', 'finish under 2½ min', 'no bicycle bumps'], cta: 'Come ashore!' },
    climb: { mode: 'Platform climber', ctrl: 'Hold left / right to steer',
      stars: ['reach the Tamu', 'collect 30 coins', 'climb under 1½ min'], cta: 'Start climbing!' },
  };
  function showBrief(m) {
    const stars = profile.stars[m.id] || 0;
    const M = MODES[m.mode];
    const meta = M
      ? `<div class="brief-row"><span>Mode</span><b>${M.mode}</b></div>` +
        `<div class="brief-row"><span>Controls</span><b>${M.ctrl}</b></div>` +
        `<div class="brief-stars">★ ${M.stars.join(' &nbsp; ★ ')}</div>`
      : `<div class="brief-row"><span>Banner</span><b>${m.faction}</b></div>` +
        `<div class="brief-row"><span>Difficulty</span><b>${m.difficulty}</b></div>` +
        `<div class="brief-stars">★ win &nbsp; ★ under ${m.parMin} min &nbsp; ★ no building lost</div>`;
    modal(`<div class="m-title">${m.name}</div><div class="m-sub">${m.blurb}</div>` + meta +
      `<div class="m-sub small">Stars earned: ${stars}/3</div>`,
      [{ label: M ? M.cta : 'March!', primary: true, fn: () => { overlay.remove(); onMission(m); } }, { label: 'Back' }]);
    audio?.play?.('ui_click');
  }

  function showDaily(d) {
    const rw = `+${d.xp || 0} XP${d.chest ? ` · +${d.chest} 📦` : ''}`;
    modal(`<div class="m-title">Daily Reward</div><div class="m-big">Day ${d.streak} streak 🔥</div>` +
      `<div class="m-reward">${rw}</div><div class="m-sub">Come back tomorrow to keep the streak.</div>`);
    audio?.play?.('era_up');
    renderHeader();
  }

  function openChestUI() {
    if (profile.chests <= 0) { modal(`<div class="m-title">No chests</div><div class="m-sub">Win missions and daily streaks to earn reward chests.</div>`); return; }
    const win = openChest(profile);
    const txt = win.kind === 'xp' ? `+${win.amount} XP` : `+${win.amount} 📦`;
    const ov = modal(`<div class="m-title">Reward Chest</div><div class="m-chest pop">🎁</div>` +
      `<div class="m-prize ${win.rarity}">${txt}</div><div class="m-prize-r ${win.rarity}">${win.rarity}</div>`);
    audio?.play?.(win.rarity === 'legendary' ? 'victory' : 'train_done');
    renderHeader();
  }

  function showPass() {
    const rows = passClaimable(profile).map((m) => {
      const rw = (m.reward.xp ? `+${m.reward.xp} XP ` : '') + (m.reward.chest ? `+${m.reward.chest}📦` : '');
      const st = m.claimed ? '<span class="pass-claimed">claimed</span>'
        : m.unlocked ? `<button class="pass-claim" data-i="${m.i}">Claim</button>` : `<span class="pass-lock">${m.xp} xp</span>`;
      return `<div class="pass-row ${m.unlocked ? 'on' : ''}"><span>${rw}</span>${st}</div>`;
    }).join('');
    const ov = modal(`<div class="m-title">Campaign Pass</div><div class="m-sub">Pass XP: ${profile.pass.xp}</div><div class="pass-track">${rows}</div>`, [{ label: 'Close' }]);
    for (const b of ov.querySelectorAll('.pass-claim')) {
      b.onclick = () => { if (claimPass(profile, +b.dataset.i)) { audio?.play?.('train_done'); ov.remove(); renderHeader(); showPass(); } };
    }
  }

  return overlay;
}

// ---- mission result (the core reward moment) -----------------------------
export function showMissionResult(profile, audio, { win, stars, mission, xpResult, gotChest, onContinue }) {
  const overlay = el('div', 'screen-overlay result', document.body);
  const leveled = xpResult?.levels?.length ? `<div class="res-level">★ Level ${xpResult.levels[xpResult.levels.length - 1]}!</div>` : '';
  const unlocks = (xpResult?.unlocks || []).map((u) => `Unlocked: ${u.name}`).join(' · ');
  overlay.innerHTML =
    `<div class="res-card">` +
      `<div class="res-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</div>` +
      `<div class="res-mission">${mission.name}</div>` +
      `<div class="res-stars">${[0, 1, 2].map((i) => `<span class="res-star ${i < stars ? 'on' : ''}" style="--d:${i * 0.22}s">★</span>`).join('')}</div>` +
      `<div class="res-xp">+${xpResult?.gained || 0} XP</div>` +
      leveled +
      (unlocks ? `<div class="res-unlock">${unlocks}</div>` : '') +
      (gotChest ? `<div class="res-chest">📦 Reward chest earned — open it on the map</div>` : '') +
      `<button class="start-btn" id="rcont">Continue</button>` +
    `</div>`;
  audio?.play?.(win ? 'victory' : 'defeat');
  overlay.querySelector('#rcont').onclick = () => { overlay.remove(); onContinue(); };
  return overlay;
}
