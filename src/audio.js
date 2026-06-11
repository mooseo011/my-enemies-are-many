// Procedural WebAudio battlefield sound: no audio files needed.

class BattleAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;

    // A touch of feedback delay gives shots a battlefield echo.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.master.connect(ctx.destination);
    this.master.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noise({ dur = 0.3, gain = 0.5, freq = 1200, q = 0.7, type = 'lowpass', sweepTo = null, attack = 0.002, when = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweepTo !== null) f.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  _tone({ freq = 200, dur = 0.1, gain = 0.3, type = 'sine', sweepTo = null, when = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  musketFire() {
    // Sharp crack + powder boom + flintlock spark
    this._noise({ dur: 0.04, gain: 0.9, freq: 5500, type: 'highpass', attack: 0.001 });
    this._noise({ dur: 0.45, gain: 0.85, freq: 2600, sweepTo: 180, attack: 0.002 });
    this._tone({ freq: 110, dur: 0.28, gain: 0.5, type: 'triangle', sweepTo: 40 });
  }

  enemyVolley(distance = 60) {
    const att = Math.max(0.08, 1 - distance / 160);
    this._noise({ dur: 0.35, gain: 0.5 * att, freq: 900, sweepTo: 120, when: Math.random() * 0.05 });
    this._tone({ freq: 90, dur: 0.25, gain: 0.3 * att, type: 'triangle', sweepTo: 35 });
  }

  cannonFire(distance = 40) {
    const att = Math.max(0.15, 1 - distance / 250);
    this._noise({ dur: 1.1, gain: 1.0 * att, freq: 420, sweepTo: 50, q: 0.4 });
    this._tone({ freq: 55, dur: 0.9, gain: 0.8 * att, type: 'sine', sweepTo: 25 });
  }

  explosion(distance = 30) {
    const att = Math.max(0.15, 1 - distance / 180);
    this._noise({ dur: 0.8, gain: 0.9 * att, freq: 700, sweepTo: 60, q: 0.5 });
    this._tone({ freq: 70, dur: 0.6, gain: 0.6 * att, type: 'sine', sweepTo: 28 });
  }

  dryFire() {
    this._tone({ freq: 1400, dur: 0.03, gain: 0.25, type: 'square' });
    this._tone({ freq: 500, dur: 0.05, gain: 0.18, type: 'square', when: 0.04 });
  }

  reloadStage(stage) {
    // 0: cartridge bite, 1: powder pour, 2: ramrod, 3: prime/cock
    switch (stage) {
      case 0:
        this._noise({ dur: 0.08, gain: 0.2, freq: 2400, type: 'bandpass', q: 2 });
        break;
      case 1:
        this._noise({ dur: 0.35, gain: 0.12, freq: 4500, type: 'highpass' });
        break;
      case 2:
        this._tone({ freq: 320, dur: 0.06, gain: 0.25, type: 'triangle' });
        this._tone({ freq: 290, dur: 0.06, gain: 0.22, type: 'triangle', when: 0.16 });
        this._tone({ freq: 350, dur: 0.06, gain: 0.2, type: 'triangle', when: 0.32 });
        break;
      case 3:
        this._tone({ freq: 900, dur: 0.04, gain: 0.3, type: 'square' });
        this._tone({ freq: 1300, dur: 0.04, gain: 0.25, type: 'square', when: 0.09 });
        break;
    }
  }

  bayonetSwing() {
    this._noise({ dur: 0.18, gain: 0.35, freq: 1200, type: 'bandpass', q: 1.5, sweepTo: 400 });
  }

  bayonetHit() {
    this._noise({ dur: 0.12, gain: 0.5, freq: 600, type: 'bandpass', q: 1 });
    this._tone({ freq: 160, dur: 0.12, gain: 0.4, type: 'triangle', sweepTo: 60 });
  }

  playerHit() {
    this._tone({ freq: 200, dur: 0.18, gain: 0.5, type: 'sawtooth', sweepTo: 70 });
    this._noise({ dur: 0.15, gain: 0.3, freq: 500, sweepTo: 100 });
  }

  musketBallWhiz() {
    this._noise({ dur: 0.16, gain: 0.18, freq: 3200, type: 'bandpass', q: 6, sweepTo: 1400 });
  }

  drumRoll() {
    for (let i = 0; i < 12; i++) {
      this._noise({ dur: 0.05, gain: 0.16, freq: 1800, type: 'bandpass', q: 1.2, when: i * 0.09 });
      this._tone({ freq: 140, dur: 0.05, gain: 0.14, type: 'triangle', when: i * 0.09 });
    }
  }
}

export const audio = new BattleAudio();
