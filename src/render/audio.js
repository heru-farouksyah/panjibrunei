import cues from '../data/audio.json' with { type: 'json' };

// AudioManager — everything you hear, generated in the browser (WebAudio) so
// the game ships with no audio files. Three user-facing volume buses
// (master / music / sfx), persisted to localStorage. A cue (src/data/audio.json)
// is a blip, a melody, or a coded "patch" (gritty noise+filter SFX). Set a
// cue's `file` to a sample path later to replace the synth with no code change.
//
// Also owns: a per-theme ambient bed (looping filtered noise + sparse
// one-shots) and a generative gamelan-style score with peace/battle intensity.
// See PRD.md Phase 8 and VIBE_CODING.md §6.

const VOL_KEYS = { master: 'panji.vol.master', music: 'panji.vol.music', sfx: 'panji.vol.sfx' };

function loadVol(key, dflt) {
  const v = parseFloat(localStorage.getItem(key));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt;
}

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('panji.muted') === '1';
    this.lastPlayed = new Map(); // cue -> time, to rate-limit spammy cues
    this.vol = {
      master: loadVol(VOL_KEYS.master, 0.8),
      music: loadVol(VOL_KEYS.music, 0.6),
      sfx: loadVol(VOL_KEYS.sfx, 0.9),
    };
    this.themeId = 'tropical';
    this.combatUntil = 0; // ms timestamp; music plays "battle" while in the future
    this.fireUntil = 0;   // ms timestamp; fire crackle loops while in the future
    this._noise = null;
    this._ambient = null; // { stop() }
    this._music = null;   // { timer, ... }
    this._crackle = null; // { stop() }

    const unlock = () => { this._ensureCtx(); this.ctx?.resume?.(); this._startWorld(); };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('touchstart', unlock, { once: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.setMuted(!this.muted);
      unlock();
    });
  }

  // ---- graph & context -----------------------------------------------------
  _ensureCtx() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.musicGain = c.createGain();
    this.sfxGain = c.createGain();
    this.ambientGain = c.createGain(); // feeds sfx bus; environmental sound
    this.master.connect(c.destination);
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.ambientGain.connect(this.sfxGain);
    this.ambientGain.gain.value = 0.55;
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.vol.master;
    this.master.gain.value = m;
    this.musicGain.gain.value = this.vol.music;
    this.sfxGain.gain.value = this.vol.sfx;
  }

  noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brownish noise — softer than white, good for ambience & impacts
      last = (last + (Math.random() * 2 - 1) * 0.5) * 0.96;
      d[i] = last;
    }
    this._noise = buf;
    return buf;
  }

  // ---- public volume / mute API (wired to the settings menu) ---------------
  setVolume(bus, v) {
    v = Math.max(0, Math.min(1, v));
    this.vol[bus] = v;
    localStorage.setItem(VOL_KEYS[bus], String(v));
    this._applyVolumes();
  }

  setMuted(on) {
    this.muted = !!on;
    localStorage.setItem('panji.muted', this.muted ? '1' : '0');
    this._applyVolumes();
  }

  // ---- world: ambient + music for the chosen theme -------------------------
  world(themeId) {
    this.themeId = themeId || 'tropical';
    this._ensureCtx();
    this._startWorld();
  }

  _startWorld() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this._ambient) this.startAmbient();
    if (!this._music) this.startMusic();
  }

  // ---- SFX one-shots -------------------------------------------------------
  play(name, { rateLimitMs = 70 } = {}) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const cue = cues[name];
    if (!cue || name.startsWith('_')) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < rateLimitMs) return;
    this.lastPlayed.set(name, now);

    const vol = cue.vol ?? 0.2;
    const when = this.ctx.currentTime;
    // cue.file (a sample) would be decoded + played here once assets exist
    if (cue.patch && PATCHES[cue.patch]) {
      PATCHES[cue.patch](this, when, vol);
    } else if (cue.notes) {
      let t = when;
      for (const [f, d] of cue.notes) {
        this.blip(f, d, cue.type ?? 'triangle', vol, t);
        t += d * 0.9;
      }
    } else if (cue.f) {
      this.blip(cue.f, cue.d, cue.type ?? 'triangle', vol, when);
    }
  }

  blip(freq, dur, type, vol, when, dest = this.sfxGain) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain).connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // a short shaped burst of the brown-noise buffer through a filter
  noiseBurst(when, dur, vol, { type = 'bandpass', freq = 800, q = 1, dest = this.sfxGain } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filt).connect(gain).connect(dest);
    src.start(when, Math.random() * 1.5);
    src.stop(when + dur + 0.05);
    return { src, filt, gain };
  }

  // ---- ambient bed ---------------------------------------------------------
  startAmbient() {
    if (!this.ctx || this._ambient) return;
    const ctx = this.ctx;
    const bed = AMBIENT[this.themeId] ?? AMBIENT.tropical;

    // continuous filtered-noise bed, slowly wandering via an LFO on the filter
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = bed.freq;
    filt.Q.value = bed.q;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = bed.freq * 0.4;
    lfo.connect(lfoGain).connect(filt.frequency);
    const gain = ctx.createGain();
    gain.gain.value = bed.level;
    src.connect(filt).connect(gain).connect(this.ambientGain);
    src.start();
    lfo.start();

    // sparse randomized one-shots (birds / water / wind), scheduled in JS time
    const timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
      if (Math.random() < bed.chance) bed.oneShot(this, this.ctx.currentTime);
    }, 700);

    this._ambient = {
      stop: () => { try { src.stop(); lfo.stop(); } catch {} clearInterval(timer); },
    };
  }

  stopAmbient() { this._ambient?.stop(); this._ambient = null; }

  // ---- generative gamelan-style music --------------------------------------
  startMusic() {
    if (!this.ctx || this._music) return;
    const ctx = this.ctx;
    // slendro-flavoured pentatonic: 5 near-equal steps per octave, two octaves
    const base = 196; // ~G3
    const scale = [];
    for (let oct = 0; oct < 2; oct++) {
      for (let k = 0; k < 5; k++) scale.push(base * Math.pow(2, oct + k / 5));
    }
    const state = { beat: 0, nextNoteTime: ctx.currentTime + 0.1, scale };

    const scheduler = () => {
      if (!this.ctx) return;
      const battle = performance.now() < this.combatUntil;
      const beatDur = battle ? 0.34 : 0.6;
      // schedule a little ahead of the audio clock for steady timing
      while (state.nextNoteTime < ctx.currentTime + 0.25) {
        this._scheduleBeat(state, battle);
        state.beat++;
        state.nextNoteTime += beatDur;
      }
    };
    const timer = setInterval(scheduler, 60);
    this._music = { stop: () => clearInterval(timer), state };
  }

  _scheduleBeat(state, battle) {
    const t = state.nextNoteTime;
    const s = state.scale;
    const beat = state.beat;
    // low gong marks the start of each cycle (every 8 beats)
    if (beat % 8 === 0) this.gong(s[0] / 2, t);
    // balungan: a metallophone strike most beats; denser in battle
    const density = battle ? 0.95 : 0.6;
    if (Math.random() < density) {
      const idx = (beat * 2 + (Math.random() < 0.4 ? 1 : 0)) % s.length;
      this.bonang(s[idx], t, battle ? 0.16 : 0.13, battle ? 0.8 : 1.4);
    }
    // a second, higher interlocking voice on offbeats when in battle
    if (battle && Math.random() < 0.6) {
      const idx = (beat * 3 + 2) % s.length;
      this.bonang(s[Math.min(s.length - 1, idx)] * 2, t + 0.17, 0.1, 0.5);
    }
    // kendang-like drum keeps time in battle
    if (battle && beat % 2 === 1) this.noiseBurst(t, 0.12, 0.12, { freq: 180, q: 2, dest: this.musicGain });
  }

  // inharmonic metallophone tone (bell/gamelan timbre)
  bonang(freq, when, vol, decay) {
    const ctx = this.ctx;
    const partials = [1, 2.76, 5.4];
    const amps = [1, 0.5, 0.25];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0005, when + decay);
    lp.connect(gain).connect(this.musicGain);
    partials.forEach((p, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * p;
      g.gain.value = amps[i];
      o.connect(g).connect(lp);
      o.start(when);
      o.stop(when + decay + 0.05);
    });
  }

  gong(freq, when) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.22, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0005, when + 3.2);
    gain.connect(this.musicGain);
    for (const [p, a] of [[1, 1], [1.48, 0.4], [2.9, 0.2]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * p, when);
      o.frequency.exponentialRampToValueAtTime(freq * p * 0.97, when + 2.5); // slight downward bend
      g.gain.value = a;
      o.connect(g).connect(gain);
      o.start(when);
      o.stop(when + 3.3);
    }
  }

  stopMusic() { this._music?.stop(); this._music = null; }

  // ---- fire crackle loop ---------------------------------------------------
  _updateFire(now) {
    const active = now < this.fireUntil;
    if (active && !this._crackle && this.ctx?.state === 'running') {
      const c = this.noiseBurst(this.ctx.currentTime, 9999, 0.0, { freq: 650, q: 0.7 });
      c.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      c.gain.gain.setValueAtTime(0.16, this.ctx.currentTime);
      // gentle flicker on the crackle level
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = 0.07;
      lfo.connect(lg).connect(c.gain.gain);
      lfo.start();
      this._crackle = { stop: () => { try { c.src.stop(); lfo.stop(); } catch {} } };
    } else if (!active && this._crackle) {
      this._crackle.stop();
      this._crackle = null;
    }
  }

  // ---- event routing -------------------------------------------------------
  // Route sim events to cues. Returns true for events that warrant a minimap
  // attack ping (used by the HUD/minimap).
  onEvent(ev, playerIndex = 0) {
    const now = performance.now();
    switch (ev.type) {
      case 'building-done':
        if (ev.owner === playerIndex) this.play('building_done');
        break;
      case 'train-done':
        if (ev.owner === playerIndex) this.play('train_done', { rateLimitMs: 400 });
        break;
      case 'era-up':
        if (ev.owner === playerIndex) this.play('era_up');
        break;
      case 'ultimate':
        this.play(`ult_${ev.ultId}`);
        break;
      case 'monument-started':
        this.play('monument_started');
        break;
      case 'hero-died':
        this.play('hero_died');
        this.combatUntil = now + 6000;
        break;
      case 'boss-slain':
        this.play('boss_slain');
        break;
      case 'kingdom-defeated':
        this.play('kingdom_defeated');
        break;
      case 'melee-hit':
        this.play('melee_hit', { rateLimitMs: 90 });
        this.combatUntil = now + 6000;
        break;
      case 'shoot':
        this.play(ev.thrown ? 'throw_release' : (ev.splash > 0 ? 'cannon_fire' : 'arrow_release'),
          { rateLimitMs: 90 });
        this.combatUntil = now + 6000;
        break;
      case 'impact':
        this.play(ev.splash > 0 ? 'impact_big' : 'impact_small', { rateLimitMs: 90 });
        break;
      case 'death':
        this.play('unit_death', { rateLimitMs: 120 });
        break;
      case 'demolish-start':
        this.play('demolish');
        break;
      case 'ignite':
      case 'burning':
        this.fireUntil = now + 2500;
        break;
      case 'game-over':
        this.play(ev.winner === playerIndex ? 'victory' : 'defeat');
        break;
    }
    this._updateFire(now);
  }

  // structural snapshot for headless tests
  getState() {
    return {
      ctx: this.ctx?.state ?? 'none',
      muted: this.muted,
      vol: { ...this.vol },
      masterGain: this.master?.gain.value ?? null,
      musicGain: this.musicGain?.gain.value ?? null,
      sfxGain: this.sfxGain?.gain.value ?? null,
      ambient: !!this._ambient,
      music: !!this._music,
      crackle: !!this._crackle,
      theme: this.themeId,
    };
  }
}

// ---- coded SFX patches (gritty noise+filter+envelope sounds) --------------
// Each: (audio, when, vol). Connect to audio.sfxGain.
const PATCHES = {
  clash(a, when, vol) {
    // metallic blade clash: bright noise ping + a short ringing tone
    a.noiseBurst(when, 0.12, vol, { type: 'highpass', freq: 2600, q: 0.8 });
    a.blip(1400 + Math.random() * 400, 0.09, 'square', vol * 0.4, when);
  },
  whoosh(a, when, vol) {
    a.noiseBurst(when, 0.16, vol, { type: 'bandpass', freq: 1600, q: 0.9 });
  },
  whoosh_low(a, when, vol) {
    a.noiseBurst(when, 0.2, vol, { type: 'bandpass', freq: 700, q: 0.8 });
  },
  boom(a, when, vol) {
    // cannon: low body + noise crack
    a.blip(90, 0.35, 'sine', vol, when);
    a.noiseBurst(when, 0.25, vol * 0.8, { type: 'lowpass', freq: 500, q: 0.6 });
  },
  thud(a, when, vol) {
    a.blip(150, 0.12, 'sine', vol, when);
    a.noiseBurst(when, 0.1, vol * 0.5, { type: 'lowpass', freq: 800 });
  },
  explosion(a, when, vol) {
    a.blip(70, 0.5, 'sine', vol, when);
    a.noiseBurst(when, 0.4, vol, { type: 'lowpass', freq: 900, q: 0.5 });
    a.noiseBurst(when + 0.02, 0.18, vol * 0.7, { type: 'highpass', freq: 1800 });
  },
  death(a, when, vol) {
    // a brief downward groan
    const ctx = a.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, when);
    o.frequency.exponentialRampToValueAtTime(90, when + 0.25);
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.28);
    o.connect(g).connect(a.sfxGain);
    o.start(when); o.stop(when + 0.3);
  },
  rubble(a, when, vol) {
    a.noiseBurst(when, 0.5, vol, { type: 'lowpass', freq: 600, q: 0.4 });
    a.blip(110, 0.3, 'triangle', vol * 0.5, when + 0.03);
  },
  crackle(a, when, vol) {
    // unused as a one-shot; the fire loop builds its own sustained source
    a.noiseBurst(when, 0.2, vol, { type: 'bandpass', freq: 650, q: 0.7 });
  },
};

// ---- per-theme ambient definitions ----------------------------------------
const AMBIENT = {
  tropical: {
    freq: 2400, q: 0.8, level: 0.04, chance: 0.5,
    oneShot(a, when) { // bird chirp: two quick up-glides
      for (let i = 0; i < 2; i++) {
        const o = a.ctx.createOscillator();
        const g = a.ctx.createGain();
        o.type = 'sine';
        const t = when + i * 0.09;
        o.frequency.setValueAtTime(2200, t);
        o.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g).connect(a.ambientGain);
        o.start(t); o.stop(t + 0.1);
      }
    },
  },
  water_village: {
    freq: 900, q: 0.7, level: 0.05, chance: 0.45,
    oneShot(a, when) { // water plip
      const o = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, when);
      o.frequency.exponentialRampToValueAtTime(500, when + 0.08);
      g.gain.setValueAtTime(0.06, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
      o.connect(g).connect(a.ambientGain);
      o.start(when); o.stop(when + 0.14);
    },
  },
  mountain: {
    freq: 500, q: 0.5, level: 0.06, chance: 0.35,
    oneShot(a, when) { // wind gust swell
      a.noiseBurst(when, 1.4 + Math.random(), 0.05, { type: 'bandpass', freq: 420, q: 0.6, dest: a.ambientGain });
    },
  },
};
