import { MIN_DIST, MAX_DIST } from './cameraRig.js';

// Touch controls for phones/tablets, designed to reach feature parity with the
// desktop mouse+keyboard scheme. Single finger: tap = select / command (or
// place), drag = pan. Two fingers = pinch zoom. Plus on-screen controls:
//   ☰ menu  → pause / settings / save (the keyboard-only actions)
//   ⛶ select → toggles single-finger drag into a box-select (also long-press)
//   1–5 group chips → tap recall, long-press assign (replaces Ctrl+digit)
//   zoom / stop / place buttons
// Commands give haptic feedback; double-tap empty ground = attack-move.
export class TouchControls {
  constructor(sim, gameRenderer, cameraRig, input, hud) {
    this.sim = sim;
    this.gr = gameRenderer;
    this.rig = cameraRig;
    this.input = input;
    this.hud = hud;
    this.dom = gameRenderer.renderer.domElement;
    this.menuActions = null; // set by main.js: { isPaused, togglePause, save, openSettings }

    this.touches = new Map(); // id -> {x, y, startX, startY, t}
    this.dragging = false;
    this.pinchDist = 0;
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.moveThresh = 12;     // px before a touch becomes a drag
    this.selectMode = false;  // ⛶ toggle: single-finger drag = box select
    this.boxActive = false;   // one-shot box from a long-press
    this.lpTimer = 0;         // long-press timer id

    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) {
      document.body.classList.add('touch');
      // Phone vs tablet by the device's smaller physical edge (orientation-proof):
      // phones get a compact, scrolling command card; tablets a roomier one with
      // the unit info panel kept on screen — i.e. different navigation per device.
      const minEdge = Math.min(screen.width || 9999, screen.height || 9999);
      this.deviceClass = minEdge >= 600 ? 'tablet' : 'phone';
      document.body.classList.add(this.deviceClass);
    }

    this.dom.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    this.dom.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    this.dom.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
    this.dom.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });

    this.buildMenu();
    this.wireButtons();
    setInterval(() => this.syncButtons(), 150);
  }

  setMenuActions(a) { this.menuActions = a; }

  vibrate(ms) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

  // ---- on-screen menu (pause / settings / save) ----------------------------
  buildMenu() {
    const m = document.createElement('div');
    m.id = 'touch-menu';
    m.style.display = 'none';
    m.innerHTML = `
      <div class="tm-card">
        <div class="tm-title">Menu</div>
        <button class="tm-btn" data-act="pause"></button>
        <button class="tm-btn" data-act="settings">Settings</button>
        <button class="tm-btn" data-act="save">Save game</button>
        <button class="tm-btn tm-close" data-act="close">Close</button>
      </div>`;
    document.body.appendChild(m);
    this.menuEl = m;
    m.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) { if (e.target === m) this.toggleMenu(false); return; } // tap backdrop
      const a = this.menuActions;
      if (act === 'pause') a?.togglePause();
      else if (act === 'settings') { this.toggleMenu(false); a?.openSettings(); return; }
      else if (act === 'save') a?.save();
      this.toggleMenu(false);
    });
  }

  toggleMenu(force) {
    const open = force !== undefined ? force : this.menuEl.style.display === 'none';
    if (open) {
      const paused = this.menuActions?.isPaused?.();
      this.menuEl.querySelector('[data-act="pause"]').textContent = paused ? 'Resume' : 'Pause';
    }
    this.menuEl.style.display = open ? 'flex' : 'none';
  }

  // ---- button wiring -------------------------------------------------------
  wireButtons() {
    const tap = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    tap('zoom-in', () => { this.rig.targetDist = Math.max(MIN_DIST, this.rig.targetDist * 0.8); });
    tap('zoom-out', () => { this.rig.targetDist = Math.min(MAX_DIST, this.rig.targetDist * 1.25); });
    tap('btn-stop', () => { this.sim.cmdStop(this.input.selectionIds()); this.vibrate(12); });
    tap('btn-build-ok', () => this.hud.confirmPlacement());
    tap('menu-btn', () => this.toggleMenu());
    tap('btn-select', () => { this.selectMode = !this.selectMode; this.syncButtons(); this.vibrate(8); });

    // control-group chips: tap = recall, long-press = assign current selection
    for (const chip of document.querySelectorAll('#group-bar .grp')) {
      const n = Number(chip.dataset.g);
      let longHandled = false, timer = 0;
      const down = (e) => {
        e.preventDefault();
        longHandled = false;
        timer = setTimeout(() => { longHandled = true; this.setGroup(n); }, 480);
      };
      const up = (e) => {
        e.preventDefault();
        clearTimeout(timer);
        if (!longHandled) this.recallGroup(n);
      };
      chip.addEventListener('pointerdown', down);
      chip.addEventListener('pointerup', up);
      chip.addEventListener('pointercancel', () => clearTimeout(timer));
    }
  }

  setGroup(n) {
    const ids = [...this.input.selectionIds()];
    this.input.groups.set(n, ids);
    this.vibrate(20);
    this.syncButtons();
  }

  recallGroup(n) {
    const ids = (this.input.groups.get(n) ?? []).filter((id) => this.sim.pool.get(id));
    if (ids.length) { this.input.setSelection(ids); this.vibrate(10); }
  }

  syncButtons() {
    const okBtn = document.getElementById('btn-build-ok');
    if (okBtn) okBtn.style.display = this.hud.isPlacing() ? 'block' : 'none';
    const selBtn = document.getElementById('btn-select');
    if (selBtn) selBtn.classList.toggle('active', this.selectMode);
    for (const chip of document.querySelectorAll('#group-bar .grp')) {
      const g = this.input.groups.get(Number(chip.dataset.g));
      const live = g && g.some((id) => this.sim.pool.get(id));
      chip.classList.toggle('has', !!live);
    }
  }

  // ---- gestures ------------------------------------------------------------
  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      this.touches.set(t.identifier, {
        x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY, t: performance.now(),
      });
    }
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragging = true; // suppress tap when pinching
      clearTimeout(this.lpTimer);
    } else if (this.touches.size === 1 && !this.hud.isPlacing() && this.input.mode === 'normal') {
      // long-press (still finger) arms a one-shot box select
      const rec = [...this.touches.values()][0];
      clearTimeout(this.lpTimer);
      this.lpTimer = setTimeout(() => {
        if (Math.hypot(rec.x - rec.startX, rec.y - rec.startY) < this.moveThresh) {
          this.boxActive = true;
          this.vibrate(12);
        }
      }, 350);
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (rec) { rec.px = rec.x; rec.py = rec.y; rec.x = t.clientX; rec.y = t.clientY; }
    }

    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) {
        const ratio = this.pinchDist / d;
        this.rig.targetDist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.rig.targetDist * ratio));
      }
      this.pinchDist = d;
      return;
    }

    if (this.touches.size === 1) {
      const rec = [...this.touches.values()][0];
      const movedAll = Math.hypot(rec.x - rec.startX, rec.y - rec.startY);
      if (movedAll > this.moveThresh) { this.dragging = true; if (!this.boxActive) clearTimeout(this.lpTimer); }

      if (this.hud.isPlacing()) { this.hud.updateGhostScreen(rec.x, rec.y); return; }

      // box select (toggle mode or long-press): draw the marquee
      if ((this.selectMode || this.boxActive) && this.dragging) {
        this.drawBox(rec.startX, rec.startY, rec.x, rec.y);
        return;
      }

      if (this.dragging && rec.px !== undefined) {
        const dx = rec.x - rec.px;
        const dy = rec.y - rec.py;
        const scale = this.rig.dist * 0.0022;
        this.rig.target.x -= dx * scale;
        this.rig.target.z -= dy * scale;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    clearTimeout(this.lpTimer);
    const ended = [...e.changedTouches].map((t) => t.identifier);
    const wasOne = this.touches.size === 1;
    const rec = wasOne ? [...this.touches.values()][0] : null;
    for (const id of ended) this.touches.delete(id);

    if (this.touches.size === 0) {
      const dragged = this.dragging;
      const boxing = this.selectMode || this.boxActive;
      this.dragging = false;
      this.pinchDist = 0;
      this.boxActive = false;
      this.hideBox();
      if (dragged && boxing && rec) {
        this.input.boxSelect(
          Math.min(rec.startX, rec.x), Math.min(rec.startY, rec.y),
          Math.max(rec.startX, rec.x), Math.max(rec.startY, rec.y), false
        );
        this.vibrate(8);
      } else if (!dragged && rec) {
        this.handleTap(rec.startX, rec.startY);
      }
    } else if (this.touches.size === 1) {
      this.pinchDist = 0;
      const r = [...this.touches.values()][0];
      r.startX = r.x; r.startY = r.y; r.px = undefined;
    }
  }

  drawBox(x0, y0, x1, y1) {
    const b = this.input.boxEl;
    b.style.display = 'block';
    b.style.left = `${Math.min(x0, x1)}px`;
    b.style.top = `${Math.min(y0, y1)}px`;
    b.style.width = `${Math.abs(x1 - x0)}px`;
    b.style.height = `${Math.abs(y1 - y0)}px`;
  }

  hideBox() { this.input.boxEl.style.display = 'none'; }

  handleTap(x, y) {
    if (this.hud.isPlacing()) { this.hud.updateGhostScreen(x, y); this.hud.confirmPlacement(x, y); return; }
    if (this.input.mode === 'place' && this.input.placeHandler) {
      this.input.placeHandler(this.input.groundAt(x, y));
      return;
    }

    const now = performance.now();
    const isDouble = now - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30;
    this.lastTap = { t: now, x, y };

    const hit = this.input.pickEntity(x, y);
    if (hit && hit.owner === 0) {
      if (isDouble && hit.kind === 'unit') this.selectAllOfTypeOnScreen(hit.protoId);
      else this.input.setSelection([hit.id]);
      this.vibrate(8);
      return;
    }

    const ids = this.input.selectionIds();
    if (ids.length > 0) {
      const p = this.input.groundAt(x, y);
      if (!p) return;
      const target = hit;
      let hasUnit = false;
      for (const id of ids) {
        const en = this.sim.pool.get(id);
        if (en?.kind === 'unit') hasUnit = true;
        if (en?.kind === 'building' && en.owner === 0) this.sim.cmdSetRally(id, p.x, p.z);
      }
      if (hasUnit) {
        // double-tap empty ground = attack-move; otherwise normal context order
        if (isDouble && !target) this.sim.cmdAttackMove(ids, p.x, p.z);
        else this.sim.cmdContext(ids, p.x, p.z, target ? target.id : -1);
        this.vibrate(15);
      }
    } else if (!hit) {
      this.input.setSelection([]);
    }
  }

  selectAllOfTypeOnScreen(protoId) {
    const p = { x: 0, y: 0 };
    const ids = [];
    this.sim.pool.forEach((e) => {
      if (e.kind !== 'unit' || e.owner !== 0 || e.protoId !== protoId) return;
      if (!this.input.screenPos(e, p)) return;
      if (p.x >= 0 && p.x <= window.innerWidth && p.y >= 0 && p.y <= window.innerHeight) ids.push(e.id);
    });
    if (ids.length) { this.input.setSelection(ids); this.vibrate(10); }
  }
}
