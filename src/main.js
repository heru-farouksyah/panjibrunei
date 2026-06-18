import { Sim } from './sim/sim.js';
import { TICK_MS, MAX_TICKS_PER_FRAME } from './sim/constants.js';
import { GameRenderer } from './render/renderer.js';
import { CameraRig } from './render/cameraRig.js';
import { DebugOverlay } from './render/debugOverlay.js';
import { InputController } from './render/input.js';
import { HUD } from './render/hud.js';
import { TouchControls } from './render/touch.js';
import { Minimap } from './render/minimap.js';
import { AudioManager } from './render/audio.js';
import { showDisclaimer, showTitle, showFactionSelect, showEndScreen, showTutorial, showRotatePrompt, showSettings, showLoading, hideLoading } from './render/screens.js';
import { DeployController } from './render/deploy.js';
import { hasSave, readSave, writeSave } from './render/settings.js';
import { loadProfile, completeMission, saveProfile } from './render/profile.js';
import { showCampaign, showMissionResult } from './render/campaign.js';
import { showMuara } from './render/muara.js';
import { showTowerDefense } from './render/td.js';
import { showTycoon } from './render/tycoon.js';
import { showKampong } from './render/kampong.js';
import { TICK_RATE } from './sim/constants.js';
import factionsData from './data/factions.json' with { type: 'json' };

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// One AudioManager for the whole page (matches restart via reload, so a single
// instance is correct). Shared by the title/settings screens and the match.
const audio = new AudioManager();

// Persistent meta-progression profile (XP, mission stars, daily streak, chests).
const profile = loadProfile();

// Preview/dev mode (?play=<id>): run one mission's game in isolation without
// writing to the saved profile, and replay it on Continue. Set by the URL route.
let previewMode = false;

// Brief on-screen confirmation (save, etc.)
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 1800);
}

// Game flow: title -> faction select -> match -> victory/defeat screen.
function startMatch(playerFaction, difficulty, opts = {}) {
  showLoading(opts.loadSnapshot ? 'Restoring your kingdom…' : 'Preparing the kampong…');
  // Two ways in: a fresh match, or restoring a saved snapshot.
  let sim;
  let theme;
  const fromSave = !!opts.loadSnapshot;
  if (fromSave) {
    sim = Sim.deserialize(opts.loadSnapshot);
    theme = sim.opts.theme;
    playerFaction = sim.players[0].factionId;
    difficulty = sim.opts.difficulty;
  } else {
    const factionIds = Object.keys(factionsData).filter((k) => !k.startsWith('_'));
    const others = factionIds.filter((f) => f !== playerFaction);
    const aiFaction = others[(Math.random() * others.length) | 0];
    // Easy = 2 rival kingdoms, Normal = 4 (a bigger free-for-all).
    const numEnemies = difficulty === 'easy' ? 2 : 4;
    theme = opts.theme;
    sim = new Sim({
      seed: Number.isFinite(opts.seed) ? opts.seed : (Math.random() * 1e9) | 0,
      mapSize: opts.mapSize, // small/medium/large; undefined → default 96
      playerFaction,
      aiFaction,
      difficulty,
      numEnemies,
      richStart: true, // free villagers + buildings + diamond army for the player
      theme,           // render-only, but stored in the snapshot for resume
    });
  }

  const container = document.getElementById('app');
  const gameRenderer = new GameRenderer(container, sim, theme);
  const cameraRig = new CameraRig(gameRenderer.camera, gameRenderer.renderer.domElement, sim.grid);
  const input = new InputController(sim, gameRenderer, cameraRig);
  const hud = new HUD(sim, gameRenderer, input, cameraRig, audio);
  const touch = new TouchControls(sim, gameRenderer, cameraRig, input, hud);
  audio.world(theme); // start the per-theme ambient bed + score (once unlocked)
  const minimap = new Minimap(sim, cameraRig, input, audio);
  const overlay = new DebugOverlay(gameRenderer, sim);

  // selection blips on top of the HUD's selection handling
  const hudSelectionChange = input.onSelectionChange;
  input.onSelectionChange = (sel) => {
    hudSelectionChange(sel);
    if (sel.size > 0) audio.play('select');
  };

  // Debug/testing handle (used by scripts/verify-*.mjs and the console).
  window.__panji = { sim, gameRenderer, cameraRig, input, hud, minimap, audio, touch };

  // On phones: start zoomed out for a wider view, and nag to rotate.
  if (IS_TOUCH) {
    cameraRig.dist = cameraRig.targetDist = 36;
    showRotatePrompt();
  }

  let last = performance.now();
  let accumulator = 0;
  let ended = false;
  let paused = false;
  let booted = false;
  // Campaign mission scoring: ★ win · ★ under par time · ★ Istana never below 60%.
  const mission = opts.mission || null;
  // Missions flagged `reveal` (e.g. Defence of Kampong Ayer) play with the
  // whole map clear — no dark fog of war. The AI keeps its own fog, so it
  // still plays fair. revealAll never decrements to 0 within a match.
  if (opts.reveal && sim.players[0]) sim.players[0].revealAll = 1e9;
  let minIstanaFrac = 1;

  // Tutorial → deployment → battle. The match stays paused through both;
  // deployment lets the player place their starting army where they like.
  // A restored save skips straight into the running battle.
  if (!fromSave && opts.tutorial !== false) {
    paused = true;
    const beginBattle = () => { paused = false; last = performance.now(); };
    const deploy = () => new DeployController(sim, input, cameraRig, beginBattle);
    showTutorial(() => deploy());
  }

  // In-match actions, shared by keyboard shortcuts (desktop) and the on-screen
  // ☰ menu (mobile) so phone players can reach save/settings/pause too.
  let settingsOpen = false;
  const matchActions = {
    isPaused: () => paused,
    save: () => toast(writeSave(sim.serialize()) ? 'Game saved' : 'Could not save'),
    togglePause: () => {
      if (ended || settingsOpen) return;
      paused = !paused;
      if (!paused) last = performance.now();
      toast(paused ? 'Paused' : 'Resumed');
    },
    openSettings: () => {
      if (ended || settingsOpen) return;
      settingsOpen = true;
      const wasPaused = paused;
      paused = true;
      showSettings(audio, { onClose: () => { settingsOpen = false; paused = wasPaused; last = performance.now(); } });
    },
  };
  touch.setMenuActions(matchActions);

  // F5 save, O settings, Space pause. (Escape is taken by input for cancel.)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'F5') { e.preventDefault(); matchActions.save(); }
    else if (e.code === 'KeyO') matchActions.openSettings();
    else if (e.code === 'Space') { e.preventDefault(); matchActions.togglePause(); }
  });

  function handleEvents(events) {
    for (const ev of events) {
      audio.onEvent(ev, 0);
      minimap.onEvent(ev);
      if (ev.type === 'order' && ev.issuer === 0) {
        audio.play(ev.orderType === 'attackmove' ? 'attack_order' : 'move_order');
      }
      if (ev.type === 'game-over' && !ended) {
        ended = true;
        if (mission) {
          const win = ev.winner === 0;
          const minutes = sim.tick / TICK_RATE / 60;
          const stars = win ? 1 + (minutes <= mission.parMin ? 1 : 0) + (minIstanaFrac >= 0.6 ? 1 : 0) : 0;
          awardMission(mission, win, stars);
        } else {
          showEndScreen(sim, ev.winner, {
            onReplay: () => {
              sessionStorage.setItem('panji-restart', JSON.stringify({ faction: playerFaction, difficulty, theme: opts.theme }));
              location.reload();
            },
            onChangeBanner: () => location.reload(),
          });
        }
      }
    }
    gameRenderer.consumeEvents(events);
    hud.onEvents(events);
  }

  function frame(now) {
    const dtMs = Math.min(100, now - last);
    last = now;
    accumulator += dtMs;

    // the sim freezes while the tutorial is up or once the match is decided;
    // rendering continues so the world is visible behind the tutorial card
    if (paused) accumulator = 0;
    let steps = 0;
    while (!ended && !paused && accumulator >= TICK_MS && steps < MAX_TICKS_PER_FRAME) {
      sim.step();
      accumulator -= TICK_MS;
      steps++;
    }
    if (steps === MAX_TICKS_PER_FRAME && accumulator >= TICK_MS) accumulator = 0;
    overlay.markTicks(steps);
    handleEvents(sim.drainEvents());

    // track the player's Istana health for the flawless (★3) mission objective
    if (mission && !ended && steps > 0) {
      let frac = 1;
      sim.pool.forEach((e) => {
        if (e.kind === 'building' && e.owner === 0 && e.protoId === 'istana') {
          frac = Math.min(frac, e.hp / (e.maxHp || e.proto?.hp || e.hp));
        }
      });
      minIstanaFrac = Math.min(minIstanaFrac, frac);
    }

    cameraRig.update(dtMs / 1000);
    if (!paused && !ended) audio.ambientWork(sim); // chop/mine/hammer work sounds
    // alpha = fraction of the way to the next tick, for entity interpolation.
    gameRenderer.render(
      accumulator / TICK_MS, now / 1000, dtMs / 1000,
      input.selection, (e) => sim.isVisibleToPlayer(0, e)
    );
    overlay.frame(dtMs);

    if (!booted) { booted = true; hideLoading(); } // first frame is up — dismiss loader

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// JS is live now — drop the static boot splash; screens take over from here.
document.getElementById('boot')?.remove();

// "Play again" restarts carry the previous choice through a reload.
const restart = sessionStorage.getItem('panji-restart');
if (restart) {
  sessionStorage.removeItem('panji-restart');
  const { faction, difficulty, theme } = JSON.parse(restart);
  startMatch(faction, difficulty, { tutorial: false, theme });
} else if (new URLSearchParams(location.search).has('play')) {
  // Dev/preview: boot straight into one node's game, no profile writes.
  // e.g. dist/index.html?play=kianggeh  (any mission id; ?muara still works)
  previewMode = true;
  const id = new URLSearchParams(location.search).get('play');
  import('./render/campaignData.js').then(({ missionById }) => {
    const m = missionById(id);
    if (m) launchMission(m); else showDisclaimer(() => goHome());
  });
} else if (new URLSearchParams(location.search).has('muara')) {
  previewMode = true;
  import('./render/campaignData.js').then(({ missionById }) => launchMission(missionById('muara')));
} else if (new URLSearchParams(location.search).has('quickstart')) {
  const q = new URLSearchParams(location.search);
  const theme = q.get('theme') || undefined;
  const mapSize = q.get('size') ? parseInt(q.get('size'), 10) : undefined;
  startMatch('semaun', 'normal', { tutorial: false, theme, mapSize }); // headless testing shortcut
} else {
  // Disclaimer → title → Campaign (journey map) or Skirmish → match.
  showDisclaimer(() => goHome());
}

// Title hub: Campaign (the engagement loop) + Skirmish (free match) + Resume.
function goHome() {
  showTitle(
    () => showFactionSelect((faction, difficulty, theme, seed, mapSize) =>
      startMatch(faction, difficulty, { tutorial: true, theme, seed, mapSize })),
    {
      onCampaign: () => goCampaign(),
      onResume: hasSave() ? () => startMatch(null, null, { loadSnapshot: readSave() }) : null,
      onSettings: () => showSettings(audio),
    }
  );
}

// Score a finished mission and show the reward screen (shared by the RTS
// missions and the mini-games). In preview mode nothing is saved and Continue
// replays the same mission, so iterating on one game never touches progress.
function awardMission(mission, win, stars) {
  if (previewMode) {
    showMissionResult(profile, audio, {
      win, stars, mission, xpResult: { gained: 0, levels: [], unlocks: [] }, gotChest: false,
      onContinue: () => location.reload(),
    });
    return;
  }
  const xp = win ? 40 + stars * 30 + ({ easy: 0, normal: 20, hard: 50 }[mission.difficulty] || 0) : 15;
  const xpResult = completeMission(profile, mission.id, stars, xp);
  let gotChest = false;
  if (win) { profile.chests += 1; gotChest = true; saveProfile(profile); }
  showMissionResult(profile, audio, {
    win, stars, mission, xpResult, gotChest,
    onContinue: () => goCampaign(),
  });
}

// Bail-out from a mini-game (the ‹ quit button): no score, back where we came.
function abortMission() { previewMode ? goHome() : goCampaign(); }

// A mini-game finished: route its result through the shared reward loop.
function miniResult(m, { win, stars, quit }) { if (quit) abortMission(); else awardMission(m, win, stars); }

// Naval arena survival (Muara intro + the Sungai Damuan fleet battle variant).
function startMuara(m) {
  showMuara(audio, { mission: m, onResult: (r) => miniResult(m, r) });
}

// Lane tower-defence (Kianggeh Stand).
function startTowerDefense(m) {
  showTowerDefense(audio, { mission: m, onResult: (r) => miniResult(m, r) });
}

// Market tycoon (Skirmish at the Tamu).
function startTycoon(m) {
  showTycoon(audio, { mission: m, onResult: (r) => miniResult(m, r) });
}

// 3rd-person Kampong Ayer collect-a-thon (Landing at Muara).
function startKampong(m) {
  showKampong(audio, { mission: m, onResult: (r) => miniResult(m, r) });
}

// One place that decides WHICH game a node runs, by its `mode` (default = RTS).
// Used by both the journey map and the ?play=<id> preview shortcut.
function launchMission(m) {
  switch (m.mode) {
    case 'naval': return startMuara(m);
    case 'td': return startTowerDefense(m);
    case 'tycoon': return startTycoon(m);
    case 'explore': return startKampong(m);
    default:
      return startMatch(m.faction, m.difficulty, {
        theme: m.theme, seed: m.seed, mapSize: m.mapSize, mission: m, reveal: !!m.reveal,
        tutorial: m.id === 'ayer' && !profile.stars['ayer'], // teach on the first RTS mission
      });
  }
}

// Campaign journey map → pick a mission → run its game.
function goCampaign() {
  showCampaign(profile, audio, {
    onMission: (m) => launchMission(m),
    onBack: () => goHome(),
    onSettings: () => showSettings(audio),
  });
}
