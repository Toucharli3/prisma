// spawner.js — apparition des ennemis. Version Phase 2 : flux continu basé sur
// un intervalle. Conçu pour être piloté par les données (config par niveau,
// remplacé/étendu en Phase 6).

import { CONFIG } from '../config.js';
import { clamp, TAU } from '../engine/math.js';

// Position sur un anneau autour du joueur (hors écran), bornée à l'arène.
function ringPos(player, dist, rng) {
  const a = rng() * TAU;
  const m = CONFIG.arena.margin + 30;
  return {
    x: clamp(player.x + Math.cos(a) * dist, m, CONFIG.arena.width - m),
    y: clamp(player.y + Math.sin(a) * dist, m, CONFIG.arena.height - m),
  };
}

function pickType(cfg, rng) {
  const key = cfg.types[(rng() * cfg.types.length) | 0];
  return CONFIG.enemyTypes[key];
}

export function createSpawner() {
  return {
    config: null,
    timer: 0,

    reset(levelConfig) {
      this.config = levelConfig;
      this.timer = levelConfig.firstDelay ?? 1;
    },

    update(dt, world) {
      const cfg = this.config;
      if (!cfg) return;
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = cfg.interval;

      for (let i = 0; i < cfg.batch; i++) {
        if (world.enemies.count >= cfg.maxAlive) break;
        const def = pickType(cfg, world.rng);
        const p = ringPos(world.player, cfg.spawnDist, world.rng);
        world.enemies.obtain().init(def, p.x, p.y, cfg.hpScale || 1, cfg.speedScale || 1);
      }
    },
  };
}
