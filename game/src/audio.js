// audio.js — WebAudio synth SFX + music. No audio files, no network.
// Everything is guarded: created lazily on first user input, try/catch everywhere.
export function createAudio() {
  const A = {
    ctx: null, master: null, musicGain: null, muted: false, engineOsc: null, engineGain: null,
    musicTimer: null, started: false,

    init() {
      if (this.ctx) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        this.startMusic();
        this.started = true;
      } catch (e) { /* audio unavailable: stay silent */ }
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
      return this.muted;
    },

    tone(freq, dur, type, vol, slideTo) {
      if (!this.ctx || this.muted) return;
      try {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        g.gain.setValueAtTime(vol || 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    },

    noise(dur, vol, filterFreq) {
      if (!this.ctx || this.muted) return;
      try {
        const t = this.ctx.currentTime;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
        const g = this.ctx.createGain();
        g.gain.value = vol || 0.3;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t);
      } catch (e) {}
    },

    play(name) {
      if (!this.ctx) return;
      switch (name) {
        case 'shoot': this.noise(0.12, 0.5, 2600); this.tone(180, 0.08, 'square', 0.25, 60); break;
        case 'punch': this.noise(0.08, 0.35, 700); break;
        case 'hit': this.noise(0.18, 0.4, 500); this.tone(90, 0.15, 'sawtooth', 0.2, 50); break;
        case 'jack': this.tone(220, 0.12, 'square', 0.2, 330); this.tone(330, 0.14, 'square', 0.2, 440); break;
        case 'door': this.tone(140, 0.1, 'triangle', 0.25, 90); break;
        case 'pickup': this.tone(660, 0.09, 'sine', 0.25); setTimeout(() => this.tone(880, 0.12, 'sine', 0.25), 90); break;
        case 'mission': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.25), i * 110)); break;
        case 'fail': this.tone(220, 0.3, 'sawtooth', 0.2, 110); break;
        case 'gameover': [392, 311, 233].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.25), i * 220)); break;
        case 'siren': this.tone(750, 0.4, 'sine', 0.08, 950); break;
        case 'reload': this.tone(300, 0.06, 'square', 0.18); setTimeout(() => this.tone(420, 0.06, 'square', 0.18), 80); break;
        default: break;
      }
    },

    // Engine hum: one oscillator whose pitch follows speed. Call every frame.
    engine(speed, inCar) {
      if (!this.ctx || this.muted) return;
      try {
        if (!inCar) {
          if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc = null; }
          return;
        }
        if (!this.engineOsc) {
          this.engineOsc = this.ctx.createOscillator();
          this.engineGain = this.ctx.createGain();
          this.engineOsc.type = 'sawtooth';
          this.engineOsc.frequency.value = 60;
          this.engineGain.gain.value = 0.05;
          const f = this.ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 500;
          this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
          this.engineOsc.start();
        }
        this.engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.45, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.04 + Math.abs(speed) / 420 * 0.05, this.ctx.currentTime, 0.1);
      } catch (e) {}
    },

    // Simple bass loop: Am — F — C — G roots, eighth notes at 112 BPM.
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      const roots = [55, 43.65, 65.41, 49];
      let step = 0;
      this.musicTimer = setInterval(() => {
        if (this.muted || !this.ctx) return;
        const bar = Math.floor(step / 8) % 4;
        const beat = step % 8;
        const root = roots[bar];
        const freq = beat === 0 || beat === 3 || beat === 6 ? root : root * 2;
        this.tone(freq, 0.22, 'triangle', 0.5);
        if (beat === 4) this.tone(root * 1.5, 0.2, 'sine', 0.3);
        step++;
      }, 268);
    },
  };
  return A;
}
