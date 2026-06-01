// game.js — scène de jeu principale. Détient le « monde » (joueur + pools) et
// orchestre les systèmes. Gère 4 modes internes : play / levelup (ralenti) /
// upgrade (overlay de choix) / paused. La logique tourne à pas fixe.

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { CONFIG, PALETTES } from '../config.js';
import { lerp, makeRng, hexA } from '../engine/math.js';
import { Pool } from '../engine/pool.js';
import { SpatialGrid } from '../engine/grid.js';
import { Particles } from '../engine/particles.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { Bullet } from '../entities/bullet.js';
import { Orb } from '../entities/orb.js';
import { createSpawner } from '../systems/spawner.js';
import { createWeapons } from '../systems/weapons.js';
import { rollChoices } from '../systems/upgrades.js';
import { createUpgradeOverlay } from './upgrade.js';
import { renderPause } from './pause.js';
import { fillBar } from '../ui/widgets.js';

const SEPARATION_WEIGHT = 0.7;
const QUERY_PAD = 28;

const xpForLevel = (level) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, level - 1));

export function createGameScene() {
  let app = null;
  let mode = 'play'; // play | levelup | upgrade | paused
  let slowmoT = 0;
  let upgrade = null;
  let pendingLevels = 0;

  const player = new Player();
  const enemies = new Pool(() => new Enemy(), 64);
  const bullets = new Pool(() => new Bullet(), CONFIG.bulletMax);
  const orbs = new Pool(() => new Orb(), CONFIG.orbMax);
  const particles = new Particles(CONFIG.particles.max);
  const grid = new SpatialGrid(CONFIG.arena.width, CONFIG.arena.height, CONFIG.grid.cell);
  const spawner = createSpawner();

  const world = {
    player,
    enemies,
    bullets,
    orbs,
    particles,
    grid,
    rng: makeRng(0xc0ffee),
    time: 0,
    levelIndex: 0,
    palette: PALETTES[0],
    kills: 0,
    xp: 0,
    level: 1,
    xpNext: xpForLevel(1),
    mouseWorld: null,
  };
  const weapons = createWeapons(world);
  world.weapons = weapons;

  // --- Progression ---
  function gainXp(v) {
    world.xp += v;
    while (world.xp >= world.xpNext) {
      world.xp -= world.xpNext;
      world.level++;
      world.xpNext = xpForLevel(world.level);
      pendingLevels++;
    }
    if (pendingLevels > 0 && mode === 'play') startLevelUp();
  }

  function startLevelUp() {
    mode = 'levelup';
    slowmoT = CONFIG.levelUp.slowmoTime;
  }

  function openUpgrade() {
    upgrade = createUpgradeOverlay(world, rollChoices(world, 3), (choice) => {
      choice.apply(world);
      pendingLevels--;
      if (pendingLevels > 0) startLevelUp();
      else mode = 'play';
    });
    mode = 'upgrade';
  }

  // --- Combat ---
  function killEnemy(e) {
    e.alive = false;
    world.kills++;
    const n = CONFIG.perf ? CONFIG.particles.killBurstPerf : CONFIG.particles.killBurst;
    particles.burst(e.x, e.y, n, world.palette.colors, world.rng);
    orbs.obtain().init(e.x, e.y, e.xp);
    // Phase 5 : éclaboussure du colorfield.
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 0.08;
    if (e.hp <= 0) killEnemy(e);
  }

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

  // Pipeline complet d'une étape de simulation (dt potentiellement ralenti).
  function stepWorld(dt) {
    world.time += dt;
    player.update(dt);
    spawner.update(dt, world);
    weapons.update(dt);
    bullets.forEach((b) => b.update(dt));

    const collectR = CONFIG.playerStats.collectRadius * player.mods.collectMul;
    orbs.forEach((o) => {
      const got = o.update(dt, player, collectR);
      if (got) gainXp(got);
    });

    rebuildGrid();
    separate();
    enemies.forEach((e) => e.update(dt, player));

    rebuildGrid();
    bulletCollisions();
    weapons.applyContactDamage(damageEnemy);

    enemies.forEach((e) => {
      const rr = player.radius + e.radius;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy < rr * rr) player.takeDamage(e.damage);
    });

    particles.update(dt);
    enemies.sweep();
    bullets.sweep();
    orbs.sweep();

    if (player.dead) app.gameOver({ time: world.time, kills: world.kills, level: world.level });
  }

  function drawHud() {
    const ctx = Render.ctx;
    const vw = Render.viewW;

    // Barre d'XP (haut, pleine largeur).
    const xpFrac = world.xp / world.xpNext;
    fillBar(ctx, 130, 14, vw - 260, 8, xpFrac, CONFIG.player.glowColor);
    ctx.fillStyle = CONFIG.textPrimary;
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`NIVEAU ${world.level}`, vw / 2, 28);

    // Barre de PV (bas-gauche).
    const y = Render.viewH - 34;
    const frac = Math.max(0, player.hp / player.maxHp);
    fillBar(ctx, 16, y, 280, 16, frac, frac > 0.3 ? CONFIG.player.glowColor : CONFIG.danger);
    ctx.fillStyle = CONFIG.textPrimary;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`, 24, y + 8);

    if (CONFIG.debug) {
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`ennemis:${enemies.count} tirs:${bullets.count} orbes:${orbs.count} kills:${world.kills}`, vw - 12, 44);
    }
  }

  function drawWorld(alpha) {
    Render.follow(lerp(player.px, player.x, alpha), lerp(player.py, player.y, alpha));
    Render.begin();

    enemies.forEach((e) => e.render(Render, alpha));

    Render.additive();
    bullets.forEach((b) => b.render(Render, alpha));
    const pc = world.palette.colors[1];
    orbs.forEach((o) => o.render(Render, pc, alpha));
    Render.normal();

    particles.render(Render);
    weapons.render(Render, lerp(player.px, player.x, alpha), lerp(player.py, player.y, alpha));
    player.render(Render, alpha);

    Render.end();
  }

  return {
    world,
    getMode: () => mode,
    getChoices: () => (upgrade ? upgrade.choices.map((c) => c.name) : null),

    enter(_app) {
      app = _app;
      player.reset(CONFIG.arena.width / 2, CONFIG.arena.height / 2);
      enemies.clear();
      bullets.clear();
      orbs.clear();
      particles.clear();
      weapons.reset();
      weapons.add('eclat');
      spawner.reset(CONFIG.spawnBasic);
      world.time = 0;
      world.kills = 0;
      world.xp = 0;
      world.level = 1;
      world.xpNext = xpForLevel(1);
      world.levelIndex = 0;
      world.palette = PALETTES[0];
      mode = 'play';
      pendingLevels = 0;
    },

    update(dt) {
      if ((mode === 'play' || mode === 'paused') && Input.pressed('KeyP', 'Escape')) {
        mode = mode === 'paused' ? 'play' : 'paused';
      }
      if (mode === 'paused') return;
      if (mode === 'upgrade') {
        upgrade.update(dt);
        return;
      }
      if (mode === 'levelup') {
        slowmoT -= dt;
        stepWorld(dt * CONFIG.levelUp.slowmoScale);
        if (slowmoT <= 0) openUpgrade();
        return;
      }
      stepWorld(dt);
    },

    render(alpha) {
      drawWorld(alpha);

      if (mode === 'levelup') {
        const ctx = Render.ctx;
        ctx.fillStyle = hexA(world.palette.colors[0], 0.14 * (slowmoT / CONFIG.levelUp.slowmoTime));
        ctx.fillRect(0, 0, Render.viewW, Render.viewH);
      }

      drawHud();

      if (mode === 'upgrade') upgrade.render(Render);
      if (mode === 'paused') renderPause(Render);
    },
  };
}
