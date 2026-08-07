// config.js — TOUTES les constantes de gameplay, d'équilibrage et de DA.
// Centralisées ici pour une itération facile. (Étendu phase par phase.)

export const CONFIG = {
  // --- Debug / perf ---
  debug: false, // overlay FPS + infos (bascule avec F3)
  perf: false, // mode performance : réduit particules, désactive scanlines/floaters
  maxDPR: 1.5, // plafond devicePixelRatio (évite le sur-rendu HiDPI sur GPU intégré)

  // Bloom plein écran (postprocess Canvas 2D pur, aucun WebGL, aucune lib).
  // C'est CE qui fait qu'un jeu néon a l'air néon : les halos pré-rendus par
  // sprite ne donnent qu'une lueur locale, le bloom fait déborder la lumière
  // sur toute l'image. Coût : deux blits sur des tampons réduits (1/4 puis 1/8).
  // thresholdPasses : nombre de multiplications de l'image par elle-même avant
  // le flou. 1 passe (couleur²) laissait le champ de couleur — une grande zone
  // diffuse et saturée — déborder et noyer toute l'image. 2 passes (couleur⁴)
  // écrasent le diffus et ne gardent que les sources vraiment vives.
  bloom: { enabled: true, strength: 0.26, thresholdPasses: 2 },

  // Arrêt sur image (« hitstop ») : durée de gel du monde selon l'impact. Très
  // court par construction — au-delà de ~0.2 s le jeu paraît saccadé.
  hitstop: { enabled: true, eliteKill: 0.045, bomb: 0.07, burst: 0.11, bossHurt: 0.05, bossKill: 0.2, playerHurt: 0.06 },

  // Vibration manette (Gamepad Haptics). Ignorée si la manette ne la gère pas.
  rumble: { enabled: true },

  // Relance / bannissement sur l'écran de niveau. C'est LE levier de contrôle
  // du genre : sans lui, une main de trois cartes inutiles est subie. Bannir
  // retire définitivement la carte du tirage de la partie, ce qui permet de
  // « nettoyer » le paquet pour faire remonter les cartes de son build.
  picks: { rerolls: 3, banishes: 2 },

  // Chaîne GPU (engine/postfx.js). Quand WebGL2 est disponible, elle REMPLACE
  // le bloom Canvas 2D ci-dessus ainsi que la vignette et les scanlines : le
  // seuil y est calculé sur la luminance (et non canal par canal), ce qui
  // sépare enfin une grande nappe colorée d'un projectile lumineux.
  postfx: {
    enabled: true,
    threshold: 0.68, // luminance à partir de laquelle un pixel « brille »
    soft: 0.28, // genou : évite une bascule franche et scintillante
    radius: 1.7, // écartement des prises du flou (en texels du tampon réduit)
    strength: 0.8, // dosage du bloom ajouté à la scène
    // Décalage RVB en ESPACE UV : off = d·aberration·r², soit aberration/4 dans
    // les coins. 0.012 ≈ 3 px sur 1280 — au-delà, le HUD se dédouble et les
    // canaux, venant d'endroits différents, virent au vert.
    aberration: 0.007,
    vignette: 0.5,
    scanline: 0.05,
    saturation: 1.12, // le monde « reprend des couleurs »
  },

  // --- Juice / options ---
  maxShake: 24, // amplitude max du screen shake (px)
  comboWindow: 2.4, // délai (s) avant reset du combo
  aimMode: 'auto', // 'auto' | 'mouse' (réglage, appliqué au démarrage de partie)

  // --- Score (classement) ---
  score: {
    perKill: 10, // × combo × (1 + profondeur)
    depthBonus: 0.08, // bonus de score par biome de profondeur
    bossKill: 300, // bonus à la mort d'un boss (× n° de biome)
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

  // Skins du Prisme : de vraies FORMES, débloquées par des ACCOMPLISSEMENTS.
  // unlock.type : start | tier (palier atteint) | bossKills (en une partie) |
  // combo | surviveMin | bombs (utilisées en une partie) | score
  skins: [
    { id: 'etincelle', name: 'Étincelle', shape: 'orb', core: '#ffffff', glow: '#00e5ff', unlock: { type: 'start', label: 'De base' } },
    { id: 'prisme', name: 'Prisme', shape: 'prism', core: '#ffffff', glow: '#b14dff', unlock: { type: 'tier', value: 5, label: 'Atteindre le palier 5' } },
    { id: 'etoile', name: 'Étoile', shape: 'star', core: '#fff3b0', glow: '#ffd000', unlock: { type: 'combo', value: 40, label: 'Combo ×40' } },
    { id: 'anneau', name: 'Anneau', shape: 'ring', core: '#ffffff', glow: '#18ffd5', unlock: { type: 'surviveMin', value: 8, label: 'Survivre 8 minutes' } },
    { id: 'braise', name: 'Braise', shape: 'orb', core: '#fff3b0', glow: '#ff4d00', unlock: { type: 'bossKills', value: 2, label: 'Tuer 2 boss en une partie' } },
    { id: 'hexa', name: 'Hexa', shape: 'hex', core: '#ffffff', glow: '#2bff88', unlock: { type: 'bombs', value: 4, label: 'Utiliser 4 bombes en une partie' } },
    { id: 'spectre', name: 'Spectre', shape: 'ghost', core: '#e8e8ff', glow: '#ff4dd2', unlock: { type: 'score', value: 2000000, label: 'Score 2 000 000' } },
  ],

  // Stats du joueur (équilibrage de base)
  playerStats: {
    radius: 13,
    speed: 275, // px/s
    maxHp: 140, // plus de survie -> parties plus longues
    regen: 1.2, // régénération passive (PV/s) -> les dégâts mineurs ne sont pas permanents
    collectRadius: 145, // rayon de l'aimant fort
    iframes: 0.65, // invincibilité après un coup (court -> les dégâts montent)
  },

  // Couleur des ennemis « vidés » (avant destruction)
  enemyGrayA: '#6b6b78',
  enemyGrayB: '#8a8a99',

  // --- Arène (plus grande -> plus d'espace pour esquiver) ---
  arena: {
    width: 3400,
    height: 2300,
    margin: 90,
  },

  // --- Dash / esquive active (touche Espace) ---
  dash: { speed: 1050, duration: 0.15, cooldown: 2.2, iframes: 0.3 },

  // --- Failles du Statique (zones dangereuses télégraphiées sur la map) ---
  hazards: {
    firstDelay: 6,
    baseInterval: 5.2, // se rapproche avec le temps (intervalTighten)
    intervalTightenPerMin: 0.16,
    minInterval: 1.2,
    warn: 1.2, // télégraphe (s)
    active: 2.6, // dangereux (s)
    fade: 0.5,
    rBase: 110,
    rPerMin: 20,
    rMax: 300,
    dmgBase: 16,
    dmgPerMin: 7,
    spawnNearMin: 170,
    spawnNearMax: 520,
  },

  // --- Objets de map : Bombe de couleur (compétence active, touche E) + soin ---
  bomb: {
    max: 2,
    spawnInterval: 24, // une bombe apparaît sur la map à cet intervalle
    radius: 560, // rayon de la déflagration
    heal: 0.25, // soin à l'usage (% PV max)
    bossDamageFrac: 0.18, // dégâts au boss
    collectRadius: 48,
    healDropChance: 0.025, // chance qu'un ennemi lâche un soin
    healAmount: 35,
  },

  // --- Directeur d'intensité (sans-fin rythmé) ---
  // Un cycle = montée -> pic (télégraphié) -> respiration. Chaque cycle = +1 palier
  // (difficulté LINÉAIRE, pas exponentielle). Densité plafonnée et lisible.
  director: {
    cycle: 36, // durée d'un cycle (s)
    buildEnd: 22,
    peakEnd: 28,
    telegraph: 1.8,
    // Cadence de spawn. Elle était trop basse d'un facteur ~4 : le joueur
    // nettoyait 30 ennemis/s pour 2 qui arrivaient, donc l'arène restait VIDE
    // et il ne se passait rien pendant 12 minutes. C'est la densité à l'écran
    // qui fait la menace dans ce genre, pas les PV unitaires.
    baseInterval: 0.62,
    peakInterval: 0.26,
    breatherInterval: 1.0,
    batch: 4,
    peakBatch: 8,
    spawnDist: 820,
    // Montée en régime : 12% de la cadence au départ, plein régime à 3 min.
    warmupStart: 0.12,
    warmupMin: 3,
    // --- Scaling piloté par le TEMPS (m = minutes écoulées) ---
    // PV = (1 + m/hpHalfLife)^hpExp — LOI DE PUISSANCE, pas exponentielle.
    // Voir le commentaire de difficultyScales() dans systems/director.js : une
    // exponentielle ne peut pas être suivie par la puissance du joueur (qui est
    // polynomiale dans le temps), d'où l'ancien plateau mou puis la falaise.
    // Réglé pour une partie d'environ 13 min en jeu parfait (`node tools/balance.mjs`).
    hpHalfLife: 4,
    hpExp: 2.5,
    dmgRatePerMin: 0.85, // dégâts = base × (1 + 0.85·m) — c'est CE qui tue, pas les PV
    speedRatePerMin: 0.06, // vitesse = min(cap, 1 + 0.06·m)
    speedCap: 1.95,
    densStart: 55, // densité = densStart + densPerMin·m (plafond maxAliveCap)
    densPerMin: 18,
    maxAliveCap: 200, // plafond perf (profilé ~60 fps sur GPU intégré)
    intervalTightenPerMin: 0.06, // spawns plus denses avec le temps
    bossEveryTiers: 4,
    // Plus d'ennemis À DISTANCE en profondeur -> enfer de balles à esquiver
    // (la survie devient un test d'esquive, pas de DPS).
    typeUnlock: { 0: ['triangle', 'triangle', 'square'], 2: ['pentagon'], 3: ['dasher'], 4: ['sniper'], 5: ['splitter'], 6: ['healer'], 7: ['bomber'], 8: ['pentagon', 'sniper'], 10: ['dasher', 'bomber'] },
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
    sniper: {
      key: 'sniper',
      sides: 4,
      radius: 13,
      hp: 18,
      speed: 68,
      damage: 8,
      xp: 4,
      behavior: 'sniper', // vise de loin avec laser télégraphié puis tire vite
      preferredRange: 560,
      aimTime: 1.1,
      shootCooldown: 3.4,
      bulletSpeed: 540,
      bulletDamage: 15,
    },
    healer: {
      key: 'healer',
      sides: 8,
      radius: 15,
      hp: 26,
      speed: 62,
      damage: 6,
      xp: 6,
      behavior: 'healer', // soigne les ennemis proches -> cible prioritaire
      preferredRange: 430,
      healRadius: 230,
      healFrac: 0.07,
      healCd: 1.7,
    },
    bomber: {
      key: 'bomber',
      sides: 6,
      radius: 18,
      hp: 30,
      speed: 92,
      damage: 0,
      xp: 4,
      behavior: 'bomber', // s'approche puis EXPLOSE (cercle télégraphié)
      fuseRange: 200,
      fuseTime: 1.0,
      blastRadius: 150,
      blastDamage: 24,
    },
  },
  enemyBulletMax: 600,

  // --- Boss — stats de base, mises à l'échelle par niveau. 2 variantes alternées. ---
  boss: {
    radius: 52,
    baseHp: 700, // plus de PV (auto-aim ne le prioritise plus -> vrai combat)
    hpPerLevel: 0.5, // hp = baseHp * (1 + tier * hpPerLevel)
    speed: 56,
    contactDamage: 20,
    bulletDamage: 8,
    bulletSpeed: 250,
    patternCd: 1.6,
    rotSpeed: 0.5,
    retreat: 38, // se retire s'il n'est pas tué (pas de blocage)
    xp: 40,
    // `patterns` = indices des patterns définis dans entities/boss.js.
    // mirror = proba de renvoyer un tir reçu ; pattern 5 = ponte d'ennemis (Ruche).
    variants: [
      { sides: 6, color: '#ff2d55', name: 'LE STATIQUE', patterns: [0, 1, 2] }, // hexagone
      { sides: 8, color: '#7a3cff', name: 'LE VIDE', patterns: [3, 4, 2] }, // octogone
      { sides: 4, color: '#8af0ff', name: 'LE MIROIR', patterns: [1, 4], mirror: 0.3 }, // carré réfléchissant
      { sides: 5, color: '#b6ff3c', name: 'LA RUCHE', patterns: [5, 2, 5] }, // pentagone pondeur
    ],
  },

  // --- Armes (data-driven). kind: projectile | orbital | nova | chain | beam ---
  weapons: {
    // Chaque arme domine UN axe (mono-cible OU nuée), jamais les deux.
    // Écarts vérifiés par `node tools/balance.mjs` (cible ≤ ×2 par axe).
    eclat: {
      name: 'Éclat',
      kind: 'projectile',
      auto: true,
      cooldown: 0.3,
      damage: 5.5,
      speed: 640,
      bulletRadius: 5,
      life: 1.0,
      pierce: 0,
      count: 1,
      countPerLevel: 0.6, // généraliste : mono correct, nuée correcte
      spread: 0.13,
      color: '#00e5ff',
    },
    onde: {
      name: 'Onde',
      kind: 'projectile',
      auto: true,
      cooldown: 0.72,
      damage: 9,
      speed: 520,
      bulletRadius: 7,
      life: 1.5,
      pierce: 3,
      piercePerLevel: 0.6, // spécialiste des files d'ennemis alignés
      count: 1,
      spread: 0,
      color: '#18ffd5',
    },
    orbital: {
      name: 'Orbital',
      kind: 'orbital',
      damage: 11, // par contact (avec cooldown par ennemi)
      count: 2,
      countPerLevel: 0.5,
      radius: 82, // rayon d'orbite
      rotSpeed: 2.8, // rad/s
      nodeRadius: 11,
      color: '#b14dff',
    },
    nova: {
      name: 'Nova',
      kind: 'nova',
      cooldown: 1.9,
      damage: 21, // zone pure : le meilleur en nuée, faible en mono
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
      countPerLevel: 0.6, // +1 rebond tous les ~2 niveaux
      color: '#b6ff3c',
    },
    faisceau: {
      name: 'Faisceau',
      kind: 'beam', // rayon instantané qui traverse tout sur une ligne
      cooldown: 0.8,
      damage: 18, // LE tueur de boss : meilleur mono-cible, nuée moyenne
      beamLength: 540,
      beamWidth: 18,
      color: '#ff4dd2',
    },
    scie: {
      name: 'Scie',
      kind: 'projectile',
      boomerang: true, // part, transperce, puis REVIENT vers le joueur
      cooldown: 1.15,
      damage: 13.5,
      speed: 460,
      bulletRadius: 10,
      life: 1.9,
      pierce: 999,
      count: 1,
      spread: 0.5,
      color: '#ff9a00',
    },
  },
  maxWeapons: 6, // emplacements d'armes
  maxWeaponLevel: 6, // au niveau max, l'arme peut ÉVOLUER (carte dorée)
  // Évolutions : multiplicateurs appliqués sur les stats du niveau max.
  // Calibrées à ×1.8-2.2 sur l'axe de l'arme. L'ancienne évolution de l'Éclat
  // cumulait cadence ×2 + 2 projectiles + dégâts ×1.3, soit ×4.3 en nuée d'un
  // seul coup — l'arme de départ devenait la meilleure du jeu sur les DEUX axes.
  // `req` = SYNERGIE : passif exigé en plus du niveau max de l'arme. Sans lui,
  // l'évolution tombait toute seule et le build n'était qu'une accumulation ;
  // avec, chaque arme oriente les cartes de stats à prendre. Le passif choisi
  // est toujours celui qui a du sens pour l'arme (`hint` sert à l'afficher).
  evolutions: {
    eclat: {
      name: 'Mitraille prismatique', desc: 'Cadence +40% · +1 projectile',
      req: (w) => w.player.mods.projAdd >= 2, hint: 'Multi-tir ×2',
      cooldown: 0.72, countAdd: 1, damage: 1.25,
    },
    onde: {
      name: 'Raz-de-marée', desc: 'Transperce tout · onde géante',
      req: (w) => w.player.mods.areaMul >= 1.4, hint: 'Amplitude ×2',
      pierceSet: 999, bulletRadius: 1.9, damage: 1.5, speed: 1.2,
    },
    orbital: {
      name: 'Constellation', desc: '+1 orbe · rotation rapide',
      req: (w) => w.player.mods.moveMul >= 1.24, hint: 'Célérité ×2',
      countAdd: 1, rotSpeed: 1.15, nodeRadius: 1.4, damage: 1.25,
    },
    nova: {
      name: 'Supernova', desc: 'Zone ×1.7 · dégâts ×1.6',
      req: (w) => w.player.mods.areaMul >= 1.6, hint: 'Amplitude ×3',
      radius: 1.7, damage: 1.6, cooldown: 0.85,
    },
    foudre: {
      name: 'Tempête', desc: '+3 rebonds · portée ×1.4',
      req: (w) => w.player.mods.rateMul >= 1.54, hint: 'Cadence ×3',
      chainAdd: 3, chainRange: 1.4, damage: 1.4, cooldown: 0.8,
    },
    faisceau: {
      name: 'Lance perforante', desc: 'Dégâts ×1.8 · rayon élargi',
      req: (w) => w.player.mods.damageMul >= 1.75, hint: 'Surcharge ×3',
      damage: 1.8, beamWidth: 1.6, beamLength: 1.4,
    },
    scie: {
      name: 'Orbite folle', desc: '+2 scies · dégâts ×1.5',
      req: (w) => w.player.mods.collectMul >= 1.7, hint: 'Aimant ×2',
      countAdd: 2, damage: 1.5,
    },
  },
  bulletMax: 420,

  // --- Particules (plafonnées ; réduites en mode perf) ---
  particles: { max: 1500, killBurst: 16, killBurstPerf: 8 },

  // --- Couleur = jauge PRISMA (ulti). Les kills la remplissent ; pleine, le
  // joueur déclenche le PRISMA BURST (touche R) : déflagration arc-en-ciel qui
  // nettoie l'écran + surcharge les armes. Les éclaboussures peignent l'arène. ---
  colorfield: { cols: 48, rows: 32, splashRadius: 2.6, ambientMax: 0.2, killsToFull: 42 },
  prismaBurst: {
    radius: 720, // rayon de la déflagration
    bossDamageFrac: 0.22, // dégâts au boss (% PV max)
    overchargeTime: 8, // surcharge des armes (s)
    overchargeRate: 1.6, // × cadence pendant la surcharge
    overchargeDmg: 1.5, // × dégâts pendant la surcharge
    scoreBonus: 1200, // × (1 + tier × depthBonus)
    heal: 0.15, // soin (% PV max)
  },

  // --- Élites (affixes) : plus fréquentes avec le temps ---
  elites: {
    baseChance: 0.04,
    chancePerMin: 0.013,
    maxChance: 0.17,
    // affixe -> modificateurs (appliqués sur la base déjà scalée)
    affixes: {
      swift: { name: 'Véloce', speed: 1.55, hp: 1.6, xp: 3, aura: '#ffd000' },
      colossus: { name: 'Colosse', radius: 1.55, hp: 3.6, damage: 1.35, speed: 0.78, xp: 4, aura: '#ff4d00' },
      volatile: { name: 'Détonant', hp: 1.9, xp: 3, aura: '#ff2d55', deathBullets: 6, deathBulletSpeed: 210 },
    },
    prismaFill: 3, // kills équivalents ajoutés à la jauge PRISMA
    dropChance: 0.5, // 50% : bombe ou soin garanti
  },

  // --- XP / niveaux ---
  // Courbe modérée : level-ups réguliers SANS exploser (sinon plus aucun choix en
  // fin). L'XP des orbes monte avec la profondeur (orbXpDepth) pour garder la
  // cadence ~constante quel que soit le biome.
  // base relevée en même temps que la cadence de spawn : avec 4× plus de kills,
  // l'ancienne base 18 donnait le niveau 7 en une minute (arme au max + évoluée
  // avant la 2ᵉ minute — plus aucun choix intéressant ensuite).
  xp: { base: 34, growth: 1.15, orbXpDepth: 0.22 }, // requis = base*growth^(niv-1) ; orbe ×(1+tier*orbXpDepth)
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
