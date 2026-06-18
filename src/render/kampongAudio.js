// Tiny procedural sound engine (Web Audio) — no audio files. Ambient water
// loop + one-shot SFX synthesised from oscillators/noise. Must be unlocked by a
// user gesture (browsers block audio until then); call unlock() on first tap.
export class Audio {
  constructor() {
    this.ready = false;
    this.ctx = null;
    this.master = null;
    this._steps = 0;
  }
  unlock() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    this.ready = true;
    this._ambience();
  }
  _now() { return this.ctx.currentTime; }
  _noiseBuf(sec) {
    const n = (this.ctx.sampleRate * sec) | 0; const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  // gentle lapping-water bed: looping filtered noise with a slow LFO on the cutoff
  _ambience() {
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(3); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.15; const lfoG = this.ctx.createGain(); lfoG.gain.value = 160;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
  }
  _tone(freq, dur, { type = 'sine', vol = 0.3, glideTo = null, delay = 0 } = {}) {
    if (!this.ready) return;
    const t = this._now() + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  _click(vol, freq) {
    if (!this.ready) return;
    const t = this._now(); const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(0.08);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.1);
  }
  footstep() { this._steps++; this._click(0.18, this._steps % 2 ? 240 : 300); }
  pickup() { this._tone(660, 0.12, { type: 'triangle', vol: 0.3 }); this._tone(990, 0.16, { type: 'triangle', vol: 0.28, delay: 0.08 }); }
  talk() { this._tone(420, 0.06, { type: 'square', vol: 0.12 }); this._tone(520, 0.06, { type: 'square', vol: 0.1, delay: 0.07 }); }
  bell() { this._tone(1180, 0.5, { type: 'sine', vol: 0.3 }); this._tone(1760, 0.5, { type: 'sine', vol: 0.18 }); }
  bump() { this._tone(150, 0.25, { type: 'sawtooth', vol: 0.3, glideTo: 70 }); }
  clue() { this._tone(700, 0.1, { type: 'triangle', vol: 0.25 }); this._tone(900, 0.12, { type: 'triangle', vol: 0.22, delay: 0.09 }); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.5, { type: 'triangle', vol: 0.32, delay: i * 0.13 })); }
  meow() { this._tone(680, 0.18, { type: 'sawtooth', vol: 0.12, glideTo: 920 }); this._tone(880, 0.2, { type: 'sine', vol: 0.1, glideTo: 600, delay: 0.16 }); }
}
