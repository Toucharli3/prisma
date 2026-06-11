// save.js — méta-progression persistante (localStorage) : highscore, déblocages
// (armes de départ) et réglages. Robuste si localStorage est indisponible.

import { CONFIG } from '../config.js';
import { Audio } from './audio.js';

const KEY = 'prisma.save.v2'; // v2 : remise à zéro (anciens scores de test effacés)

// Vérifie la condition de déblocage d'un skin pour la partie qui vient de finir.
function skinUnlocked(unlock, stats) {
  switch (unlock.type) {
    case 'tier':
      return (stats.biome || 1) >= unlock.value;
    case 'combo':
      return (stats.bestCombo || 0) >= unlock.value;
    case 'surviveMin':
      return (stats.time || 0) >= unlock.value * 60;
    case 'bossKills':
      return (stats.bossKills || 0) >= unlock.value;
    case 'bombs':
      return (stats.bombsUsed || 0) >= unlock.value;
    case 'score':
      return (stats.score || 0) >= unlock.value;
    default:
      return false;
  }
}

const DEFAULTS = () => ({
  name: '',
  skin: 'etincelle',
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

    // Accomplissements -> skins débloqués.
    const newlyUnlocked = [];
    for (const s of CONFIG.skins) {
      if (s.unlock.type === 'start' || d.unlocked.includes(s.id)) continue;
      if (skinUnlocked(s.unlock, stats)) {
        d.unlocked.push(s.id);
        newlyUnlocked.push(`Skin « ${s.name} » (${s.unlock.label})`);
      }
    }
    this.persist();
    return { newHighScore: newHigh, newlyUnlocked };
  },

  setName(n) {
    this.data.name = (n || '').slice(0, 16);
    this.persist();
  },

  // --- Skins ---
  unlockedSkins() {
    return CONFIG.skins.filter((k) => k.unlock.type === 'start' || this.data.unlocked.includes(k.id));
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
