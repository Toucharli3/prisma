// director.js — "metteur en scène" de l'intensité (sans-fin RYTHMÉ).
// Un cycle = montée -> PIC (télégraphié) -> RESPIRATION. Chaque cycle complet
// passe un palier (tier) : difficulté LINÉAIRE (PV/dégâts/vitesse), densité
// plafonnée et lisible. Les boss apparaissent au pic, DANS la nuée (pas de reset).

import { CONFIG } from '../config.js';
import { clamp, TAU, lerp } from '../engine/math.js';

function ringPos(player, dist, rng) {
  const a = rng() * TAU;
  const A = CONFIG.arena;
  const m = A.margin + 30;
  return {
    x: clamp(player.x + Math.cos(a) * dist, m, A.width - m),
    y: clamp(player.y + Math.sin(a) * dist, m, A.height - m),
  };
}

// Courbe de difficulté — SOURCE UNIQUE (le directeur ET les boss l'utilisent ;
// elle était dupliquée dans boss.js, où toute correction divergeait en silence).
//
// Les PV suivent une LOI DE PUISSANCE, pas une exponentielle, et c'est le point
// central de l'équilibrage. La puissance du joueur est polynomiale dans le temps
// (ses cartes sont exponentielles dans le NIVEAU, mais les niveaux arrivent de
// plus en plus lentement — la courbe d'XP est elle-même exponentielle). Opposer
// une exponentielle à un polynôme garantit un décrochage brutal : le joueur est
// d'abord ridiculement surpuissant, puis le mur tombe d'un coup. Une loi de
// puissance monte plus vite au début et plus doucement à la fin — elle suit.
export function difficultyScales(time) {
  const d = CONFIG.director;
  const m = time / 60;
  return {
    hp: Math.pow(1 + m / d.hpHalfLife, d.hpExp),
    // Démarrage en douceur : la montée des dégâts commence après 30 s.
    dmg: 1 + d.dmgRatePerMin * Math.max(0, m - 0.5),
    speed: Math.min(d.speedCap, 1 + d.speedRatePerMin * m),
  };
}

// Montée en régime des spawns. À pleine cadence dès la seconde 0, le joueur est
// submergé avant d'avoir un seul niveau : la difficulté doit démarrer basse même
// si la courbe de PV, elle, part de ×1. Exporté pour que l'outil d'audit mesure
// exactement la même chose que le jeu.
export function warmupFactor(time) {
  const d = CONFIG.director;
  return Math.min(1, d.warmupStart + (1 - d.warmupStart) * (time / 60 / d.warmupMin));
}

export function createDirector() {
  return {
    tier: 0,
    cycleT: 0,
    phase: 'build',
    spawnTimer: 0,
    _peakDone: false,
    _typesCache: null,
    _typesTier: -1,

    reset() {
      this.tier = 0;
      this.cycleT = 0;
      this.phase = 'build';
      this.spawnTimer = 1.2;
      this._peakDone = false;
      this._typesCache = null;
      this._typesTier = -1;
    },

    // Types d'ennemis débloqués au palier courant (mis en cache par palier :
    // appelé à chaque batch de spawn).
    availableTypes() {
      if (this._typesTier !== this.tier) {
        const u = CONFIG.director.typeUnlock;
        const out = [];
        for (const k in u) if (+k <= this.tier) out.push(...u[k]);
        this._typesCache = out.length ? out : ['triangle'];
        this._typesTier = this.tier;
      }
      return this._typesCache;
    },

    scales(world) {
      return difficultyScales(world ? world.time : 0);
    },

    update(dt, world) {
      const d = CONFIG.director;
      this.cycleT += dt;
      if (this.cycleT >= d.cycle) {
        this.cycleT -= d.cycle;
        this.tier++;
        this._peakDone = false;
        if (world.onTierUp) world.onTierUp(this.tier);
      }

      this.phase = this.cycleT < d.buildEnd ? 'build' : this.cycleT < d.peakEnd ? 'peak' : 'breather';
      world.tier = this.tier;
      world.phase = this.phase;
      world.telegraph = this.cycleT >= d.buildEnd - d.telegraph && this.cycleT < d.buildEnd;

      // Début du pic : boss tous les N paliers (dans la nuée, sans vider l'arène).
      if (this.phase === 'peak' && !this._peakDone) {
        this._peakDone = true;
        if (this.tier > 0 && this.tier % d.bossEveryTiers === 0 && world.onSpawnBoss) world.onSpawnBoss(this.tier);
      }

      // Spawning selon la phase. Densité ET cadence montent avec le temps.
      const m = world.time / 60;
      const maxAlive = Math.min(d.maxAliveCap, Math.round(d.densStart + d.densPerMin * m));
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) return;

      let interval;
      let batch;
      if (this.phase === 'build') {
        const f = clamp(this.cycleT / d.buildEnd, 0, 1);
        interval = lerp(d.baseInterval, d.peakInterval * 1.6, f);
        batch = d.batch;
      } else if (this.phase === 'peak') {
        interval = d.peakInterval;
        batch = d.peakBatch;
      } else {
        interval = d.breatherInterval; // respiration : presque rien
        batch = 1;
      }
      this.spawnTimer = interval / ((1 + d.intervalTightenPerMin * m) * warmupFactor(world.time));

      const types = this.availableTypes();
      const sc = this.scales(world);
      const el = CONFIG.elites;
      const eliteChance = Math.min(el.maxChance, el.baseChance + el.chancePerMin * m);
      const affixKeys = Object.keys(el.affixes);
      for (let i = 0; i < batch; i++) {
        if (world.enemies.count >= maxAlive) break;
        const def = CONFIG.enemyTypes[types[(world.rng() * types.length) | 0]];
        const p = ringPos(world.player, d.spawnDist, world.rng);
        const e = world.enemies.obtain();
        e.init(def, p.x, p.y, sc.hp, sc.speed, sc.dmg);
        if (world.rng() < eliteChance) {
          const key = affixKeys[(world.rng() * affixKeys.length) | 0];
          e.makeElite(key, el.affixes[key]);
        }
      }
    },
  };
}
