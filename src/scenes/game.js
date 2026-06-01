// game.js — scène de jeu principale. Détient le « monde » (joueur + pools) et
// orchestre les systèmes (spawner, plus tard armes/colorfield/boss).
// La logique tourne à pas fixe ; le rendu interpole via `alpha`.

import { Render } from '../engine/render.js';
import { CONFIG } from '../config.js';
import { lerp, makeRng } from '../engine/math.js';
import { Pool } from '../engine/pool.js';
import { SpatialGrid } from '../engine/grid.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { createSpawner } from '../systems/spawner.js';

const SEPARATION_WEIGHT = 0.7; // force d'anti-empilement des ennemis

export function createGameScene() {
  let app = null;

  const player = new Player();
  const enemies = new Pool(() => new Enemy(), 64);
  const grid = new SpatialGrid(CONFIG.arena.width, CONFIG.arena.height, CONFIG.grid.cell);
  const spawner = createSpawner();

  // Le « monde » partagé entre les systèmes.
  const world = { player, enemies, grid, rng: makeRng(0xc0ffee), time: 0 };

  // Reconstruit la grille puis calcule la séparation de chaque ennemi.
  function rebuildGridAndSeparate() {
    grid.clear();
    enemies.forEach((e) => grid.insert(e));
    enemies.forEach((e) => {
      let sx = 0;
      let sy = 0;
      grid.queryCircle(e.x, e.y, e.radius * 2.4, (o) => {
        if (o === e) return;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        const min = e.radius + o.radius;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) / min;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      });
      e.sepx = sx * SEPARATION_WEIGHT;
      e.sepy = sy * SEPARATION_WEIGHT;
    });
  }

  function drawHud() {
    const ctx = Render.ctx;
    const x = 16;
    const barW = 280;
    const barH = 16;
    const y = Render.viewH - 34;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, barW, barH);
    const frac = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = frac > 0.3 ? CONFIG.player.glowColor : CONFIG.danger;
    ctx.fillRect(x, y, barW * frac, barH);

    ctx.fillStyle = CONFIG.textPrimary;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`, x + 8, y + barH / 2);

    if (CONFIG.debug) {
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.textAlign = 'right';
      ctx.fillText(`ennemis: ${enemies.count}`, Render.viewW - 12, 16);
    }
  }

  return {
    world,

    enter(_app) {
      app = _app;
      player.reset(CONFIG.arena.width / 2, CONFIG.arena.height / 2);
      enemies.clear();
      spawner.reset(CONFIG.spawnBasic);
      world.time = 0;
    },

    update(dt) {
      world.time += dt;
      player.update(dt);
      spawner.update(dt, world);

      rebuildGridAndSeparate();

      // Mise à jour des ennemis + dégâts de contact au joueur.
      enemies.forEach((e) => {
        e.update(dt, player);
        const rr = player.radius + e.radius;
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        if (dx * dx + dy * dy < rr * rr) player.takeDamage(e.damage);
      });

      enemies.sweep();

      if (player.dead) app.gameOver({ time: world.time });
    },

    render(alpha) {
      Render.follow(lerp(player.px, player.x, alpha), lerp(player.py, player.y, alpha));
      Render.begin();
      enemies.forEach((e) => e.render(Render, alpha));
      player.render(Render, alpha);
      Render.end();
      drawHud();
    },
  };
}
