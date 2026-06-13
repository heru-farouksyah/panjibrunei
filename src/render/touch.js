import { MIN_DIST, MAX_DIST } from './cameraRig.js';

// Touch controls for phones/tablets. Single finger: tap = select / issue
// command (or place a building), drag = pan the map. Two fingers = pinch
// zoom. Double-tap a unit = select all of that type on screen. Plus the
// on-screen zoom / stop / place buttons in #touch-controls.
export class TouchControls {
  constructor(sim, gameRenderer, cameraRig, input, hud) {
    this.sim = sim;
    this.gr = gameRenderer;
    this.rig = cameraRig;
    this.input = input;
    this.hud = hud;
    this.dom = gameRenderer.renderer.domElement;

    this.touches = new Map(); // id -> {x, y, startX, startY, t}
    this.dragging = false;
    this.pinchDist = 0;
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.moveThresh = 12; // px before a touch becomes a drag

    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) document.body.classList.add('touch');

    this.dom.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    this.dom.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    this.dom.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
    this.dom.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });

    this.wireButtons();
    setInterval(() => this.syncButtons(), 150);
  }

  wireButtons() {
    const tap = (id, fn) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('click', fn);
    };
    tap('zoom-in', () => {
      this.rig.targetDist = Math.max(MIN_DIST, this.rig.targetDist * 0.8);
    });
    tap('zoom-out', () => {
      this.rig.targetDist = Math.min(MAX_DIST, this.rig.targetDist * 1.25);
    });
    tap('btn-stop', () => this.sim.cmdStop(this.input.selectionIds()));
    tap('btn-build-ok', () => {
      this.hud.confirmPlacement();
    });
  }

  syncButtons() {
    const okBtn = document.getElementById('btn-build-ok');
    if (okBtn) okBtn.style.display = this.hud.isPlacing() ? 'block' : 'none';
  }

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
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (rec) {
        rec.px = rec.x;
        rec.py = rec.y;
        rec.x = t.clientX;
        rec.y = t.clientY;
      }
    }

    if (this.touches.size === 2) {
      // pinch zoom
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
      if (movedAll > this.moveThresh) this.dragging = true;

      if (this.hud.isPlacing()) {
        // drag positions the building ghost
        this.hud.updateGhostScreen(rec.x, rec.y);
        return;
      }

      if (this.dragging && rec.px !== undefined) {
        // pan the map (content follows the finger)
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
    const ended = [...e.changedTouches].map((t) => t.identifier);
    const wasOne = this.touches.size === 1;
    const rec = wasOne ? [...this.touches.values()][0] : null;
    for (const id of ended) this.touches.delete(id);

    if (this.touches.size === 0) {
      const dragged = this.dragging;
      this.dragging = false;
      this.pinchDist = 0;
      if (!dragged && rec) this.handleTap(rec.startX, rec.startY);
    } else if (this.touches.size === 1) {
      // lifted one finger of a pinch; reset for the remaining finger
      this.pinchDist = 0;
      const r = [...this.touches.values()][0];
      r.startX = r.x;
      r.startY = r.y;
      r.px = undefined;
    }
  }

  handleTap(x, y) {
    // placement mode: tap places the building
    if (this.hud.isPlacing()) {
      this.hud.updateGhostScreen(x, y);
      this.hud.confirmPlacement(x, y);
      return;
    }

    const now = performance.now();
    const isDouble = now - this.lastTap.t < 320 &&
      Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30;
    this.lastTap = { t: now, x, y };

    const hit = this.input.pickEntity(x, y);
    if (hit && hit.owner === 0) {
      if (isDouble && hit.kind === 'unit') {
        this.selectAllOfTypeOnScreen(hit.protoId);
      } else {
        this.input.setSelection([hit.id]);
      }
      return;
    }

    // tapping elsewhere with a selection issues a context command
    const ids = this.input.selectionIds();
    if (ids.length > 0) {
      const p = this.input.groundAt(x, y);
      if (!p) return;
      // enemy under the tap → attack; own building → rally/repair via context
      const target = hit || this.input.pickEntity(x, y);
      let hasUnit = false;
      for (const id of ids) {
        const en = this.sim.pool.get(id);
        if (en?.kind === 'unit') hasUnit = true;
        if (en?.kind === 'building' && en.owner === 0) this.sim.cmdSetRally(id, p.x, p.z);
      }
      if (hasUnit) this.sim.cmdContext(ids, p.x, p.z, target ? target.id : -1);
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
      if (p.x >= 0 && p.x <= window.innerWidth && p.y >= 0 && p.y <= window.innerHeight) {
        ids.push(e.id);
      }
    });
    if (ids.length) this.input.setSelection(ids);
  }
}
