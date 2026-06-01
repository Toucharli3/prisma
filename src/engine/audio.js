// audio.js — moteur audio 100% procédural (Web Audio API, aucun fichier externe).
// SFX = oscillateurs + enveloppes courtes ; musique = boucle synthé générative
// planifiée avec un lookahead (pas de lag). Le contexte est créé au 1er geste
// utilisateur (politique d'autoplay des navigateurs).

const SEMI = Math.pow(2, 1 / 12);
const MINOR = [1, SEMI ** 3, SEMI ** 7, 2]; // triade mineure (ratios)
const BIOME_SEMITONE = [0, 2, 4, -1, 3]; // décalage de tonalité par biome

export const Audio = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  muted: false,
  sfxVol: 0.6,
  musicVol: 0.45,
  root: 130.81, // C3
  chord: MINOR,

  _noise: null,
  _last: {},
  _step: 0,
  _nextNoteTime: 0,
  _stepDur: 60 / 84 / 4, // 16e de note à 84 BPM
  _musicTimer: null,

  // Enregistre un déclenchement au 1er geste (clic/clavier).
  init() {
    const start = () => this._ensure();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
  },

  _ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // Compresseur de sécurité (évite la saturation quand beaucoup de SFX).
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 12;
    comp.connect(ctx.destination);
    this.master = comp;

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.muted ? 0 : this.sfxVol;
    this.sfxGain.connect(comp);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.muted ? 0 : this.musicVol;
    this.musicGain.connect(comp);

    // Buffer de bruit blanc réutilisable (impacts / explosions).
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;

    this._nextNoteTime = ctx.currentTime + 0.1;
    this._scheduleMusic();
  },

  // --- Réglages ---
  setMuted(m) {
    this.muted = m;
    if (this.sfxGain) this.sfxGain.gain.value = m ? 0 : this.sfxVol;
    if (this.musicGain) this.musicGain.gain.value = m ? 0 : this.musicVol;
  },
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  },
  setSfxVol(v) {
    this.sfxVol = v;
    if (this.sfxGain && !this.muted) this.sfxGain.gain.value = v;
  },
  setMusicVol(v) {
    this.musicVol = v;
    if (this.musicGain && !this.muted) this.musicGain.gain.value = v;
  },
  setBiome(index) {
    this.root = 130.81 * Math.pow(2, (BIOME_SEMITONE[index % BIOME_SEMITONE.length] || 0) / 12);
  },

  // --- Primitives ---
  _throttle(name, gap) {
    const t = this.ctx ? this.ctx.currentTime : 0;
    if (this._last[name] && t - this._last[name] < gap) return false;
    this._last[name] = t;
    return true;
  },

  // Note synthé : oscillateur + enveloppe exponentielle (+ filtre passe-bas opt.).
  _tone(type, freq, freqEnd, dur, vol, bus, lpf) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd && freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (lpf) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lpf;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(bus || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  },

  _noiseBurst(dur, vol, lpf) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lpf || 1800;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  },

  // --- SFX ---
  shoot() {
    if (!this.ctx || !this._throttle('shoot', 0.045)) return;
    this._tone('square', 680 + Math.random() * 80, 420, 0.06, 0.12, this.sfxGain, 2600);
  },
  kill() {
    if (!this.ctx || !this._throttle('kill', 0.04)) return;
    const f = 460 + Math.random() * 160;
    this._tone('triangle', f, f * 0.35, 0.12, 0.2, this.sfxGain);
    this._noiseBurst(0.07, 0.12, 2400);
  },
  pickup() {
    if (!this.ctx || !this._throttle('pickup', 0.05)) return;
    this._tone('sine', 880 + Math.random() * 120, 1320, 0.08, 0.1, this.sfxGain);
  },
  hit() {
    if (!this.ctx) return;
    this._tone('square', 220, 70, 0.2, 0.32, this.sfxGain, 1400);
    this._noiseBurst(0.18, 0.3, 1200);
  },
  levelup() {
    if (!this.ctx) return;
    const base = 523;
    [0, 4, 7, 12].forEach((s, i) => {
      const t0 = this.ctx.currentTime + i * 0.07;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = base * Math.pow(SEMI, s);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.33);
    });
  },
  nova() {
    if (!this.ctx || !this._throttle('nova', 0.12)) return;
    this._tone('sawtooth', 180, 60, 0.3, 0.22, this.sfxGain, 900);
    this._noiseBurst(0.28, 0.22, 1400);
  },
  bossShoot() {
    if (!this.ctx || !this._throttle('bossShoot', 0.09)) return;
    this._tone('sawtooth', 150, 80, 0.12, 0.14, this.sfxGain, 1200);
  },
  bossSpawn() {
    if (!this.ctx) return;
    this._tone('sawtooth', 70, 220, 0.7, 0.3, this.sfxGain, 800);
    this._noiseBurst(0.6, 0.18, 600);
  },
  bossDeath() {
    if (!this.ctx) return;
    this._tone('sawtooth', 240, 40, 0.8, 0.3, this.sfxGain, 1000);
    this._noiseBurst(0.7, 0.3, 1600);
  },
  levelComplete() {
    if (!this.ctx) return;
    const base = 523;
    [0, 4, 7, 11, 12].forEach((s, i) => {
      const t0 = this.ctx.currentTime + i * 0.09;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = base * Math.pow(SEMI, s);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  },
  victory() {
    if (!this.ctx) return;
    const base = 523;
    [0, 4, 7, 12, 16, 19].forEach((s, i) => {
      const t0 = this.ctx.currentTime + i * 0.12;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = base * Math.pow(SEMI, s);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    });
  },
  gameover() {
    if (!this.ctx) return;
    [0, -3, -7, -12].forEach((s, i) => {
      const t0 = this.ctx.currentTime + i * 0.14;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 330 * Math.pow(SEMI, s);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200;
      osc.connect(f).connect(g).connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  },
  uiMove() {
    if (!this.ctx || !this._throttle('uiMove', 0.04)) return;
    this._tone('square', 440, 520, 0.04, 0.08, this.sfxGain, 3000);
  },
  uiSelect() {
    if (!this.ctx) return;
    this._tone('triangle', 660, 990, 0.1, 0.14, this.sfxGain);
  },

  // --- Musique générative (lookahead scheduler) ---
  _scheduleMusic() {
    if (!this.ctx) return;
    while (this._nextNoteTime < this.ctx.currentTime + 0.12) {
      this._playStep(this._step, this._nextNoteTime);
      this._nextNoteTime += this._stepDur;
      this._step = (this._step + 1) % 16;
    }
    this._musicTimer = setTimeout(() => this._scheduleMusic(), 25);
  },

  _musNote(type, freq, t, dur, vol, lpf) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lpf;
    osc.connect(f).connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  },

  _playStep(step, t) {
    // Basse douce (demi-notes).
    if (step === 0 || step === 8) this._musNote('triangle', this.root * 0.5, t, 0.95, 0.22, 700);
    // Arpège montant clairsemé.
    if (step % 2 === 0) this._musNote('sine', this.root * this.chord[(step >> 1) % 4], t, 0.35, 0.07, 1800);
    // Nappe haute occasionnelle.
    if (step === 6 || step === 14) this._musNote('sine', this.root * 2 * this.chord[1], t, 0.55, 0.045, 2200);
  },
};
