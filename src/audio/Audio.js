// Fully synthesized audio: SFX, gibberish worker voices, machine loops and a
// small adaptive music sequencer. No audio files needed.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.listener = { x: 0, z: 0 };
    this.mood = 'off';
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.loops = {};
    this.voiceLast = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.music.connect(this.musicFilter).connect(this.master);
    this.loopBus = ctx.createGain(); this.loopBus.connect(this.sfx);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startLoops();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.get('master');
    this.music.gain.value = s.get('music') * 0.5;
    this.sfx.gain.value = s.get('sfx');
  }

  get t() { return this.ctx.currentTime; }

  // ───────── primitives ─────────
  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, out = this.sfx, t0 = this.t, attack = 0.005) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    this.env(g, t0, attack, vol, dur);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return o;
  }
  noise(dur, ftype = 'lowpass', freq = 1000, vol = 0.3, q = 1, out = this.sfx, t0 = this.t, sweepTo = null, attack = 0.003) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.loopStart = Math.random(); s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, attack, vol, dur);
    s.connect(f).connect(g).connect(out);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.02);
  }
  panned(x, z, vol = 1) {
    // simple distance attenuation + stereo pan around the camera target
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (x === undefined) { g.gain.value = vol; g.connect(this.sfx); return g; }
    const dx = x - this.listener.x, dz = z - this.listener.z;
    const d = Math.hypot(dx, dz);
    g.gain.value = vol * Math.max(0.08, Math.min(1, 1.4 - d / 26));
    if (p) { p.pan.value = Math.max(-0.8, Math.min(0.8, dx / 18)); g.connect(p).connect(this.sfx); } else g.connect(this.sfx);
    return g;
  }

  // ───────── sfx ─────────
  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const out = this.panned(o.x, o.z, o.vol ?? 1);
    const t = this.t;
    const T = (...a) => this.tone(a[0], a[1], a[2], a[3], a[4], out, a[5] ?? t, a[6]);
    const N = (...a) => this.noise(a[0], a[1], a[2], a[3], a[4], out, a[5] ?? t, a[6]);
    switch (name) {
      case 'ui': T(1400, 0.04, 'square', 0.06); break;
      case 'uiflip': N(0.03, 'bandpass', 3000, 0.25, 2); T(180, 0.09, 'square', 0.12, 90, t + 0.02); break;
      case 'button': case 'bigbutton': T(520, 0.07, 'triangle', 0.25); T(1040, 0.05, 'sine', 0.12, null, t + 0.03); N(0.03, 'highpass', 3000, 0.1); break;
      case 'lever': N(0.04, 'bandpass', 2500, 0.35, 3); T(170, 0.12, 'square', 0.12, 80, t + 0.03); break;
      case 'breaker': N(0.09, 'lowpass', 900, 0.7); T(70, 0.35, 'sawtooth', 0.18, 40); break;
      case 'estop': T(120, 0.3, 'square', 0.25, 60); N(0.15, 'lowpass', 600, 0.5); break;
      case 'grab': T(420, 0.07, 'sine', 0.22, 760); break;
      case 'drop': T(320, 0.08, 'sine', 0.18, 150); break;
      case 'throw': N(0.28, 'bandpass', 500, 0.35, 2, t, 2800); break;
      case 'thud': { const v = Math.min(1, (o.v || 4) / 10); T(90 + Math.random() * 30, 0.18, 'sine', 0.35 * v + 0.05, 38); N(0.07, 'lowpass', 500, 0.3 * v); break; }
      case 'break': N(0.35, 'highpass', 2800, 0.5); for (let i = 0; i < 6; i++) T(1800 + Math.random() * 2600, 0.12 + Math.random() * 0.2, 'sine', 0.08, null, t + i * 0.035); break;
      case 'jump': T(260, 0.14, 'square', 0.06, 520); break;
      case 'knock': T(220, 0.08, 'square', 0.15, 120); T(1400, 0.55, 'sine', 0.1, 260, t + 0.05); break;
      case 'alarm': for (let i = 0; i < 2; i++) { T(660, 0.22, 'sawtooth', 0.09, 880, t + i * 0.45); T(880, 0.22, 'sawtooth', 0.09, 660, t + i * 0.45 + 0.22); } break;
      case 'klaxon': for (let i = 0; i < 3; i++) { T(330, 0.25, 'sawtooth', 0.12, null, t + i * 0.32); T(415, 0.25, 'square', 0.06, null, t + i * 0.32); } break;
      case 'burst': N(1.6, 'lowpass', 3000, 0.9, 1, t, 200); T(60, 0.8, 'sine', 0.7, 25); N(2.2, 'highpass', 2000, 0.25, 0.5, t + 0.2); break;
      case 'ship': N(0.35, 'bandpass', 400, 0.3, 2, t, 3000); T(1320, 0.6, 'sine', 0.18, null, t + 0.3); T(1980, 0.5, 'sine', 0.08, null, t + 0.32); break;
      case 'paid': T(1600, 0.06, 'square', 0.08); T(2400, 0.25, 'square', 0.07, null, t + 0.07); N(0.15, 'highpass', 5000, 0.12, 1, t + 0.06); break;
      case 'reject': T(110, 0.4, 'sawtooth', 0.2); T(116, 0.4, 'sawtooth', 0.15); break;
      case 'scan': T(1500, 0.06, 'sine', 0.12); T(1900, 0.08, 'sine', 0.12, null, t + 0.09); break;
      case 'dispense': N(0.3, 'lowpass', 1200, 0.4, 1, t, 300); T(90, 0.2, 'sine', 0.3, 50, t + 0.12); break;
      case 'tube': N(0.6, 'bandpass', 300, 0.45, 1.5, t, 4000); break;
      case 'tubeout': N(0.25, 'bandpass', 2400, 0.35, 1.5, t, 400); T(300, 0.1, 'sine', 0.1, 600); break;
      case 'quota': [0, 4, 7, 12, 16].forEach((n, i) => T(NOTE(72 + n), 0.35, 'square', 0.08, null, t + i * 0.09)); [0, 4, 7].forEach((n) => T(NOTE(60 + n), 0.9, 'triangle', 0.12, null, t + 0.45)); break;
      case 'fail': [7, 4, 0, -5].forEach((n, i) => T(NOTE(60 + n), 0.3, 'square', 0.08, null, t + i * 0.18)); break;
      case 'phone': for (let i = 0; i < 10; i++) T(i % 2 ? 480 : 440, 0.05, 'square', 0.07, null, t + i * 0.05); break;
      case 'beep': T(880, 0.12, 'square', 0.1); break;
      case 'go': T(1320, 0.5, 'square', 0.1); break;
      case 'horn': { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(out); [220, 277, 330].forEach((fr) => this.tone(fr, 1.3, 'sawtooth', 0.12, null, f, t, 0.08)); break; }
      case 'powerdown': T(420, 0.9, 'sawtooth', 0.15, 30); N(0.5, 'lowpass', 600, 0.3); break;
      case 'powerup': T(40, 0.7, 'sawtooth', 0.12, 420); T(1200, 0.1, 'sine', 0.1, null, t + 0.6); break;
      case 'hop': T(200, 0.12, 'sine', 0.15, 500); break;
      case 'slosh': N(0.35, 'bandpass', 300, 0.35, 4, t, 900); break;
      case 'fixed': for (let i = 0; i < 4; i++) N(0.025, 'bandpass', 3500, 0.3, 4, t + i * 0.06); T(1046, 0.4, 'sine', 0.15, null, t + 0.26); T(1568, 0.4, 'sine', 0.1, null, t + 0.3); break;
      case 'wrench': N(0.03, 'bandpass', 4000, 0.2, 5); break;
      case 'paper': N(0.12, 'highpass', 4000, 0.25); break;
      case 'punch': N(0.05, 'lowpass', 800, 0.6); T(1760, 0.5, 'sine', 0.12, null, t + 0.05); break;
      case 'locker': [523, 731, 1110].forEach((f) => T(f, 0.4, 'square', 0.04)); N(0.1, 'bandpass', 1200, 0.4, 3); break;
      case 'vend': N(0.1, 'lowpass', 400, 0.5); N(0.6, 'highpass', 6000, 0.12, 1, t + 0.25); break;
      case 'spray': N(0.25, 'highpass', 5000, 0.2); break;
      case 'valve': N(0.2, 'bandpass', 1800, 0.18, 1); break;
      case 'shove': N(0.12, 'bandpass', 700, 0.35, 1.5); T(150, 0.1, 'square', 0.1, 90); break;
      case 'burn': N(0.6, 'lowpass', 1500, 0.4, 1, t, 300); T(80, 0.3, 'sawtooth', 0.12, 50); break;
      case 'airlock': N(1.0, 'lowpass', 500, 0.35, 1, t, 200); T(55, 1.0, 'sawtooth', 0.08); break;
      case 'denied': T(180, 0.12, 'square', 0.15); T(140, 0.15, 'square', 0.15, null, t + 0.13); break;
      case 'select': T(660, 0.06, 'triangle', 0.15); T(990, 0.08, 'triangle', 0.12, null, t + 0.06); break;
    }
  }

  voice(pid, kind, x, z) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.t;
    if (this.voiceLast[pid] && now - this.voiceLast[pid] < 0.35) return;
    this.voiceLast[pid] = now;
    const out = this.panned(x, z, 0.9);
    const base = 180 + ((pid * 53) % 7) * 28;
    const sylls = { oof: 1, yelp: 2, wee: 3, hot: 3, escape: 2, hello: 3 }[kind] || 2;
    const vowels = [[800, 1200], [400, 2000], [300, 900], [600, 1000], [350, 2300]];
    let t = now;
    for (let i = 0; i < sylls; i++) {
      const dur = kind === 'wee' ? 0.22 : 0.11 + Math.random() * 0.07;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      let f0 = base * (kind === 'oof' ? 0.7 : kind === 'yelp' ? 1.5 : 1) * (1 + (Math.random() - 0.5) * 0.25);
      if (kind === 'wee') f0 *= 1 + i * 0.25;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (kind === 'oof' ? 0.6 : kind === 'wee' ? 1.6 : 1.15), t + dur);
      const v = vowels[Math.floor(Math.random() * vowels.length)];
      const g = this.ctx.createGain();
      this.env(g, t, 0.015, 0.22, dur);
      const sum = this.ctx.createGain(); sum.gain.value = 1;
      for (const ff of v) {
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ff; f.Q.value = 6;
        o.connect(f).connect(sum);
      }
      sum.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.03);
      t += dur * 0.9;
    }
  }

  // ───────── machine loops ─────────
  startLoops() {
    const ctx = this.ctx;
    const mk = (build) => { const g = ctx.createGain(); g.gain.value = 0; build(g); g.connect(this.loopBus); return g; };
    this.loops.belt = mk((g) => {
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180; f.Q.value = 0.8;
      s.connect(f).connect(g); s.start();
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
      const og = ctx.createGain(); og.gain.value = 0.15; const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 200;
      o.connect(lf).connect(og).connect(g); o.start();
    });
    this.loops.fan = mk((g) => {
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      s.connect(f).connect(g); s.start();
    });
    this.loops.boiler = mk((g) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 38; o.connect(g); o.start();
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
      const sg = ctx.createGain(); sg.gain.value = 0.25;
      s.connect(f).connect(sg).connect(g); s.start();
      this.boilerHiss = sg;
    });
  }

  setLoop(name, vol) {
    if (!this.ctx || !this.loops[name]) return;
    this.loops[name].gain.setTargetAtTime(vol, this.t, 0.15);
  }

  // ───────── music ─────────
  setMood(m, intensity = 0) {
    this.intensity = intensity;
    if (m === this.mood) return;
    this.mood = m;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(m === 'lobby' ? 1800 : m === 'report' ? 2500 : 18000, this.t, 0.3);
  }

  schedule() {
    if (!this.ctx || this.mood === 'off' || this.ctx.state !== 'running') return;
    const fast = this.mood === 'shift' || this.mood === 'overtime';
    const bpm = this.mood === 'overtime' ? 132 : fast ? 116 : 90;
    const stepDur = 60 / bpm / 4;
    if (this.nextTime < this.t - 0.2) this.nextTime = this.t + 0.05;
    while (this.nextTime < this.t + 0.15) {
      if (fast) this.shiftStep(this.step, this.nextTime, stepDur);
      else this.loungeStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 128;
      this.nextTime += stepDur;
    }
  }

  kick(t, v = 0.5) { this.tone(140, 0.22, 'sine', v, 40, this.music, t); }
  snare(t, v = 0.25) { this.noise(0.16, 'bandpass', 1800, v, 0.8, this.music, t); this.tone(220, 0.08, 'triangle', v * 0.4, 160, this.music, t); }
  hat(t, v = 0.08, open = false) { this.noise(open ? 0.18 : 0.04, 'highpass', 7500, v, 1, this.music, t); }

  loungeStep(step, t, sd) {
    // easy-listening "head office" groove: ii-V-I-VI in C with brushed drums
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chords = [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 61, 64, 67]];
    const roots = [38, 43, 36, 45];
    const ch = chords[bar];
    if (s === 0 || s === 10) for (const n of ch) this.tone(NOTE(n), sd * 7, 'triangle', 0.035, null, this.music, t, 0.02);
    if (s === 0 || s === 10) for (const n of ch) this.tone(NOTE(n) * 1.003, sd * 6, 'sine', 0.03, null, this.music, t, 0.02);
    if (s % 4 === 0) { const walk = [0, 7, 12, 10][s / 4]; this.tone(NOTE(roots[bar] + walk), sd * 3.5, 'triangle', 0.16, null, this.music, t, 0.01); }
    if (s === 0 || s === 8) this.kick(t, 0.22);
    if (s === 4 || s === 12) this.noise(0.18, 'bandpass', 3000, 0.07, 0.6, this.music, t);
    if (s % 2 === 1) this.hat(t, 0.025);
    // little vibraphone melody
    const mel = [76, null, 74, null, 72, null, null, 69, 71, null, 72, null, 74, null, null, null];
    if (bar % 2 === 1 && mel[s]) this.tone(NOTE(mel[s]), sd * 3, 'sine', 0.05, null, this.music, t, 0.005);
  }

  shiftStep(step, t, sd) {
    // funky factory groove; layers added with intensity / overtime
    const ot = this.mood === 'overtime';
    const tr = ot ? 2 : 0;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const I = this.intensity;
    if (s % 4 === 0 || (s === 14 && bar % 2)) this.kick(t, 0.45);
    if (s === 4 || s === 12) this.snare(t, 0.22);
    if (s % 2 === 0) this.hat(t, 0.05, s === 6 || s === 14);
    if (I > 0 && s % 2 === 1) this.hat(t, 0.025);
    // bassline
    const bassPat = [0, null, 0, 12, null, 10, null, 7, 0, null, 3, null, 5, null, 7, 10];
    const roots = [36, 36, 41, 43];
    const bn = bassPat[s];
    if (bn !== null) {
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700 + I * 400; f.Q.value = 6; f.connect(this.music);
      this.tone(NOTE(roots[bar] + bn + tr), sd * 1.6, 'sawtooth', 0.12, null, f, t, 0.005);
    }
    // marimba riff
    const riff = [72, null, 75, 77, null, 79, null, 77, 75, null, 72, null, 70, null, 72, null];
    if (riff[s] && (bar !== 3 || s < 8)) this.tone(NOTE(riff[s] + tr), sd * 1.5, 'sine', 0.07 + I * 0.02, null, this.music, t, 0.002);
    // tension stabs when incidents are active
    if (I > 1 && (s === 2 || s === 10)) for (const n of [60, 63, 66]) this.tone(NOTE(n + tr + 12), sd * 0.8, 'square', 0.025, null, this.music, t);
    if (ot && s === 0) this.tone(NOTE(84 + tr), sd * 2, 'square', 0.03, null, this.music, t);
  }
}
