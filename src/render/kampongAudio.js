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
  // An ORIGINAL anime-opening-style theme (shounen J-rock energy — not a copy of
  // any real song): fast rock drums (kick + backbeat snare + driving hats),
  // power-chord bass over an A-minor i–VI–III–VII progression, and an anthemic
  // A-minor-pentatonic lead hook. ~160 BPM.
  music({ ambience = true } = {}) {
    if (!this.ready || this._music) return;
    if (!ambience && this._ambGain) this._ambGain.gain.value = 0;
    const ctx = this.ctx, bpm = 160, st = 60 / bpm / 4;
    const ROOT = [57, 53, 48, 55], FIFTH = [64, 60, 55, 62];        // Am  F  C  G
    const PENT = [69, 72, 74, 76, 79, 81];                          // A-minor pentatonic (lead 8ve)
    const RIFF = [4, -1, 3, -1, 2, 3, 2, 0, -1, 2, -1, 3, 4, -1, 5, 4]; // the hook (indices into PENT)
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const bus = ctx.createGain(); bus.gain.value = 0.5; bus.connect(this.master);
    let step = 0, next = ctx.currentTime + 0.06;
    const kick = (t) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11); const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.18); };
    const snare = (t) => { const s = ctx.createBufferSource(); s.buffer = this._noiseBuf(0.2); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500; const g = ctx.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); s.connect(hp); hp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.2); };
    const hat = (t, v) => { const s = ctx.createBufferSource(); s.buffer = this._noiseBuf(0.04); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000; const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); s.connect(hp); hp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.05); };
    const tone = (m, t, dur, type, v) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02); };
    const tick = () => {
      while (next < ctx.currentTime + 0.13) {
        const s = step % 16, bar = (step >> 4) % 4;
        if (s === 0 || s === 8 || s === 6 || s === 14) kick(next);   // driving rock kick
        if (s === 4 || s === 12) snare(next);                        // backbeat
        if (bar === 3 && s >= 12 && s % 2 === 0) snare(next);         // end-of-loop fill
        hat(next, s % 4 === 0 ? 0.13 : 0.07);
        if (s % 2 === 0) { tone(ROOT[bar] - 12, next, st * 1.7, 'sawtooth', 0.2); }            // bass 8ths
        if (s % 4 === 0) { tone(ROOT[bar], next, st * 1.8, 'sawtooth', 0.13); tone(FIFTH[bar], next, st * 1.8, 'sawtooth', 0.11); } // power chord
        const li = RIFF[s]; if (li >= 0) tone(PENT[li], next, st * 1.5, 'square', 0.14);        // lead hook
        step++; next += st;
      }
    };
    this._music = setInterval(tick, 25); tick();
  }
  stopMusic() { if (this._music) { clearInterval(this._music); this._music = null; } }
  close() { this.stopMusic(); try { this.ctx && this.ctx.close(); } catch (e) { } this.ctx = null; this.ready = false; }
  _now() { return this.ctx.currentTime; }
  _noiseBuf(sec) {
    const n = (this.ctx.sampleRate * sec) | 0; const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  // gentle lapping-water bed: looping filtered noise with a slow LFO on the cutoff
  _ambience() {
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(3); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.06; this._ambGain = g;
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
  hop() { this._tone(320, 0.12, { type: 'sine', vol: 0.18, glideTo: 560 }); }
}
