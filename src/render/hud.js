import { ERAS, MONUMENT_TICKS, MARKET_RATES } from '../sim/sim.js';
import { iconSVG } from './icons.js';
import factionsData from '../data/factions.json' with { type: 'json' };

const HOTKEYS_TEXT = `HOTKEYS  (F1 to close)

WIN: slay the enemy Boss, or destroy their Istana.

Left click / drag      select units
Shift + click          add to selection
Right click            move / gather / attack / repair
Ctrl + 1-5             set control group
1-5                    recall control group
A + click              attack-move
S                      stop
Z / X                  aggressive / hold stance
Q                      hero ultimate (hero selected)
.                      next idle villager
F1                     this help     F3  debug overlay
M                      mute          Esc cancel / deselect
WASD / arrows / edges  pan camera    wheel  zoom

Touch:  tap = select / command,  drag = pan,
        pinch = zoom,  double-tap unit = select all of type`;

const RES_META = [
  ['food', 'Food', '#d8c06a'],
  ['timber', 'Timber', '#b5895a'],
  ['gold', 'Gold', '#e6bb3e'],
  ['camphor', 'Camphor', '#a9c489'],
];

const BUILD_ORDER = [
  'rumah_kampong', 'lumbung', 'kebun', 'kedai_runcit', 'balai_pahlawan',
  'pangkalan', 'gerai_tukang', 'kubu', 'pagar', 'surau', 'balai_bomba',
  'panggung_panji', 'mahkota_monument',
];

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

// Inline mini resource-cost line: small icon + number per resource.
function costHTML(cost) {
  return Object.entries(cost)
    .map(([r, v]) => `<span class="ck"><span class="ck-i ck-${r}">${iconSVG(r, 13)}</span>${v}</span>`)
    .join('');
}

function costText(cost) {
  return Object.entries(cost)
    .map(([r, v]) => `${v} ${r[0].toUpperCase()}${r.slice(1)}`)
    .join(', ');
}

// DOM game HUD: carved top resource bar + bottom portrait/command panel +
// ghost building placement. Reads sim state; issues sim commands.
export class HUD {
  constructor(sim, gameRenderer, input, cameraRig) {
    this.sim = sim;
    this.gr = gameRenderer;
    this.input = input;
    this.rig = cameraRig;
    this.placing = null;
    this.mouse = { x: 0, y: 0 };
    this.idleCycle = 0;

    // --- top resource bar ---
    this.top = el('div', null, document.body);
    this.top.id = 'topbar';
    this.resEls = {};
    this.resCells = {};
    this.lastRes = {};
    for (const [key, label, color] of RES_META) {
      const cell = el('div', 'res', this.top);
      cell.title = label;
      const ic = el('span', `res-ic res-${key}`, cell, iconSVG(key, 18));
      ic.style.color = color;
      this.resEls[key] = el('span', 'res-val', cell, '0');
      this.resCells[key] = cell;
    }
    const popCell = el('div', 'res', this.top);
    popCell.title = 'Population';
    el('span', 'res-ic res-pop', popCell, iconSVG('pop', 18));
    this.popEl = el('span', 'res-val', popCell, '0/0');
    this.eraEl = el('div', 'era-chip', this.top, 'Kampong Era');

    // --- bottom command panel ---
    this.panel = el('div', null, document.body);
    this.panel.id = 'panel';
    this.portrait = el('div', 'portrait', this.panel);
    this.selInfo = el('div', 'sel-info', this.panel);
    this.actions = el('div', 'actions', this.panel);
    this.panel.style.display = 'none';

    // floating tooltip for command tiles
    this.tip = el('div', null, document.body);
    this.tip.id = 'tooltip';
    this.tip.style.display = 'none';

    this.monumentEl = el('div', null, document.body);
    this.monumentEl.id = 'monument-banner';
    this.monumentEl.style.display = 'none';

    this.idleBtn = el('button', null, document.body,
      `<span class="ic-wrap">${iconSVG('penduduk', 18)}</span><span class="idle-n">0</span>`);
    this.idleBtn.id = 'idle-btn';
    this.idleBtn.title = 'Cycle idle villagers (.)';
    this.idleBtn.onclick = () => this.cycleIdleVillager();

    this.helpEl = el('pre', null, document.body, HOTKEYS_TEXT);
    this.helpEl.id = 'hotkey-help';
    this.helpEl.style.display = 'none';
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        this.helpEl.style.display = this.helpEl.style.display === 'none' ? 'block' : 'none';
      } else if (e.code === 'Period' && e.target.tagName !== 'INPUT') {
        this.cycleIdleVillager();
      }
    });

    input.onSelectionChange = () => this.refreshPanel();
    input.onModeChange = (mode) => {
      if (mode !== 'place' && this.placing) {
        this.placing = null;
        this.gr.buildings.hideGhost();
      }
    };

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.placing) this.updateGhost();
    });

    setInterval(() => {
      this.refreshTop();
      this.refreshPanel(true);
    }, 200);

    // opening objective hint
    this.toast = el('div', null, document.body);
    this.toast.id = 'toast';
    this.toast.style.display = 'none';
    setTimeout(() => this.showToast(
      '⚔️ Slay the enemy Boss — or raze their Istana — to win.', 6500), 1400);
  }

  showToast(html, ms = 4000) {
    this.toast.innerHTML = html;
    this.toast.style.display = 'block';
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.toast.style.display = 'none'; }, ms);
  }

  refreshTop() {
    const p = this.sim.players[0];
    for (const [key] of RES_META) {
      const v = Math.floor(p.resources[key] ?? 0);
      const cap = p.resCap ? p.resCap[key] : 0;
      // show "value / cap"; flag when storage is full (gathering is wasted)
      this.resEls[key].textContent = cap ? `${v}/${cap}` : `${v}`;
      const cell = this.resCells[key];
      cell.classList.toggle('full', cap > 0 && v >= cap - 1);
      // pulse the cell when the value jumps up noticeably
      if (this.lastRes[key] !== undefined && v - this.lastRes[key] >= 3) {
        cell.classList.remove('bump');
        void cell.offsetWidth; // retrigger the keyframe
        cell.classList.add('bump');
      }
      this.lastRes[key] = v;
    }
    this.popEl.textContent = `${p.pop}/${p.popCap}`;
    this.popEl.classList.toggle('capped', p.pop >= p.popCap);
    let era = ERAS[p.era - 1].name;
    if (p.eraResearch) {
      const pct = Math.round((1 - p.eraResearch.ticksLeft / p.eraResearch.total) * 100);
      era += ` → ${ERAS[p.era].name} ${pct}%`;
    }
    this.eraEl.textContent = era;

    const idle = this.idleVillagers().length;
    this.idleBtn.querySelector('.idle-n').textContent = idle;
    this.idleBtn.classList.toggle('has-idle', idle > 0);

    let banner = '';
    for (const player of this.sim.players) {
      if (player.monumentSince >= 0) {
        const left = Math.max(0, MONUMENT_TICKS - (this.sim.tick - player.monumentSince));
        const m = Math.floor(left / 20 / 60);
        const s = Math.floor((left / 20) % 60);
        const who = player.index === 0 ? 'Your' : 'Enemy';
        banner += `${who} Mahkota Monument: ${m}:${String(s).padStart(2, '0')}  `;
      }
    }
    this.monumentEl.textContent = banner.trim();
    this.monumentEl.style.display = banner ? 'block' : 'none';
  }

  idleVillagers() {
    const out = [];
    this.sim.pool.forEach((e) => {
      if (e.kind === 'unit' && e.owner === 0 && e.proto.tags.includes('villager') &&
          e.state === 'idle' && !e.order) {
        out.push(e);
      }
    });
    return out;
  }

  cycleIdleVillager() {
    const idle = this.idleVillagers();
    if (idle.length === 0) return;
    const pick = idle[this.idleCycle++ % idle.length];
    this.input.setSelection([pick.id]);
    this.rig.target.x = pick.x;
    this.rig.target.z = pick.z;
  }

  selectionEntities() {
    const out = [];
    for (const id of this.input.selectionIds()) {
      const e = this.sim.pool.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  factionColor(owner) {
    const f = this.sim.players[owner]?.factionId;
    return factionsData[f]?.color ?? '#c9a23b';
  }

  refreshPanel(throttled = false) {
    const ents = this.selectionEntities();
    if (ents.length === 0) {
      this.panel.style.display = 'none';
      this.lastKey = '';
      this.hideTip();
      return;
    }
    this.panel.style.display = 'flex';

    const key = ents.map((e) => e.id).join(',');
    this.renderPortrait(ents);
    this.selInfo.innerHTML = this.renderInfo(ents);
    if (throttled && key === this.lastKey) return;
    const isNew = key !== this.lastKey;
    this.lastKey = key;
    this.renderActions(ents);
    if (isNew) {
      this.panel.classList.remove('pop');
      void this.panel.offsetWidth;
      this.panel.classList.add('pop');
    }
  }

  renderPortrait(ents) {
    const e = ents[0];
    const color = this.factionColor(e.owner);
    const hpPct = Math.max(0, Math.round((e.hp / e.maxHp) * 100));
    const icon = e.proto.hero ? 'hero' : e.protoId;
    this.portrait.innerHTML =
      `<div class="por-frame" style="--fc:${color}">${iconSVG(icon, 46)}</div>` +
      `<div class="por-hp"><div class="por-hp-fill" style="width:${hpPct}%"></div></div>`;
    if (ents.length > 1) {
      this.portrait.querySelector('.por-frame').insertAdjacentHTML(
        'beforeend', `<span class="por-count">${ents.length}</span>`);
    }
  }

  renderInfo(ents) {
    if (ents.length === 1) {
      const e = ents[0];
      let extra = '';
      if (e.kind === 'unit' && e.atk > 0) {
        extra += `<div class="stat-row"><span>Attack</span><b>${e.atk}${e.range > 0 ? ` (rng ${e.range})` : ''}</b></div>`;
      }
      if (e.kind === 'unit' && e.carryAmount >= 1) {
        extra += `<div class="sub">Carrying ${Math.floor(e.carryAmount)} ${e.carryType}</div>`;
      }
      if (e.kind === 'building' && !e.complete) {
        const pct = Math.round((e.buildProgress / e.proto.buildTicks) * 100);
        extra += `<div class="sub building">Constructing… ${pct}%</div>`;
      }
      if (e.kind === 'building' && e.techQueue) {
        const t = e.techQueue;
        const pct = Math.round((1 - t.ticksLeft / t.total) * 100);
        extra += `<div class="sub">Researching ${t.kind === 'era' ? 'next era' : t.tech.name} ${pct}%</div>`;
      }
      if (e.kind === 'building' && e.queue?.length > 0) {
        const q = e.queue[0];
        const pct = Math.round((1 - q.ticksLeft / q.total) * 100);
        extra += `<div class="sub">Training ${this.sim.protos.units[q.protoId].name} ${pct}% · queue ${e.queue.length}</div>`;
      }
      if (e.kind === 'building' && e.complete) {
        const res = this.sim.residentsOf(e);
        if (res) {
          const low = res.now < res.max;
          extra += `<div class="sub${low ? ' building' : ''}">🏠 Residents ${res.now} / ${res.max}</div>`;
        }
      }
      if (e.kind === 'building' && e.demolishing) {
        extra += `<div class="sub building">Tearing down…</div>`;
      }
      return `<div class="sel-name">${e.proto.name}</div>
        <div class="sub">${Math.ceil(e.hp)} / ${e.maxHp} HP${e.armor ? ` · ${e.armor} armor` : ''}</div>${extra}`;
    }
    const counts = {};
    for (const e of ents) counts[e.proto.name] = (counts[e.proto.name] ?? 0) + 1;
    const list = Object.entries(counts).map(([n, c]) => `${c}× ${n}`).join('<br>');
    return `<div class="sel-name">${ents.length} selected</div><div class="sub">${list}</div>`;
  }

  // A command tile: icon + name + cost line, with hover tooltip.
  tile(parent, { icon, name, cost, sub, desc, disabled, cls, onClick }) {
    const btn = el('button', `cmd-tile${cls ? ' ' + cls : ''}`, parent);
    btn.disabled = !!disabled;
    btn.innerHTML =
      `<span class="cmd-ic">${iconSVG(icon, 26)}</span>` +
      `<span class="cmd-name">${name}</span>` +
      (cost ? `<span class="cmd-cost">${costHTML(cost)}</span>` : sub ? `<span class="cmd-cost">${sub}</span>` : '');
    const tipText = desc || (cost ? costText(cost) : '');
    if (tipText) {
      btn.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.showTip(btn, `<b>${name}</b><br>${tipText}`);
      });
      btn.addEventListener('pointerleave', () => this.hideTip());
    }
    if (onClick) {
      btn.onclick = () => {
        this.hideTip();
        onClick();
      };
    }
    return btn;
  }

  showTip(anchor, html) {
    this.tip.innerHTML = html;
    this.tip.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const tr = this.tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(6, Math.min(window.innerWidth - tr.width - 6, left));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${r.top - tr.height - 8}px`;
  }

  hideTip() {
    this.tip.style.display = 'none';
  }

  renderActions(ents) {
    this.actions.innerHTML = '';
    const sim = this.sim;
    const player = sim.players[0];
    const mine = ents.filter((e) => e.owner === 0);
    if (mine.length === 0) return;

    const grid = el('div', 'cmd-grid', this.actions);

    // hero ultimate
    const hero = mine.find((e) => e.kind === 'unit' && e.proto.hero);
    if (hero) {
      const ult = player.faction.ult;
      const cd = Math.ceil(player.ultCooldown / 20);
      this.tile(grid, {
        icon: 'ult', name: ult.name, sub: cd > 0 ? `${cd}s` : '[Q]',
        desc: ult.desc, disabled: cd > 0, cls: cd > 0 ? 'ult-tile' : 'ult-tile ready',
        onClick: () => sim.cmdUltimate(0),
      });
    }

    // villager build menu
    const villagers = mine.filter((e) => e.kind === 'unit' && e.proto.tags.includes('villager'));
    if (villagers.length > 0) {
      for (const protoId of BUILD_ORDER) {
        const p = sim.protos.buildings[protoId];
        const cost = sim.costOf(0, p);
        const locked = p.era > player.era || !sim.canAfford(0, cost);
        this.tile(grid, {
          icon: protoId, name: p.name, cost,
          desc: `${p.era > 1 ? ERAS[p.era - 1].name + ' · ' : ''}place this building`,
          disabled: locked,
          onClick: () => this.startPlacement(protoId),
        });
      }
    }

    // building command card (train / research / summon)
    const building = mine.find((e) => e.kind === 'building' && e.complete);
    if (building && mine.length === 1) {
      for (const protoId of building.proto.trains) {
        const p = sim.protos.units[protoId];
        const cost = sim.costOf(0, p);
        this.tile(grid, {
          icon: protoId, name: p.name, cost,
          desc: `${p.pop} pop${p.era > 1 ? ` · ${ERAS[p.era - 1].name}` : ''} · train`,
          disabled: p.era > player.era || !sim.canAfford(0, cost),
          onClick: () => { sim.cmdTrain(building.id, protoId); this.refreshTop(); },
        });
      }
      // Kedai Runcit: buy/sell resources for gold (mercenaries are the
      // building's `trains`, shown above)
      if (building.proto.market) {
        for (const [res, rate] of Object.entries(MARKET_RATES)) {
          const earn = Math.round(rate.sell * rate.batch);
          this.tile(grid, {
            icon: res, name: `Sell ${rate.batch}`, sub: `+${earn}g`,
            desc: `Sell ${rate.batch} ${res} → ${earn} gold`,
            disabled: (player.resources[res] ?? 0) < rate.batch,
            cls: 'sell-tile',
            onClick: () => { sim.marketTrade(building.id, res, 'sell'); this.refreshTop(); },
          });
          const cost = Math.round(rate.buy * rate.batch);
          this.tile(grid, {
            icon: res, name: `Buy ${rate.batch}`, sub: `-${cost}g`,
            desc: `Buy ${rate.batch} ${res} for ${cost} gold`,
            disabled: (player.resources.gold ?? 0) < cost,
            cls: 'buy-tile',
            onClick: () => { sim.marketTrade(building.id, res, 'buy'); this.refreshTop(); },
          });
        }
      }
      if (building.protoId === 'panggung_panji') {
        const heroProto = sim.protos.units[player.faction.hero];
        const cost = sim.costOf(0, heroProto);
        let sub = '';
        let disabled = false;
        if (player.heroAlive) { sub = 'alive'; disabled = true; }
        else if (player.heroRespawn > 0) { sub = `${Math.ceil(player.heroRespawn / 20)}s`; disabled = true; }
        else if (player.era < 3 || !sim.canAfford(0, cost)) disabled = true;
        this.tile(grid, {
          icon: 'summon', name: `Summon`, cost: disabled && sub ? null : cost, sub: sub || null,
          desc: `Summon ${heroProto.name} — Empire Era`, disabled, cls: 'era-tile',
          onClick: () => { sim.cmdSummonHero(building.id); this.refreshTop(); },
        });
      }
      if (building.protoId === 'istana' && player.era < 4) {
        const era = ERAS[player.era];
        const eraDisabled = !sim.canAfford(0, era.cost) || !!building.techQueue || !!player.eraResearch;
        this.tile(grid, {
          icon: 'era', name: `Advance`, cost: era.cost,
          desc: `Advance to ${era.name}`,
          disabled: eraDisabled,
          cls: eraDisabled ? 'era-tile' : 'era-tile ready',
          onClick: () => sim.cmdResearchEra(building.id),
        });
      }
      for (const tech of building.proto.techs) {
        if (player.techs.has(tech.id)) continue;
        this.tile(grid, {
          icon: tech.id, name: tech.name, cost: tech.cost, desc: tech.desc,
          disabled: tech.era > player.era || !sim.canAfford(0, tech.cost) || !!building.techQueue,
          onClick: () => sim.cmdResearchTech(building.id, tech.id),
        });
      }
      // tear it down (workers dismantle it; ~40% resources refunded)
      this.tile(grid, {
        icon: 'stop', name: 'Demolish', sub: building.demolishing ? '…' : '40%',
        desc: 'Workers tear down this building. ~40% of its cost is refunded.',
        disabled: !!building.demolishing, cls: 'demolish-tile',
        onClick: () => { sim.cmdDemolish(building.id); this.refreshPanel(); },
      });
    }
  }

  startPlacement(protoId) {
    const size = this.sim.protos.buildings[protoId].size;
    this.placing = { protoId, size };
    this.gr.buildings.showGhost(protoId);
    this.input.setMode('place');
    this.input.placeHandler = (p) => {
      if (!p || !this.placing) return;
      const { tx, tz } = this.placeTile(p);
      const villagers = this.selectionEntities()
        .filter((e) => e.kind === 'unit' && e.proto.tags.includes('villager'))
        .map((e) => e.id);
      if (this.sim.cmdBuild(villagers, protoId, tx, tz)) {
        this.input.setMode('normal');
        this.refreshTop();
        this.refreshPanel();
      }
    };
    this.updateGhost();
  }

  placeTile(p) {
    const size = this.placing.size;
    return { tx: Math.round(p.x - size / 2), tz: Math.round(p.z - size / 2) };
  }

  updateGhost() {
    const p = this.input.groundAt(this.mouse.x, this.mouse.y);
    if (!p || !this.placing) return;
    const { tx, tz } = this.placeTile(p);
    const proto = this.sim.protos.buildings[this.placing.protoId];
    const valid = this.sim.canPlace(this.placing.protoId, tx, tz) &&
      this.sim.canAfford(0, this.sim.costOf(0, proto));
    this.gr.buildings.moveGhost(tx, tz, valid);
  }

  // Move the placement ghost to a screen point (touch dragging).
  updateGhostScreen(x, y) {
    if (!this.placing) return;
    this.mouse.x = x;
    this.mouse.y = y;
    this.updateGhost();
  }

  // Confirm placement at a screen point (defaults to screen center).
  confirmPlacement(x = window.innerWidth / 2, y = window.innerHeight / 2) {
    if (!this.placing) return;
    const p = this.input.groundAt(x, y);
    this.input.placeHandler?.(p);
  }

  isPlacing() {
    return !!this.placing;
  }

  onEvents(events) {
    for (const ev of events) {
      if (ev.type === 'era-up' && ev.owner === 0) {
        this.refreshTop();
        this.showEraBanner(ERAS[this.sim.players[0].era - 1].name);
      }
    }
  }

  showEraBanner(name) {
    if (!this.eraBanner) {
      this.eraBanner = el('div', null, document.body);
      this.eraBanner.id = 'era-banner';
    }
    this.eraBanner.textContent = name.toUpperCase();
    this.eraBanner.classList.remove('show');
    void this.eraBanner.offsetWidth;
    this.eraBanner.classList.add('show');
  }
}
