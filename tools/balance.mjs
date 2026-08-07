// tools/balance.mjs — audit d'équilibrage HORS JEU (aucune dépendance, aucun DOM).
//   node tools/balance.mjs
//
// Lit directement src/config.js et importe la courbe de difficulté du jeu, pour
// que le tableau ne puisse PAS diverger de ce que le joueur subit. Sections :
//   1. Armes  — DPS mono-cible et DPS de nuée, par niveau + évolution.
//   2. Upgrades — valeur, plafond, et détection des piles non bornées.
//   3. Courbe  — PV / dégâts / vitesse ennemis au fil des minutes.
//   4. Simulation — une partie complète : ennemis vivants, PV joueur, mort.
//
// Les hypothèses de modélisation sont écrites en toutes lettres : ce sont elles
// qu'il faut discuter, pas les nombres qui en découlent.

import { CONFIG } from '../src/config.js';
// La courbe de difficulté est importée du JEU, jamais recopiée.
import { difficultyScales, warmupFactor } from '../src/systems/director.js';

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
  if (evo.beamLength) o.beamLength = (o.beamLength || 520) * evo.beamLength;
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
      return Math.min(w.count * (Math.min(w.pierce, n - 1) + 1), n);
    case 'nova':
      return n; // touche tout le disque
    case 'chain':
      return Math.min(w.chainCount, n);
    case 'beam':
      // Traverse tout sur la ligne ; le rayon est fin, on considère la moitié
      // de la nuée alignée par rayon.
      return Math.min(n, Math.max(1, Math.ceil(n / 2)) * (w.beamCount || 1));
    default:
      return 1;
  }
}

function dps(w, n) {
  if (w.kind === 'orbital') {
    // Un ennemi donné est retouché au plus tous les ORBITAL_HIT_CD, et au
    // rythme de passage d'un nœud sinon. Chaque nœud entretient sa cible.
    const passInterval = (Math.PI * 2) / (w.rotSpeed * w.count);
    const interval = Math.max(ORBITAL_HIT_CD, passInterval);
    return (w.damage * Math.min(n, w.count)) / interval;
  }
  return (w.damage * hits(w, w.kind, n)) / (w.cooldown || 1);
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
    return [def.name, def.kind, f(dps(l1, 1)), f(dps(lm, 1)), f(dps(ev, 1)), f(dps(l1, CLUSTER)), f(dps(lm, CLUSTER)), f(dps(ev, CLUSTER))];
  });

  const spread = (a) => Math.max(...a) / Math.min(...a);
  const mono = rows.map((r) => +r[3]);
  const nuee = rows.map((r) => +r[6]);
  const monoEvo = rows.map((r) => +r[4]);
  const nueeEvo = rows.map((r) => +r[7]);

  const verdict = (label, v) => `  ${label} : ×${f(v, 2)}   ${v <= 2.1 ? '✓' : v <= 2.6 ? '~ acceptable' : '⚠ TROP DISPERSÉ'}`;

  return [
    '',
    '━━━ 1. ARMES ' + '━'.repeat(63),
    `  DPS brut, avant multiplicateurs joueur. Nuée = ${CLUSTER} ennemis serrés.`,
    '',
    table(['Arme', 'Type', 'mono N1', 'mono N' + maxLv, 'mono ÉVO', 'nuée N1', 'nuée N' + maxLv, 'nuée ÉVO'], rows, ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r']),
    '',
    '  Écart max/min (cible ≤ ×2 : une arme domine UN axe, jamais les deux) :',
    verdict(`niveau ${maxLv} mono-cible`, spread(mono)),
    verdict(`niveau ${maxLv} nuée     `, spread(nuee)),
    verdict('évoluée mono-cible ', spread(monoEvo)),
    verdict('évoluée nuée      ', spread(nueeEvo)),
  ].join('\n');
}

// --------------------------------------------------------- 2. UPGRADES
// Recopié de systems/upgrades.js avec la borne `avail` correspondante.
const STAT_UPGRADES = [
  { name: 'Surcharge', effect: 'damageMul +0.25', add: 0.25, cap: null, axis: 'dps' },
  { name: 'Cadence', effect: 'rateMul +0.18', add: 0.18, cap: null, axis: 'dps' },
  { name: 'Multi-tir', effect: 'projAdd +1', add: null, cap: '4 prises', axis: 'nuée' },
  { name: 'Célérité', effect: 'moveMul +0.12', add: 0.12, cap: '1.85', axis: 'survie' },
  { name: 'Aimant', effect: 'collectMul +0.35', add: 0.35, cap: '3.0', axis: 'xp' },
  { name: 'Amplitude', effect: 'areaMul +0.20', add: 0.2, cap: '2.4', axis: 'nuée' },
  { name: 'Vitalité', effect: 'maxHp +25', add: null, cap: null, axis: 'survie' },
  { name: 'Armure', effect: 'dmgTakenMul ×0.88', add: null, cap: '0.45 (−55%)', axis: 'survie' },
  { name: 'Photosynthèse', effect: 'regen +1.5/s', add: null, cap: '7 PV/s', axis: 'survie' },
  { name: 'Réflexe', effect: 'dashCdMul ×0.75', add: null, cap: '0.35', axis: 'survie' },
];

function sectionUpgrades() {
  const rows = STAT_UPGRADES.map((u) => {
    const at5 = u.add ? '×' + f(1 + u.add * 5, 2) : '—';
    const at15 = u.add ? '×' + f(1 + u.add * 15, 2) : '—';
    return [u.name, u.effect, u.axis, u.cap || 'aucun', at5, at15, u.add ? 'additif ✓' : u.cap ? 'borné ✓' : 'non borné'];
  });

  // Le point dur historique : Armure × Photosynthèse rend-il intuable ?
  const s = CONFIG.playerStats;
  const warn = [];
  for (const m of [8, 12, 15]) {
    const red = 0.45; // plafond d'armure
    const regen = s.regen + 7; // plafond de régénération
    const raw = CONFIG.enemyTypes.triangle.damage * difficultyScales(m * 60).dmg;
    const incoming = (raw * red) / s.iframes;
    if (incoming <= regen) warn.push(`  ⚠ INTUABLE à ${m} min au plafond Armure+Régén : ${f(incoming)} PV/s subis ≤ ${f(regen)} PV/s régénérés`);
  }

  return [
    '',
    '━━━ 2. UPGRADES ' + '━'.repeat(60),
    '  Les stats de DPS sont ADDITIVES sur la base : la puissance converge au',
    '  lieu d\'exploser (en composé, 45 niveaux donnaient ×3500 de dégâts).',
    '',
    table(['Carte', 'Effet', 'Axe', 'Plafond', '×5 prises', '×15 prises', 'Verdict'], rows, ['l', 'l', 'l', 'l', 'r', 'r', 'l']),
    '',
    warn.length ? warn.join('\n') : '  ✓ Même au plafond, Armure + Photosynthèse ne rendent jamais intuable.',
  ].join('\n');
}

// ------------------------------------------------------------- 3. COURBE
function sectionCurve() {
  const d = CONFIG.director;
  const rows = [];
  for (const m of [0, 2, 4, 6, 9, 12, 15, 20]) {
    const sc = difficultyScales(m * 60);
    const dens = Math.min(d.maxAliveCap, Math.round(d.densStart + d.densPerMin * m));
    const elite = Math.min(CONFIG.elites.maxChance, CONFIG.elites.baseChance + CONFIG.elites.chancePerMin * m);
    rows.push([m + ' min', '×' + f(sc.hp, sc.hp > 100 ? 0 : 1), '×' + f(sc.dmg), '×' + f(sc.speed, 2), dens, f(elite * 100, 0) + '%']);
  }
  return [
    '',
    '━━━ 3. COURBE DE DIFFICULTÉ ' + '━'.repeat(48),
    `  PV = (1 + m/${d.hpHalfLife})^${d.hpExp} — loi de puissance (voir director.js).`,
    '',
    table(['Temps', 'PV ×', 'Dégâts ×', 'Vitesse ×', 'Densité max', 'Élites'], rows, ['l', 'r', 'r', 'r', 'r', 'r']),
  ].join('\n');
}

// -------------------------------------------------------- 4. SIMULATION
// Une partie complète. Ce qui tue le joueur n'est PAS « je ne tue pas assez
// vite » — c'est le nombre d'ennemis VIVANTS autour de lui et les dégâts
// encaissés. On simule donc les deux boucles couplées :
//   - population : dN/dt = spawn − kills (kills bornés par ce qui est présent)
//   - survie     : PV = régénération − contacts (bornés par les i-frames)
//
// HYPOTHÈSES (à discuter en priorité si un chiffre surprend) :
//   - Le joueur esquive DODGE des contacts potentiels (skill).
//   - Les cartes sont réparties comme un bon joueur : arme principale au max
//     puis évoluée, ensuite 50% DPS / 25% armes secondaires / 25% survie.
//   - Le DPS retenu est celui « de nuée » : on suppose le joueur au contact.
const DODGE = 0.62; // 62% des contacts potentiels évités (bon joueur)
const CROWD = 0.045; // taux de contact par ennemi vivant et par seconde
const SYNERGY_COST = 2; // prises consacrées au passif exigé par l'évolution

function sectionSim() {
  const d = CONFIG.director;
  const s = CONFIG.playerStats;
  const maxLv = CONFIG.maxWeaponLevel;
  const order = ['eclat', 'foudre', 'nova', 'onde']; // ordre d'acquisition modélisé

  // PV / XP moyens d'un ennemi selon les types débloqués au palier.
  function avgEnemy(tier) {
    const out = [];
    for (const k in d.typeUnlock) if (+k <= tier) out.push(...d.typeUnlock[k]);
    const list = (out.length ? out : ['triangle']).map((t) => CONFIG.enemyTypes[t]);
    return {
      hp: list.reduce((a, e) => a + e.hp, 0) / list.length,
      xp: list.reduce((a, e) => a + e.xp, 0) / list.length,
      dmg: list.reduce((a, e) => a + e.damage, 0) / list.length,
      speed: list.reduce((a, e) => a + e.speed, 0) / list.length,
    };
  }

  const xpFor = (L) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, L - 1));

  // État du joueur.
  let level = 1;
  let xp = 0;
  let xpNext = xpFor(1);
  let damageMul = 1;
  let rateMul = 1;
  let maxHp = s.maxHp;
  let hp = maxHp;
  let dmgTaken = 1;
  let regen = s.regen;
  let picks = 0;
  let synergyPicks = 0;
  const build = [{ key: 'eclat', level: 1, evolved: false }];

  let engaged = 0; // ennemis arrivés au contact (ceux qui menacent vraiment)
  let deathAt = null;
  const rows = [];

  function totalDps() {
    let sum = 0;
    for (const b of build) {
      let w = stats(CONFIG.weapons[b.key], b.level);
      if (b.evolved) w = evolve(w, b.key);
      // rateMul agit sur le cooldown (donc sur le DPS), sauf pour l'orbital.
      sum += dps(w, CLUSTER) * (w.kind === 'orbital' ? 1 : rateMul);
    }
    return sum * damageMul;
  }

  // Un niveau gagné = une carte prise, selon la priorité d'un bon joueur.
  function takeCard() {
    picks++;
    const primary = build[0];
    if (primary.level < maxLv) return primary.level++;
    // SYNERGIE : l'évolution exige aussi un passif (CONFIG.evolutions[].req).
    // On modélise ce coût par les prises qu'il faut y consacrer — sans lui, la
    // simulation surestimerait la puissance du joueur de plusieurs niveaux.
    if (!primary.evolved) {
      if (synergyPicks < SYNERGY_COST) {
        synergyPicks++;
        return (damageMul += 0.25); // le passif exigé a lui-même une valeur
      }
      return (primary.evolved = true);
    }
    const slot = picks % 4;
    if (slot === 0 && build.length < order.length) return build.push({ key: order[build.length], level: 1, evolved: false });
    if (slot === 1) {
      const sec = build.find((b) => b.level < maxLv && b !== primary);
      if (sec) return sec.level++;
    }
    if (slot === 2) {
      // Survie : alterne PV max, armure, régénération (dans leurs plafonds).
      if (picks % 12 === 2 && dmgTaken > 0.45) return (dmgTaken *= 0.88);
      if (picks % 12 === 6 && regen < s.regen + 7) return (regen += 1.5);
      maxHp += 25;
      hp += 25;
      return;
    }
    return picks % 2 === 0 ? (damageMul += 0.25) : (rateMul += 0.18);
  }

  const dt = 0.5;
  for (let t = 0; t <= 25 * 60; t += dt) {
    const m = t / 60;
    const tier = Math.floor(t / d.cycle);
    const e = avgEnemy(tier);
    const sc = difficultyScales(t);
    const enemyHp = e.hp * sc.hp;
    const maxAlive = Math.min(d.maxAliveCap, Math.round(d.densStart + d.densPerMin * m));

    // --- Population ---
    // Les ennemis naissent à `spawnDist` et doivent MARCHER jusqu'au joueur : il
    // y a en permanence un pipeline en approche, bien visible à l'écran mais pas
    // encore menaçant. C'est lui qui fait la densité perçue du genre.
    const spawnPerSec = (d.batch / d.baseInterval) * (1 + d.intervalTightenPerMin * m) * warmupFactor(t);
    const inTransit = spawnPerSec * (d.spawnDist / (e.speed * sc.speed));
    const canKill = totalDps() / enemyHp; // ennemis/s que le joueur peut abattre
    const kills = Math.min(engaged / dt, canKill);
    engaged = Math.max(0, engaged + (spawnPerSec - kills) * dt);
    const alive = Math.min(maxAlive, engaged + inTransit);

    // --- Survie --- (seuls les ennemis arrivés au contact font des dégâts)
    const contacts = Math.min(1 / s.iframes, engaged * CROWD) * (1 - DODGE);
    const incoming = contacts * e.dmg * sc.dmg * dmgTaken;
    hp = Math.min(maxHp, hp + (regen - incoming) * dt);
    if (hp <= 0 && deathAt === null) deathAt = t;

    // --- Progression ---
    xp += kills * e.xp * (1 + tier * CONFIG.xp.orbXpDepth) * dt;
    while (xp >= xpNext) {
      xp -= xpNext;
      level++;
      xpNext = xpFor(level);
      takeCard();
    }

    if (Math.abs(t % 60) < dt / 2 && m <= 20) {
      rows.push([
        Math.round(m) + ' min',
        level,
        build.length,
        '×' + f(damageMul * rateMul, 1),
        f(enemyHp, 0),
        f(totalDps(), 0),
        Math.round(alive),
        f(Math.max(0, hp), 0) + '/' + Math.round(maxHp),
        f(incoming, 1),
      ]);
    }
    if (deathAt !== null) break;
  }

  const verdict =
    deathAt === null
      ? '  ⚠ Le joueur ne meurt pas en 25 min — la courbe est trop douce.'
      : deathAt < 10 * 60
        ? `  ⚠ Mort à ${Math.floor(deathAt / 60)} min ${Math.round(deathAt % 60)} s — TROP DUR (cible 12-15 min).`
        : deathAt > 16 * 60
          ? `  ⚠ Mort à ${Math.floor(deathAt / 60)} min ${Math.round(deathAt % 60)} s — TROP LONG (cible 12-15 min).`
          : `  ✓ Mort à ${Math.floor(deathAt / 60)} min ${Math.round(deathAt % 60)} s — dans la cible 12-15 min.`;

  return [
    '',
    '━━━ 4. SIMULATION D\'UNE PARTIE ' + '━'.repeat(44),
    `  Bon joueur : ${Math.round(DODGE * 100)}% des contacts esquivés.`,
    '  « Vivants » est LA colonne à surveiller : proche de 0 = arène vide et',
    '  partie sans enjeu ; collée au plafond = le joueur est submergé.',
    '',
    table(['Temps', 'Niv', 'Armes', 'Mult.', 'PV ennemi', 'DPS', 'Vivants', 'PV joueur', 'Dégâts/s'], rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']),
    '',
    verdict,
  ].join('\n');
}

console.log(sectionWeapons());
console.log(sectionUpgrades());
console.log(sectionCurve());
console.log(sectionSim());
console.log('');
