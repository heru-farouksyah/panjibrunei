import cues from '../data/audio.json' with { type: 'json' };

// Tiny AudioManager: named cues mapped in src/data/audio.json. Until real
// samples are dropped in (set `file` on a cue), cues play as quiet synth
// blips via WebAudio. M toggles mute.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastPlayed = new Map(); // cue -> time, to rate-limit spammy cues
    // browsers require a user gesture before audio can start
    const unlock = () => {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch {
          this.ctx = null;
        }
      }
      this.ctx?.resume?.();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        this.muted = !this.muted;
      }
      unlock();
    });
  }

  play(name, { rateLimitMs = 80 } = {}) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const cue = cues[name];
    if (!cue || name.startsWith('_')) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < rateLimitMs) return;
    this.lastPlayed.set(name, now);

    // cue.file would be decoded + played here once real samples exist
    const vol = cue.vol ?? 0.2;
    if (cue.notes) {
      let t = this.ctx.currentTime;
      for (const [f, d] of cue.notes) {
        this.blip(f, d, cue.type ?? 'triangle', vol, t);
        t += d * 0.9;
      }
    } else {
      this.blip(cue.f, cue.d, cue.type ?? 'triangle', vol, this.ctx.currentTime);
    }
  }

  blip(freq, dur, type, vol, when) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // Route sim events to cues. Returns true for events that warrant a minimap
  // attack ping (used by the HUD/minimap).
  onEvent(ev, playerIndex = 0) {
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
      case 'game-over':
        this.play(ev.winner === playerIndex ? 'victory' : 'defeat');
        break;
    }
  }
}
