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

export function createDirector() {
  return {
    tier: 0,
    cycleT: 0,
    phase: 'build',
    spawnTimer: 0,
    _peakDone: false,

    reset() {
      this.tier = 0;
      this.cycleT = 0;
      this.phase = 'build';
      this.spawnTimer = 1.2;
      this._peakDone = false;
    },

    // Types d'ennemis débloqués au palier courant.
    availableTypes() {
      const u = CONFIG.director.typeUnlock;
      const out = [];
      for (const k in u) if (+k <= this.tier) out.push(...u[k]);
      return out.length ? out : ['triangle'];
    },

    // Multiplicateurs de difficulté du palier courant (linéaires).
    scales() {
      const d = CONFIG.director;
      return {
        hp: 1 + this.tier * d.hpPerTier,
        dmg: 1 + this.tier * d.dmgPerTier,
        speed: Math.min(d.speedCap, 1 + this.tier * d.speedPerTier),
      };
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

      // Spawning selon la phase.
      const maxAlive = Math.min(d.maxAliveCap, d.baseMaxAlive + this.tier * d.maxAlivePerTier);
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
      this.spawnTimer = interval;

      const types = this.availableTypes();
      const sc = this.scales();
      for (let i = 0; i < batch; i++) {
        if (world.enemies.count >= maxAlive) break;
        const def = CONFIG.enemyTypes[types[(world.rng() * types.length) | 0]];
        const p = ringPos(world.player, d.spawnDist, world.rng);
        world.enemies.obtain().init(def, p.x, p.y, sc.hp, sc.speed, sc.dmg);
      }
    },
  };
}
