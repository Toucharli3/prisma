// config.js — TOUTES les constantes de gameplay, d'équilibrage et de DA.
// Centralisées ici pour une itération facile. (Étendu phase par phase.)

export const CONFIG = {
  // --- Debug / perf ---
  debug: true, // overlay FPS + infos (désactivable)
  perf: false, // mode performance : réduit particules, désactive scanlines (Phase 8)
  maxDPR: 1.5, // plafond devicePixelRatio (évite le sur-rendu HiDPI sur GPU intégré)

  // --- Couleurs de base / UI (DA section 2) ---
  bgColor: '#0a0a0f',
  gridColor: '#1a1a2e',
  gridSize: 64,
  textPrimary: '#e8e8ff',
  textSecondary: '#8a8a99',
  danger: '#ff2d55',

  // Couleur du joueur (le Prisme)
  player: {
    coreColor: '#ffffff',
    glowColor: '#00e5ff',
  },

  // Stats du joueur (équilibrage de base)
  playerStats: {
    radius: 13,
    speed: 270, // px/s
    maxHp: 100,
    collectRadius: 95, // rayon de ramassage des orbes (Phase 4)
    iframes: 0.8, // invincibilité après un coup reçu (s) (Phase 2)
  },

  // Couleur des ennemis « vidés » (avant destruction)
  enemyGrayA: '#6b6b78',
  enemyGrayB: '#8a8a99',

  // --- Arène ---
  arena: {
    width: 2600,
    height: 1800,
    margin: 80, // marge intérieure des murs
  },

  // --- Collisions ---
  grid: { cell: 110 },

  // --- Ennemis (formes vectorielles « vidées ») ---
  // hp/speed sont multipliés par les facteurs de niveau (Phase 6).
  enemyTypes: {
    triangle: { key: 'triangle', sides: 3, radius: 13, hp: 8, speed: 130, damage: 7, xp: 1 },
    square: { key: 'square', sides: 4, radius: 18, hp: 32, speed: 64, damage: 13, xp: 3 },
  },

  // Spawner basique (Phase 2). Remplacé par un spawner data-driven par niveau (Phase 6).
  spawnBasic: {
    firstDelay: 1.0,
    interval: 1.35,
    batch: 3,
    maxAlive: 90,
    spawnDist: 740, // anneau d'apparition autour du joueur (hors écran)
    types: ['triangle', 'triangle', 'square'], // pondération par répétition
    hpScale: 1,
    speedScale: 1,
  },

  // --- Armes (data-driven). kind: projectile | orbital | nova (Phase 4) ---
  weapons: {
    eclat: {
      name: 'Éclat',
      kind: 'projectile',
      auto: true,
      cooldown: 0.3,
      damage: 6,
      speed: 640,
      bulletRadius: 5,
      life: 1.0,
      pierce: 0,
      count: 1,
      countPerLevel: 0.5, // +1 projectile tous les 2 niveaux
      spread: 0.13,
      color: '#00e5ff',
    },
  },
  bulletMax: 420,

  // --- Particules (plafonnées ; réduites en mode perf) ---
  particles: { max: 1500, killBurst: 16, killBurstPerf: 8 },
};

// Palettes par niveau / biome — la couleur que le monde « reprend ».
export const PALETTES = [
  { name: 'Braise', colors: ['#ff4d00', '#ff8a00', '#ffd000'] },
  { name: 'Marée', colors: ['#00b4ff', '#00e5ff', '#18ffd5'] },
  { name: 'Verdoyant', colors: ['#00d97e', '#2bff88', '#b6ff3c'] },
  { name: 'Nébuleuse', colors: ['#7a3cff', '#b14dff', '#ff4dd2'] },
  { name: 'Aurum', colors: ['#ff9a00', '#ffd000', '#fff3b0'] },
];
