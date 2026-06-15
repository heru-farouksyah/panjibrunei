// Juice (component #6): particle bursts, pop animations, WebAudio blips, haptics
// and screen-shake. Cheap to build, disproportionately important — the "feel" of
// merging is most of the satisfaction.

export class Juice {
  constructor(root) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.parts = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.ac = null;
    this.muted = false;
    this._resize();
    addEventListener('resize', () => this._resize());
    const unlock = () => { if (!this.ac) { try { this.ac = new (AudioContext || webkitAudioContext)(); } catch { /* unsupported */ } } this.ac?.resume?.(); };
    addEventListener('pointerdown', unlock, { once: true });
    requestAnimationFrame((t) => this._tick(t));
  }

  _resize() {
    const r = this.root.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
  }

  // particle burst at page coords (px relative to viewport)
  burst(px, py, color = '#ffd86b', n = 16, power = 1) {
    const r = this.root.getBoundingClientRect();
    const x = px - r.left, y = py - r.top;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = (1.5 + Math.random() * 3) * power;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, color, size: 2 + Math.random() * 3 * power });
    }
  }

  pop(el, scale = 1.35) {
    if (!el?.animate) return;
    el.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' }
    );
  }

  shake(mag = 6, ms = 260) { this.shakeMag = mag; this.shakeT = ms; }

  haptic(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

  // tiny synth cue: 'merge' | 'spawn' | 'reward' | 'error' | 'tier'
  sound(kind) {
    if (this.muted || !this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    const tone = (f, d, type = 'triangle', vol = 0.18, when = 0) => {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + when);
      g.gain.linearRampToValueAtTime(vol, t + when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + when + d);
      o.connect(g).connect(this.ac.destination);
      o.start(t + when); o.stop(t + when + d + 0.02);
    };
    if (kind === 'merge') { tone(523, 0.1); tone(784, 0.14, 'triangle', 0.16, 0.05); }
    else if (kind === 'tier') { tone(523, 0.1); tone(659, 0.1, 'triangle', 0.18, 0.06); tone(988, 0.22, 'triangle', 0.2, 0.12); }
    else if (kind === 'spawn') { tone(330, 0.06, 'sine', 0.12); }
    else if (kind === 'reward') { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, i * 0.09)); }
    else if (kind === 'error') { tone(160, 0.12, 'sawtooth', 0.14); }
  }

  _tick(now) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.vy += 0.12; p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // screen-shake the board root
    if (this.shakeT > 0) {
      this.shakeT -= 16;
      const m = this.shakeMag * Math.max(0, this.shakeT / 260);
      this.root.style.transform = `translate(${(Math.random() - 0.5) * m}px, ${(Math.random() - 0.5) * m}px)`;
    } else if (this.root.style.transform) {
      this.root.style.transform = '';
    }
    requestAnimationFrame((t) => this._tick(t));
  }
}
