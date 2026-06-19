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
  // A gentle, TRADITIONAL solo-guitar melody (fingerpicked nylon strings): a
  // singable melodic line over soft chord plucks + a thumb bass, on a
  // C–G–Am–F progression. ~92 BPM. No percussion — just the guitar.
  music({ ambience = true } = {}) {
    if (!this.ready || this._music) return;
    if (!ambience && this._ambGain) this._ambGain.gain.value = 0;
    const ctx = this.ctx, bpm = 92, st = 60 / bpm / 4;
    const PROG = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C  G  Am  F
    // the melody: one note per 16th (0 = hold/rest), 4 bars / 64 steps
    const MEL = [
      72, 0, 76, 0, 79, 0, 76, 72, 0, 74, 0, 76, 72, 0, 0, 0,   // over C
      71, 0, 74, 0, 79, 0, 74, 71, 0, 72, 0, 74, 71, 0, 0, 0,   // over G
      72, 0, 76, 0, 81, 0, 79, 76, 0, 74, 0, 72, 69, 0, 0, 0,   // over Am
      77, 0, 72, 0, 77, 0, 79, 77, 0, 76, 0, 74, 72, 0, 0, 0,   // over F
    ];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const bus = ctx.createGain(); bus.gain.value = 0.5; bus.connect(this.master);
    let step = 0, next = ctx.currentTime + 0.06;
    // plucked nylon string: detuned triangle pair + soft 2nd harmonic, quick attack, long ring
    const pluck = (m, t, dur, vol) => { const f = mtof(m); for (const [mult, v, det] of [[1, vol, -5], [1, vol, 6], [2, vol * 0.25, 0]]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * mult; o.detune.value = det; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02); } };
    const tick = () => {
      while (next < ctx.currentTime + 0.13) {
        const s = step % 16, bar = (step >> 4) % 4, ch = PROG[bar], gi = step % 64;
        const mn = MEL[gi]; if (mn) pluck(mn, next, st * 3, 0.2);                 // the melody line
        if (s === 0) pluck(ch[0] - 12, next, st * 5, 0.16);                       // thumb bass — root
        else if (s === 8) pluck(ch[1] - 12, next, st * 4, 0.12);                  // thumb bass — fifth
        if (s === 4 || s === 12) pluck(ch[s === 4 ? 1 : 2], next, st * 3, 0.08);  // soft chord under the tune
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
