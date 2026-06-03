// config.js — TOUTES les constantes de gameplay, d'équilibrage et de DA.
// Centralisées ici pour une itération facile. (Étendu phase par phase.)

export const CONFIG = {
  // --- Debug / perf ---
  debug: false, // overlay FPS + infos (bascule avec F3)
  perf: false, // mode performance : réduit particules, désactive scanlines/floaters
  maxDPR: 1.5, // plafond devicePixelRatio (évite le sur-rendu HiDPI sur GPU intégré)

  // --- Juice / options ---
  maxShake: 24, // amplitude max du screen shake (px)
  comboWindow: 2.4, // délai (s) avant reset du combo
  aimMode: 'auto', // 'auto' | 'mouse' (réglage, appliqué au démarrage de partie)

  // --- Score (classement) ---
  score: {
    perKill: 10, // × combo × (1 + profondeur)
    depthBonus: 0.08, // bonus de score par biome de profondeur
    biomeClear: 500, // bonus à la purification d'un biome (× n° de biome)
    bossKill: 300, // bonus à la mort d'un boss (× n° de biome)
  },

  // --- Mode sans fin (au-delà de la campagne de 5 biomes) ---
  // La difficulté ne plafonne PLUS (sauf la vitesse) : PV, DÉGÂTS et densité montent
  // sans fin -> la mort devient inévitable, la run se termine selon le skill.
  endless: {
    hpGrowth: 1.17, // PV ennemis × par biome supplémentaire
    speedCap: 2.05, // seul plafond (sinon injouable)
    intervalDecay: 1.06,
    intervalMin: 0.28,
    batchEvery: 2,
    maxAliveCap: 260, // plafond perf (testé OK ~60 fps)
    killsGrowth: 0.1,
    // Dégâts ennemis (contact + balles) × damageBase^biome sur TOUS les biomes.
    // C'est CE qui finit par tuer un joueur optimisé.
    damageBase: 1.125,
  },

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

  // Skins du Prisme (cosmétique). Débloqués en atteignant le biome `biome`.
  skins: [
    { id: 'prisme', name: 'Prisme', core: '#ffffff', glow: '#00e5ff', biome: 0 },
    { id: 'braise', name: 'Braise', core: '#ffffff', glow: '#ff8a00', biome: 2 },
    { id: 'maree', name: 'Marée', core: '#ffffff', glow: '#18ffd5', biome: 3 },
    { id: 'verdoyant', name: 'Verdoyant', core: '#ffffff', glow: '#2bff88', biome: 4 },
    { id: 'nebuleuse', name: 'Nébuleuse', core: '#ffffff', glow: '#b14dff', biome: 5 },
    { id: 'aurum', name: 'Aurum', core: '#fff3b0', glow: '#ffd000', biome: 6 },
  ],

  // Stats du joueur (équilibrage de base)
  playerStats: {
    radius: 13,
    speed: 275, // px/s
    maxHp: 140, // plus de survie -> parties plus longues
    regen: 1.2, // régénération passive (PV/s) -> les dégâts mineurs ne sont pas permanents
    collectRadius: 145, // rayon de l'aimant fort
    iframes: 0.95, // invincibilité après un coup reçu (s)
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
  // hp/speed sont multipliés par les facteurs de niveau.
  enemyTypes: {
    triangle: { key: 'triangle', sides: 3, radius: 13, hp: 8, speed: 146, damage: 7, xp: 1 },
    square: { key: 'square', sides: 4, radius: 18, hp: 32, speed: 78, damage: 13, xp: 3 },
    pentagon: {
      key: 'pentagon',
      sides: 5,
      radius: 16,
      hp: 22,
      speed: 78,
      damage: 9,
      xp: 4,
      behavior: 'shooter', // garde ses distances et tire des projectiles
      preferredRange: 330,
      shootCooldown: 1.7,
      bulletSpeed: 300,
      bulletDamage: 8,
    },
    dasher: {
      key: 'dasher',
      sides: 3,
      radius: 12,
      hp: 14,
      speed: 95, // vitesse de croisière
      damage: 11,
      xp: 2,
      behavior: 'dasher', // s'approche puis CHARGE par à-coups
      dashSpeed: 540,
      dashRange: 320, // déclenche la charge sous cette distance
      dashCd: 1.7,
      dashDuration: 0.32,
    },
    splitter: {
      key: 'splitter',
      sides: 4,
      radius: 21,
      hp: 42,
      speed: 56,
      damage: 12,
      xp: 4,
      behavior: 'split', // se scinde en triangles à la mort
      splitInto: 3,
      splitType: 'triangle',
    },
  },
  enemyBulletMax: 600,

  // --- Boss — stats de base, mises à l'échelle par niveau. 2 variantes alternées. ---
  boss: {
    radius: 52,
    baseHp: 420,
    hpPerLevel: 0.6, // hp = baseHp * (1 + index * hpPerLevel)
    speed: 54,
    contactDamage: 18,
    bulletDamage: 8,
    bulletSpeed: 240,
    patternCd: 1.7,
    rotSpeed: 0.5,
    xp: 40,
    // `patterns` = indices des patterns définis dans entities/boss.js.
    variants: [
      { sides: 6, color: '#ff2d55', name: 'LE STATIQUE', patterns: [0, 1, 2] }, // hexagone
      { sides: 8, color: '#7a3cff', name: 'LE VIDE', patterns: [3, 4, 2] }, // octogone
    ],
  },

  // --- Niveaux (data-driven). Palette = PALETTES[index]. Boss déclenché à
  // bossTrigger (% de couleur) ; le dernier 1-bossTrigger est gated par le boss. ---
  // Démarrage doux, montée régulière (la mort doit arriver après plusieurs minutes).
  levels: [
    {
      killsToFull: 34,
      bossTrigger: 0.78,
      spawn: { firstDelay: 1.0, interval: 1.05, batch: 3, maxAlive: 70, spawnDist: 720, types: ['triangle', 'triangle', 'square'], hpScale: 1, speedScale: 1 },
    },
    {
      killsToFull: 48,
      bossTrigger: 0.78,
      spawn: { firstDelay: 0.8, interval: 0.95, batch: 4, maxAlive: 90, spawnDist: 720, types: ['triangle', 'triangle', 'square', 'pentagon', 'dasher'], hpScale: 1.25, speedScale: 1.06 },
    },
    {
      killsToFull: 62,
      bossTrigger: 0.78,
      spawn: { firstDelay: 0.7, interval: 0.85, batch: 4, maxAlive: 110, spawnDist: 740, types: ['triangle', 'square', 'pentagon', 'dasher', 'splitter'], hpScale: 1.6, speedScale: 1.12 },
    },
    {
      killsToFull: 78,
      bossTrigger: 0.78,
      spawn: { firstDelay: 0.7, interval: 0.76, batch: 5, maxAlive: 135, spawnDist: 760, types: ['triangle', 'square', 'pentagon', 'dasher', 'splitter', 'square'], hpScale: 2.0, speedScale: 1.18 },
    },
    {
      killsToFull: 94,
      bossTrigger: 0.78,
      spawn: { firstDelay: 0.6, interval: 0.66, batch: 6, maxAlive: 160, spawnDist: 780, types: ['triangle', 'square', 'pentagon', 'dasher', 'splitter', 'triangle'], hpScale: 2.5, speedScale: 1.26 },
    },
  ],

  // --- Armes (data-driven). kind: projectile | orbital | nova ---
  weapons: {
    eclat: {
      name: 'Éclat',
      kind: 'projectile',
      auto: true,
      cooldown: 0.27,
      damage: 7,
      speed: 640,
      bulletRadius: 5,
      life: 1.0,
      pierce: 0,
      count: 1,
      countPerLevel: 0.5, // +1 projectile tous les 2 niveaux
      spread: 0.13,
      color: '#00e5ff',
    },
    onde: {
      name: 'Onde',
      kind: 'projectile',
      auto: true,
      cooldown: 0.72,
      damage: 10,
      speed: 520,
      bulletRadius: 7,
      life: 1.5,
      pierce: 3,
      piercePerLevel: 1, // transperce de plus en plus d'ennemis
      count: 1,
      spread: 0,
      color: '#18ffd5',
    },
    orbital: {
      name: 'Orbital',
      kind: 'orbital',
      damage: 6, // par contact (avec cooldown par ennemi)
      count: 2,
      countPerLevel: 0.5,
      radius: 82, // rayon d'orbite
      rotSpeed: 2.3, // rad/s
      nodeRadius: 11,
      color: '#b14dff',
    },
    nova: {
      name: 'Nova',
      kind: 'nova',
      cooldown: 2.6,
      damage: 16,
      radius: 150, // multiplié par mods.areaMul
      color: '#ff4dd2',
    },
    foudre: {
      name: 'Foudre',
      kind: 'chain', // frappe une cible puis rebondit sur les voisins
      cooldown: 0.95,
      damage: 12,
      chainRange: 240, // portée de rebond
      chainCount: 4, // nombre de cibles touchées
      countPerLevel: 1, // +1 rebond / niveau
      color: '#b6ff3c',
    },
    faisceau: {
      name: 'Faisceau',
      kind: 'beam', // rayon instantané qui traverse tout sur une ligne
      cooldown: 1.0,
      damage: 9,
      beamLength: 540,
      beamWidth: 18,
      color: '#ff4dd2',
    },
  },
  maxWeapons: 6, // emplacements d'armes
  maxWeaponLevel: 8,
  bulletMax: 420,

  // --- Particules (plafonnées ; réduites en mode perf) ---
  particles: { max: 1500, killBurst: 16, killBurstPerf: 8 },

  // --- Restauration de couleur (mécanisme signature) ---
  colorfield: { cols: 48, rows: 32, splashRadius: 2.6, ambientMax: 0.2, killsToFull: 55 },

  // --- XP / niveaux ---
  // Courbe modérée : level-ups réguliers SANS exploser (sinon plus aucun choix en
  // fin). L'XP des orbes monte avec la profondeur (orbXpDepth) pour garder la
  // cadence ~constante quel que soit le biome.
  xp: { base: 14, growth: 1.16, orbXpDepth: 0.22 }, // requis = base*growth^(niv-1) ; orbe ×(1+biome*orbXpDepth)
  levelUp: { slowmoTime: 0.35, slowmoScale: 0.18 }, // ralenti à la montée de niveau
  orbMax: 400,
  orb: { radius: 7, magnetSpeed: 560, lifetime: 26 },
};

// Palettes par niveau / biome — la couleur que le monde « reprend ».
export const PALETTES = [
  { name: 'Braise', colors: ['#ff4d00', '#ff8a00', '#ffd000'] },
  { name: 'Marée', colors: ['#00b4ff', '#00e5ff', '#18ffd5'] },
  { name: 'Verdoyant', colors: ['#00d97e', '#2bff88', '#b6ff3c'] },
  { name: 'Nébuleuse', colors: ['#7a3cff', '#b14dff', '#ff4dd2'] },
  { name: 'Aurum', colors: ['#ff9a00', '#ffd000', '#fff3b0'] },
  { name: 'Givre', colors: ['#3ad0ff', '#8af0ff', '#e8ffff'] },
  { name: 'Sang', colors: ['#ff0033', '#ff4d6a', '#ff9bb0'] },
];
