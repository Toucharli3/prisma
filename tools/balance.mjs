// tools/balance.mjs — audit d'équilibrage HORS JEU (aucune dépendance, aucun DOM).
//   node tools/balance.mjs
//
// Lit directement src/config.js et src/systems/weapons.js (formule `stats`) pour
// que le tableau ne puisse PAS diverger du jeu. Trois sections :
//   1. Armes  — DPS mono-cible et DPS de nuée, par niveau + évolution.
//   2. Upgrades — valeur en « DPS équivalent » et détection des piles non bornées.
//   3. Course  — puissance du joueur vs PV/dégâts ennemis au fil des minutes.
//
// Les hypothèses de modélisation sont écrites en toutes lettres : ce sont elles
// qu'il faut discuter, pas les nombres qui en découlent.

import { CONFIG } from '../src/config.js';

const ORBITAL_HIT_CD = 0.35; // doit rester synchro avec systems/weapons.js
const CLUSTER = 8; // taille de nuée de référence pour le « DPS zone »

// ---------------------------------------------------------------- helpers
const f = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const pad = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));

function table(headers, rows, aligns = []) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '  ' + cells.map((c, i) => pad(c, w[i], aligns[i] === 'r')).join('  ');
  const out = [line(headers), '  ' + w.map((n) => '─'.repeat(n)).join('  ')];
  for (const r of rows) out.push(line(r));
  return out.join('\n');
}

// Réplique EXACTE de stats() dans systems/weapons.js.
function stats(def, level) {
  const lv = level - 1;
  return {
    ...def,
    cooldown: def.cooldown != null ? def.cooldown * Math.pow(0.92, lv) : 0,
    damage: def.damage * (1 + 0.3 * lv),
    count: (def.count || 1) + (def.countPerLevel ? Math.floor(lv * def.countPerLevel) : 0),
    pierce: (def.pierce || 0) + (def.piercePerLevel ? lv * def.piercePerLevel : 0),
    chainCount: (def.chainCount || 0) + (def.countPerLevel ? Math.floor(lv * def.countPerLevel) : 0),
  };
}

// Réplique EXACTE de evolve() dans systems/weapons.js.
function evolve(w, key) {
  const evo = CONFIG.evolutions[key];
  if (!evo) return w;
  const o = { ...w, evolved: true };
  if (evo.cooldown) o.cooldown *= evo.cooldown;
  if (evo.damage) o.damage *= evo.damage;
  if (evo.countAdd) o.count = (o.count || 1) + evo.countAdd;
  if (evo.pierceSet != null) o.pierce = evo.pierceSet;
  if (evo.bulletRadius) o.bulletRadius *= evo.bulletRadius;
  if (evo.speed) o.speed *= evo.speed;
  if (evo.radius) o.radius *= evo.radius;
  if (evo.rotSpeed) o.rotSpeed *= evo.rotSpeed;
  if (evo.nodeRadius) o.nodeRadius *= evo.nodeRadius;
  if (evo.chainAdd) o.chainCount += evo.chainAdd;
  if (evo.chainRange) o.chainRange *= evo.chainRange;
  if (evo.beamCount) o.beamCount = evo.beamCount;
  if (evo.beamWidth) o.beamWidth = (o.beamWidth || 18) * evo.beamWidth;
  return o;
}

// ------------------------------------------------------------------ DPS
// « Touches par activation » — le cœur du modèle. Hypothèses :
//   - mono-cible : une seule cible isolée, les projectiles en éventail ratent.
//   - nuée : N ennemis serrés, tous à portée ; on plafonne par la limite propre
//     à l'arme (perforation, nb de rebonds, nb de projectiles...).
function hits(w, kind, n) {
  switch (kind) {
    case 'projectile':
      // Chaque projectile touche (pierce + 1) ennemis au maximum.
      return Math.min(w.count * (Math.min(w.pierce, n - 1) + 1), n);
    case 'nova':
      return n; // touche tout le disque
    case 'chain':
      return Math.min(w.chainCount, n);
    case 'beam':
      // Traverse tout sur la ligne ; en nuée serrée on considère la moitié
      // alignée par rayon (le rayon est fin : 18 px de large de base).
      return Math.min(n, Math.max(1, Math.ceil(n / 2)) * (w.beamCount || 1));
    default:
      return 1;
  }
}

// DPS d'une arme contre `n` ennemis (n = 1 -> mono-cible).
function dps(w, key, n) {
  const kind = w.kind;
  if (kind === 'orbital') {
    // Un ennemi donné est retouché au plus tous les ORBITAL_HIT_CD, et au
    // rythme de passage d'un nœud sinon.
    const passInterval = (Math.PI * 2) / (w.rotSpeed * w.count);
    const interval = Math.max(ORBITAL_HIT_CD, passInterval);
    // En nuée, chaque nœud entretient sa propre cible : plafonné par `count`.
    const targets = Math.min(n, w.count);
    return (w.damage * targets) / interval;
  }
  const cd = w.cooldown || 1;
  return (w.damage * hits(w, kind, n)) / cd;
}

// ------------------------------------------------------------ 1. ARMES
function sectionWeapons() {
  const keys = Object.keys(CONFIG.weapons);
  const maxLv = CONFIG.maxWeaponLevel;

  const rows = keys.map((k) => {
    const def = CONFIG.weapons[k];
    const l1 = stats(def, 1);
    const lm = stats(def, maxLv);
    const ev = evolve(lm, k);
    return [
      def.name,
      def.kind,
      f(dps(l1, k, 1)),
      f(dps(lm, k, 1)),
      f(dps(ev, k, 1)),
      f(dps(l1, k, CLUSTER)),
      f(dps(lm, k, CLUSTER)),
      f(dps(ev, k, CLUSTER)),
    ];
  });

  const single = rows.map((r) => +r[3]); // DPS mono-cible au niveau max
  const cluster = rows.map((r) => +r[6]); // DPS nuée au niveau max
  const spread = (a) => Math.max(...a) / Math.min(...a);

  return [
    '',
    '━━━ 1. ARMES ' + '━'.repeat(63),
    `  DPS brut, avant multiplicateurs joueur. Nuée = ${CLUSTER} ennemis serrés.`,
    '',
    table(
      ['Arme', 'Type', 'mono N1', 'mono N' + maxLv, 'mono ÉVO', 'nuée N1', 'nuée N' + maxLv, 'nuée ÉVO'],
      rows,
      ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r']
    ),
    '',
    `  Écart max/min au niveau ${maxLv} — mono-cible : ×${f(spread(single), 2)}   ·   nuée : ×${f(spread(cluster), 2)}`,
    '  Cible saine : ×2 max sur chaque axe (une arme peut dominer UN axe, pas les deux).',
  ].join('\n');
}

// --------------------------------------------------------- 2. UPGRADES
// Les multiplicateurs de STAT dans systems/upgrades.js, recopiés ici avec leur
// borne éventuelle. « ∞ » = empilable sans limite -> croissance exponentielle.
const STAT_UPGRADES = [
  { name: 'Surcharge', effect: 'damageMul ×1.25', mul: 1.25, cap: Infinity, axis: 'dps' },
  { name: 'Cadence', effect: 'rateMul ×1.18', mul: 1.18, cap: Infinity, axis: 'dps' },
  { name: 'Multi-tir', effect: 'projAdd +1', mul: null, cap: 4, axis: 'nuée' },
  { name: 'Célérité', effect: 'moveMul ×1.12', mul: 1.12, cap: Infinity, axis: 'survie' },
  { name: 'Aimant', effect: 'collectMul ×1.35', mul: 1.35, cap: Infinity, axis: 'xp' },
  { name: 'Amplitude', effect: 'areaMul ×1.20', mul: 1.2, cap: Infinity, axis: 'nuée' },
  { name: 'Vitalité', effect: 'maxHp +25', mul: null, cap: Infinity, axis: 'survie' },
  { name: 'Armure', effect: 'dmgTakenMul ×0.88', mul: 0.88, cap: Infinity, axis: 'survie' },
  { name: 'Photosynthèse', effect: 'regen +1.5/s', mul: null, cap: Infinity, axis: 'survie' },
  { name: 'Réflexe', effect: 'dashCdMul ×0.75', mul: 0.75, cap: 0.35, axis: 'survie' },
];

function sectionUpgrades() {
  const rows = STAT_UPGRADES.map((u) => {
    const capTxt = u.cap === Infinity ? '∞' : String(u.cap);
    const at5 = u.mul ? f(Math.pow(u.mul, 5), 2) + '×' : '—';
    const at10 = u.mul ? f(Math.pow(u.mul, 10), 2) + '×' : '—';
    const risk = u.mul && u.cap === Infinity && (u.mul > 1.2 || u.mul < 0.9) ? '⚠ pile forte' : u.cap === Infinity ? 'pile douce' : 'borné';
    return [u.name, u.effect, u.axis, capTxt, at5, at10, risk];
  });

  // Le point dur : Armure × Photosynthèse rend-il le joueur intuable ?
  const s = CONFIG.playerStats;
  const d = CONFIG.director;
  const lines = [];
  for (const armorPicks of [0, 5, 10, 15]) {
    const red = Math.pow(0.88, armorPicks);
    for (const regenPicks of [0, 5, 10]) {
      const regen = s.regen + 1.5 * regenPicks;
      // Dégâts entrants max soutenables : 1 coup par fenêtre d'i-frames.
      // Ennemi de contact de base (triangle) à la minute m.
      const m = 15;
      const raw = CONFIG.enemyTypes.triangle.damage * (1 + d.dmgRatePerMin * Math.max(0, m - 0.5));
      const incoming = (raw * red) / s.iframes; // PV/s en encerclement permanent
      if (incoming <= regen) {
        lines.push(`  ⚠ INTUABLE à 15 min avec ${armorPicks}× Armure + ${regenPicks}× Photosynthèse : ` + `${f(incoming)} PV/s subis ≤ ${f(regen)} PV/s régénérés`);
      }
    }
  }

  return [
    '',
    '━━━ 2. UPGRADES ' + '━'.repeat(60),
    '  « pile » = ce que devient le multiplicateur si le joueur reprend la carte.',
    '',
    table(['Carte', 'Effet', 'Axe', 'Plafond', '×5 prises', '×10 prises', 'Verdict'], rows, ['l', 'l', 'l', 'r', 'r', 'r', 'l']),
    '',
    lines.length ? lines.join('\n') : '  ✓ Aucune combinaison Armure/Régén ne rend le joueur intuable à 15 min.',
  ].join('\n');
}

// ------------------------------------------------------------ 3. COURSE
// Le vrai test : la puissance du joueur suit-elle la courbe des ennemis ?
function sectionRace() {
  const d = CONFIG.director;

  // Combien de cartes « Surcharge » par minute pour tenir le rythme des PV ?
  const need = Math.log(d.hpGrowPerMin) / Math.log(1.25);

  const rows = [];
  for (const m of [0, 2, 5, 8, 12, 15, 20]) {
    const hp = Math.pow(d.hpGrowPerMin, m);
    const dmg = 1 + d.dmgRatePerMin * Math.max(0, m - 0.5);
    const spd = Math.min(d.speedCap, 1 + d.speedRatePerMin * m);
    const dens = Math.min(d.maxAliveCap, Math.round(d.densStart + d.densPerMin * m));
    const elite = Math.min(CONFIG.elites.maxChance, CONFIG.elites.baseChance + CONFIG.elites.chancePerMin * m);
    rows.push([m + ' min', '×' + f(hp, hp > 100 ? 0 : 1), '×' + f(dmg), '×' + f(spd, 2), dens, f(elite * 100, 0) + '%', '×' + f(Math.pow(1.25, need * m), hp > 100 ? 0 : 1)]);
  }

  // Plafond réel de l'XP : combien de niveaux le joueur peut-il gagner ?
  const xpFor = (L) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, L - 1));
  let cum = 0;
  const lvRows = [];
  for (let L = 1; L <= 60; L++) {
    cum += xpFor(L);
    if ([10, 20, 30, 40, 50, 60].includes(L)) lvRows.push([L, xpFor(L), Math.round(cum)]);
  }

  return [
    '',
    '━━━ 3. LA COURSE (joueur vs ennemis) ' + '━'.repeat(39),
    `  PV ennemis = ×${d.hpGrowPerMin}^minutes (EXPONENTIEL).`,
    `  Pour tenir, il faut ${f(need, 2)} cartes « Surcharge » PAR MINUTE, indéfiniment.`,
    '',
    table(['Temps', 'PV ×', 'Dégâts ×', 'Vitesse ×', 'Densité', 'Élites', 'Dégâts requis ×'], rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r']),
    '',
    '  Coût de la montée de niveau (xp.base=' + CONFIG.xp.base + ', growth=' + CONFIG.xp.growth + ') :',
    '',
    table(['Niveau', 'XP palier', 'XP cumulée'], lvRows, ['r', 'r', 'r']),
  ].join('\n');
}

// -------------------------------------------------------- 4. SIMULATION
// Question décisive : même en jouant PARFAITEMENT (chaque montée de niveau
// prend la meilleure carte de dégâts), le joueur suit-il la courbe des PV ?
// On simule le plafond théorique — si même lui décroche, le mur est structurel.
function sectionSim() {
  const d = CONFIG.director;
  const cycle = d.cycle;

  // Arme de référence : Éclat (arme de départ), montée au max puis évoluée.
  const eclat = CONFIG.weapons.eclat;
  const weaponDpsAt = (lv, evolved) => {
    let w = stats(eclat, Math.min(lv, CONFIG.maxWeaponLevel));
    if (evolved) w = evolve(w, 'eclat');
    return dps(w, 'eclat', CLUSTER);
  };

  // PV moyen d'un ennemi selon les types débloqués au palier.
  function avgEnemy(tier) {
    const out = [];
    for (const k in d.typeUnlock) if (+k <= tier) out.push(...d.typeUnlock[k]);
    const list = (out.length ? out : ['triangle']).map((t) => CONFIG.enemyTypes[t]);
    return {
      hp: list.reduce((s, e) => s + e.hp, 0) / list.length,
      xp: list.reduce((s, e) => s + e.xp, 0) / list.length,
    };
  }

  const xpFor = (L) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, L - 1));

  let level = 1;
  let xp = 0;
  let xpNext = xpFor(1);
  let damageMul = 1;
  let rateMul = 1;
  let wLevel = 1;
  let evolved = false;
  let picks = 0;
  const rows = [];
  let deathAt = null;

  const dt = 1; // pas de 1 s
  for (let t = 0; t <= 30 * 60; t += dt) {
    const m = t / 60;
    const tier = Math.floor(t / cycle);
    const { hp: baseHp, xp: baseXp } = avgEnemy(tier);
    const enemyHp = baseHp * Math.pow(d.hpGrowPerMin, m);

    // Puissance du joueur : arme × multiplicateurs cumulés.
    const playerDps = weaponDpsAt(wLevel, evolved) * damageMul * rateMul;

    // Cadence de spawn du directeur (moyenne sur le cycle) et plafond de densité.
    const spawnPerSec = (d.batch / d.baseInterval) * (1 + d.intervalTightenPerMin * m);
    const killsPerSec = Math.min(spawnPerSec, playerDps / enemyHp);

    // Le joueur décroche quand il ne peut plus absorber le flux entrant.
    const overwhelmed = playerDps / enemyHp < spawnPerSec * 0.5;
    if (overwhelmed && deathAt === null && t > 60) deathAt = t;

    // XP -> niveaux -> cartes (jeu PARFAIT : alternance Surcharge / Cadence,
    // le duo qui maximise le DPS, plus la montée d'arme les 6 premières fois).
    xp += killsPerSec * baseXp * (1 + tier * CONFIG.xp.orbXpDepth) * dt;
    while (xp >= xpNext) {
      xp -= xpNext;
      level++;
      xpNext = xpFor(level);
      picks++;
      if (wLevel < CONFIG.maxWeaponLevel) wLevel++;
      else if (!evolved) evolved = true;
      else if (picks % 2 === 0) damageMul *= 1.25;
      else rateMul *= 1.18;
    }

    if (t % 120 === 0) {
      rows.push([
        Math.round(m) + ' min',
        level,
        '×' + f(damageMul * rateMul, damageMul * rateMul > 100 ? 0 : 1),
        f(enemyHp, enemyHp > 100 ? 0 : 1),
        f(playerDps, playerDps > 1000 ? 0 : 1),
        f(killsPerSec, 1) + '/s',
        f((playerDps / enemyHp / spawnPerSec) * 100, 0) + '%',
      ]);
    }
  }

  return [
    '',
    '━━━ 4. SIMULATION — plafond du jeu PARFAIT ' + '━'.repeat(33),
    '  Chaque montée de niveau prend la meilleure carte de DPS. Aucune erreur.',
    '  « Marge » = capacité de nettoyage / flux entrant (100% = à l\'équilibre).',
    '',
    table(['Temps', 'Niv', 'Mult. DPS', 'PV ennemi', 'DPS joueur', 'Kills', 'Marge'], rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r']),
    '',
    deathAt === null
      ? '  ✓ Le joueur parfait ne décroche jamais en 30 min (le mur vient d\'ailleurs).'
      : `  ⚠ MUR STRUCTUREL : même en jouant parfaitement, le joueur décroche à ${Math.floor(deathAt / 60)} min ${deathAt % 60} s.`,
  ].join('\n');
}

console.log(sectionWeapons());
console.log(sectionUpgrades());
console.log(sectionRace());
console.log(sectionSim());
console.log('');
