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
import { showDisclaimer, showTitle, showFactionSelect, showEndScreen } from './render/screens.js';
import factionsData from './data/factions.json' with { type: 'json' };

// Game flow: title -> faction select -> match -> victory/defeat screen.
function startMatch(playerFaction, difficulty) {
  const factionIds = Object.keys(factionsData).filter((k) => !k.startsWith('_'));
  const others = factionIds.filter((f) => f !== playerFaction);
  const aiFaction = others[(Math.random() * others.length) | 0];

  const sim = new Sim({
    seed: (Math.random() * 1e9) | 0,
    playerFaction,
    aiFaction,
    difficulty,
  });

  const container = document.getElementById('app');
  const gameRenderer = new GameRenderer(container, sim);
  const cameraRig = new CameraRig(gameRenderer.camera, gameRenderer.renderer.domElement, sim.grid);
  const input = new InputController(sim, gameRenderer, cameraRig);
  const hud = new HUD(sim, gameRenderer, input, cameraRig);
  const touch = new TouchControls(sim, gameRenderer, cameraRig, input, hud);
  const audio = new AudioManager();
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

  let last = performance.now();
  let accumulator = 0;
  let ended = false;

  function handleEvents(events) {
    for (const ev of events) {
      audio.onEvent(ev, 0);
      minimap.onEvent(ev);
      if (ev.type === 'order' && ev.issuer === 0) {
        audio.play(ev.orderType === 'attackmove' ? 'attack_order' : 'move_order');
      }
      if (ev.type === 'game-over' && !ended) {
        ended = true;
        showEndScreen(sim, ev.winner, {
          onReplay: () => {
            sessionStorage.setItem('panji-restart', JSON.stringify({ faction: playerFaction, difficulty }));
            location.reload();
          },
          onChangeBanner: () => location.reload(),
        });
      }
    }
    gameRenderer.consumeEvents(events);
    hud.onEvents(events);
  }

  function frame(now) {
    const dtMs = Math.min(100, now - last);
    last = now;
    accumulator += dtMs;

    // the sim freezes once the match is decided; rendering continues
    let steps = 0;
    while (!ended && accumulator >= TICK_MS && steps < MAX_TICKS_PER_FRAME) {
      sim.step();
      accumulator -= TICK_MS;
      steps++;
    }
    if (steps === MAX_TICKS_PER_FRAME && accumulator >= TICK_MS) accumulator = 0;
    overlay.markTicks(steps);
    handleEvents(sim.drainEvents());

    cameraRig.update(dtMs / 1000);
    // alpha = fraction of the way to the next tick, for entity interpolation.
    gameRenderer.render(
      accumulator / TICK_MS, now / 1000, dtMs / 1000,
      input.selection, (e) => sim.isVisibleToPlayer(0, e)
    );
    overlay.frame(dtMs);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// "Play again" restarts carry the previous choice through a reload.
const restart = sessionStorage.getItem('panji-restart');
if (restart) {
  sessionStorage.removeItem('panji-restart');
  const { faction, difficulty } = JSON.parse(restart);
  startMatch(faction, difficulty);
} else if (new URLSearchParams(location.search).has('quickstart')) {
  startMatch('semaun', 'normal'); // headless testing shortcut
} else {
  // Disclaimer → title → faction select → match.
  showDisclaimer(() => {
    showTitle(() => {
      showFactionSelect((faction, difficulty) => startMatch(faction, difficulty));
    });
  });
}
