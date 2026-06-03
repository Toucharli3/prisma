// save.js — méta-progression persistante (localStorage) : highscore, déblocages
// (armes de départ) et réglages. Robuste si localStorage est indisponible.

import { CONFIG } from '../config.js';
import { Audio } from './audio.js';

const KEY = 'prisma.save.v2'; // v2 : remise à zéro (anciens scores de test effacés)

// Paliers de déblocage : armes de départ supplémentaires.
const MILESTONES = [
  { id: 'start_onde', weapon: 'onde', label: 'Onde — arme de départ', test: (d) => d.furthestBiome >= 3 },
  { id: 'start_orbital', weapon: 'orbital', label: 'Orbital — arme de départ', test: (d) => d.wins >= 1 },
];

const DEFAULTS = () => ({
  name: '',
  skin: 'prisme',
  highScore: 0,
  bestCombo: 0,
  runs: 0,
  wins: 0,
  furthestBiome: 1,
  unlocked: [],
  settings: { aimMode: 'auto', perf: false, music: 0.45, sfx: 0.6, muted: false },
});

export const Save = {
  data: DEFAULTS(),
  MILESTONES,

  load() {
    this.data = DEFAULTS();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const settings = Object.assign(DEFAULTS().settings, parsed.settings || {});
        this.data = Object.assign(DEFAULTS(), parsed, { settings });
      }
    } catch (e) {
      this.data = DEFAULTS();
    }
    return this.data;
  },

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      /* localStorage indisponible (mode privé...) : on ignore silencieusement */
    }
  },

  // Applique les réglages sauvegardés à CONFIG / Audio (au démarrage).
  applySettings() {
    const s = this.data.settings;
    CONFIG.aimMode = s.aimMode;
    CONFIG.perf = s.perf;
    Audio.setMusicVol(s.music);
    Audio.setSfxVol(s.sfx);
    Audio.setMuted(s.muted);
  },

  // Capture les réglages courants et persiste (appelé depuis les options).
  syncSettings() {
    this.data.settings = {
      aimMode: CONFIG.aimMode,
      perf: CONFIG.perf,
      music: Audio.musicVol,
      sfx: Audio.sfxVol,
      muted: Audio.muted,
    };
    this.persist();
  },

  // Enregistre une partie terminée. Renvoie { newHighScore, newlyUnlocked:[labels] }.
  recordRun(stats, won) {
    const d = this.data;
    d.runs++;
    if (won) d.wins++;
    const newHigh = stats.score > d.highScore;
    if (newHigh) d.highScore = stats.score;
    if (stats.bestCombo > d.bestCombo) d.bestCombo = stats.bestCombo;
    if (stats.biome > d.furthestBiome) d.furthestBiome = stats.biome;

    const newlyUnlocked = [];
    for (const m of MILESTONES) {
      if (!d.unlocked.includes(m.id) && m.test(d)) {
        d.unlocked.push(m.id);
        newlyUnlocked.push(m.label);
      }
    }
    this.persist();
    return { newHighScore: newHigh, newlyUnlocked };
  },

  // Armes de départ débloquées (en plus de l'Éclat).
  startingWeapons() {
    return MILESTONES.filter((m) => this.data.unlocked.includes(m.id)).map((m) => m.weapon);
  },

  setName(n) {
    this.data.name = (n || '').slice(0, 16);
    this.persist();
  },

  // --- Skins ---
  unlockedSkins() {
    return CONFIG.skins.filter((k) => this.data.furthestBiome >= k.biome);
  },
  getSkin() {
    return CONFIG.skins.find((k) => k.id === this.data.skin) || CONFIG.skins[0];
  },
  setSkin(id) {
    this.data.skin = id;
    this.persist();
  },
  cycleSkin(dir) {
    const list = this.unlockedSkins();
    let i = list.findIndex((k) => k.id === this.data.skin);
    if (i < 0) i = 0;
    i = (i + dir + list.length) % list.length;
    this.setSkin(list[i].id);
  },
};
