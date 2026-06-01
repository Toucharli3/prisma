// game.js — scène de jeu principale. Détient le « monde » (joueur + pools) et
// orchestre les systèmes. La logique tourne à pas fixe ; le rendu interpole.

import { Render } from '../engine/render.js';
import { CONFIG, PALETTES } from '../config.js';
import { lerp, makeRng } from '../engine/math.js';
import { Pool } from '../engine/pool.js';
import { SpatialGrid } from '../engine/grid.js';
import { Particles } from '../engine/particles.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { Bullet } from '../entities/bullet.js';
import { createSpawner } from '../systems/spawner.js';
import { createWeapons } from '../systems/weapons.js';

const SEPARATION_WEIGHT = 0.7; // force d'anti-empilement des ennemis
const QUERY_PAD = 28; // marge de requête grille (rayon max d'un petit ennemi)

export function createGameScene() {
  let app = null;

  const player = new Player();
  const enemies = new Pool(() => new Enemy(), 64);
  const bullets = new Pool(() => new Bullet(), CONFIG.bulletMax);
  const particles = new Particles(CONFIG.particles.max);
  const grid = new SpatialGrid(CONFIG.arena.width, CONFIG.arena.height, CONFIG.grid.cell);
  const spawner = createSpawner();

  // Le « monde » partagé entre les systèmes.
  const world = {
    player,
    enemies,
    bullets,
    particles,
    grid,
    rng: makeRng(0xc0ffee),
    time: 0,
    levelIndex: 0,
    palette: PALETTES[0],
    kills: 0,
    mouseWorld: null,
  };
  const weapons = createWeapons(world);
  world.weapons = weapons;

  // --- Helpers ---

  function rebuildGrid() {
    grid.clear();
    enemies.forEach((e) => grid.insert(e));
  }

  function separate() {
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

  function killEnemy(e) {
    e.alive = false;
    world.kills++;
    const n = CONFIG.perf ? CONFIG.particles.killBurstPerf : CONFIG.particles.killBurst;
    particles.burst(e.x, e.y, n, world.palette.colors, world.rng);
    // Phase 4 : orbe d'XP ; Phase 5 : éclaboussure colorfield.
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 0.08;
    if (e.hp <= 0) killEnemy(e);
  }

  function bulletCollisions() {
    bullets.forEach((b) => {
      if (!b.alive) return;
      grid.queryCircle(b.x, b.y, b.radius + QUERY_PAD, (e) => {
        if (!b.alive || !e.alive || e.lastBulletId === b.id) return;
        const rr = b.radius + e.radius;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy <= rr * rr) {
          e.lastBulletId = b.id;
          damageEnemy(e, b.damage);
          if (b.pierce > 0) b.pierce--;
          else b.alive = false;
        }
      });
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
      ctx.fillText(`ennemis: ${enemies.count}  tirs: ${bullets.count}  kills: ${world.kills}`, Render.viewW - 12, 16);
    }
  }

  return {
    world,

    enter(_app) {
      app = _app;
      player.reset(CONFIG.arena.width / 2, CONFIG.arena.height / 2);
      enemies.clear();
      bullets.clear();
      particles.clear();
      weapons.reset();
      weapons.add('eclat');
      spawner.reset(CONFIG.spawnBasic);
      world.time = 0;
      world.kills = 0;
      world.levelIndex = 0;
      world.palette = PALETTES[0];
    },

    update(dt) {
      world.time += dt;

      player.update(dt);
      spawner.update(dt, world);
      weapons.update(dt);
      bullets.forEach((b) => b.update(dt));

      // 1) grille (positions courantes) -> séparation -> déplacement des ennemis
      rebuildGrid();
      separate();
      enemies.forEach((e) => e.update(dt, player));

      // 2) grille reconstruite (positions à jour) -> collisions
      rebuildGrid();
      bulletCollisions();

      // contact ennemi -> joueur
      enemies.forEach((e) => {
        const rr = player.radius + e.radius;
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        if (dx * dx + dy * dy < rr * rr) player.takeDamage(e.damage);
      });

      particles.update(dt);
      enemies.sweep();
      bullets.sweep();

      if (player.dead) app.gameOver({ time: world.time, kills: world.kills });
    },

    render(alpha) {
      Render.follow(lerp(player.px, player.x, alpha), lerp(player.py, player.y, alpha));
      Render.begin();

      enemies.forEach((e) => e.render(Render, alpha));

      Render.additive();
      bullets.forEach((b) => b.render(Render, alpha));
      Render.normal();

      particles.render(Render);
      player.render(Render, alpha);

      Render.end();
      drawHud();
    },
  };
}
