// game.js — scène de jeu principale. Détient le « monde » (joueur + pools) et
// orchestre les systèmes. Gère l'enchaînement des 5 niveaux (le build du joueur
// persiste), les boss et les modes internes : play / levelup / upgrade / paused /
// complete. La logique tourne à pas fixe.

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { CONFIG, PALETTES } from '../config.js';
import { lerp, makeRng, hexA } from '../engine/math.js';
import { Pool } from '../engine/pool.js';
import { SpatialGrid } from '../engine/grid.js';
import { Particles } from '../engine/particles.js';
import { ColorField } from '../systems/colorfield.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { Bullet } from '../entities/bullet.js';
import { Orb } from '../entities/orb.js';
import { Boss } from '../entities/boss.js';
import { createSpawner } from '../systems/spawner.js';
import { createWeapons } from '../systems/weapons.js';
import { rollChoices } from '../systems/upgrades.js';
import { createUpgradeOverlay } from './upgrade.js';
import { renderPause } from './pause.js';
import { drawHud } from '../ui/hud.js';
import { fillBar } from '../ui/widgets.js';

const SEPARATION_WEIGHT = 0.7;
const QUERY_PAD = 28;
const ORBITAL_HIT_CD = 0.35;
const FONT = '"Segoe UI", system-ui, sans-serif';

const xpForLevel = (level) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, level - 1));

export function createGameScene() {
  let app = null;
  let mode = 'play'; // play | levelup | upgrade | paused | complete
  let slowmoT = 0;
  let completeT = 0;
  let upgrade = null;
  let pendingLevels = 0;
  let boss = null;
  let bossSpawned = false;
  let bossActive = false;

  const player = new Player();
  const enemies = new Pool(() => new Enemy(), 64);
  const bullets = new Pool(() => new Bullet(), CONFIG.bulletMax);
  const enemyBullets = new Pool(() => new Bullet(), CONFIG.enemyBulletMax);
  const orbs = new Pool(() => new Orb(), CONFIG.orbMax);
  const particles = new Particles(CONFIG.particles.max);
  const colorfield = new ColorField(CONFIG.arena.width, CONFIG.arena.height);
  const grid = new SpatialGrid(CONFIG.arena.width, CONFIG.arena.height, CONFIG.grid.cell);
  const spawner = createSpawner();

  const world = {
    player,
    enemies,
    bullets,
    enemyBullets,
    orbs,
    particles,
    colorfield,
    grid,
    boss: null,
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

  // --- Niveaux ---
  function loadLevel(index) {
    const lvl = CONFIG.levels[index];
    world.levelIndex = index;
    world.palette = PALETTES[index];
    enemies.clear();
    bullets.clear();
    enemyBullets.clear();
    orbs.clear();
    particles.clear();
    boss = null;
    world.boss = null;
    bossSpawned = false;
    bossActive = false;
    spawner.reset(lvl.spawn);
    colorfield.reset(world.palette, lvl.killsToFull);
    player.x = player.px = CONFIG.arena.width / 2;
    player.y = player.py = CONFIG.arena.height / 2;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35); // soin entre niveaux
    player.inv = 0;
    mode = 'play';
  }

  function advanceLevel() {
    if (world.levelIndex + 1 >= CONFIG.levels.length) {
      app.victory({ time: world.time, kills: world.kills, level: world.level });
      return;
    }
    loadLevel(world.levelIndex + 1);
  }

  // --- Progression / XP ---
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
    colorfield.onKill(e.x, e.y, world.rng);
    if (bossActive && colorfield.percent > 0.99) colorfield.percent = 0.99; // gated par le boss
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 0.08;
    if (e.hp <= 0) killEnemy(e);
  }

  function spawnBoss() {
    bossSpawned = true;
    bossActive = true;
    const a = CONFIG.arena;
    const ang = Math.atan2(player.y - a.height / 2, player.x - a.width / 2) + Math.PI;
    const bx = Math.max(a.margin + 60, Math.min(a.width - a.margin - 60, player.x + Math.cos(ang) * 520));
    const by = Math.max(a.margin + 60, Math.min(a.height - a.margin - 60, player.y + Math.sin(ang) * 520));
    boss = new Boss();
    boss.init(world.levelIndex, bx, by);
    world.boss = boss;
    if (world.onBossSpawn) world.onBossSpawn();
  }

  function killBoss() {
    const bx = boss.x;
    const by = boss.y;
    const n = CONFIG.perf ? 30 : 60;
    particles.burst(bx, by, n, world.palette.colors, world.rng, 1.6);
    for (let i = 0; i < 8; i++) {
      orbs.obtain().init(bx + (world.rng() * 2 - 1) * 40, by + (world.rng() * 2 - 1) * 40, Math.ceil(boss.xp / 8));
    }
    colorfield.percent = 1; // débloque la complétion du niveau
    boss = null;
    world.boss = null;
    bossActive = false;
    if (world.onBossDeath) world.onBossDeath();
  }

  function damageBoss(dmg) {
    if (!boss) return;
    boss.hp -= dmg;
    boss.hitFlash = 0.08;
    if (boss.hp <= 0) killBoss();
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

  function bossCollisions() {
    if (!boss) return;
    bullets.forEach((b) => {
      if (!b.alive || !boss || b.id === boss.lastBulletId) return;
      const rr = b.radius + boss.radius;
      const dx = boss.x - b.x;
      const dy = boss.y - b.y;
      if (dx * dx + dy * dy <= rr * rr) {
        boss.lastBulletId = b.id;
        damageBoss(b.damage);
        if (b.pierce > 0) b.pierce--;
        else b.alive = false;
      }
    });
    weapons.forEachOrbitalNode((nx, ny, nr, dmg) => {
      if (!boss || boss.orbitalCd > 0) return;
      const rr = nr + boss.radius;
      const dx = boss.x - nx;
      const dy = boss.y - ny;
      if (dx * dx + dy * dy <= rr * rr) {
        damageBoss(dmg);
        if (boss) boss.orbitalCd = ORBITAL_HIT_CD;
      }
    });
    if (!boss) return;
    for (const nv of weapons.novas) {
      if (!boss) break;
      if (nv.bossHit) continue;
      const dx = boss.x - nv.x;
      const dy = boss.y - nv.y;
      if (dx * dx + dy * dy <= nv.maxR * nv.maxR) {
        nv.bossHit = true;
        damageBoss(nv.damage);
      }
    }
  }

  function stepWorld(dt) {
    world.time += dt;
    player.update(dt);
    spawner.update(dt, world);
    weapons.update(dt);
    bullets.forEach((b) => b.update(dt));
    enemyBullets.forEach((b) => b.update(dt));

    const collectR = CONFIG.playerStats.collectRadius * player.mods.collectMul;
    orbs.forEach((o) => {
      const got = o.update(dt, player, collectR);
      if (got) gainXp(got);
    });

    rebuildGrid();
    separate();
    enemies.forEach((e) => {
      e.update(dt, player);
      if (e.fireReady) {
        e.fireReady = false;
        enemyBullets.obtain().init(e.x, e.y, Math.cos(e.fireAngle) * e.bulletSpeed, Math.sin(e.fireAngle) * e.bulletSpeed, {
          damage: e.bulletDamage,
          radius: 6,
          life: 3,
          pierce: 0,
          color: CONFIG.danger,
        });
      }
    });
    if (boss) boss.update(dt, world);

    // Déclenchement du boss vers bossTrigger % de couleur.
    if (!bossSpawned && colorfield.percent >= CONFIG.levels[world.levelIndex].bossTrigger) spawnBoss();

    rebuildGrid();
    bulletCollisions();
    weapons.applyContactDamage(damageEnemy);
    bossCollisions();

    // Contact ennemis / boss -> joueur.
    enemies.forEach((e) => {
      const rr = player.radius + e.radius;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy < rr * rr) player.takeDamage(e.damage);
    });
    if (boss) {
      const rr = player.radius + boss.radius;
      const dx = boss.x - player.x;
      const dy = boss.y - player.y;
      if (dx * dx + dy * dy < rr * rr) player.takeDamage(boss.contactDamage);
    }

    // Projectiles ennemis -> joueur.
    enemyBullets.forEach((b) => {
      if (!b.alive) return;
      const rr = player.radius + b.radius;
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      if (dx * dx + dy * dy < rr * rr) {
        player.takeDamage(b.damage);
        b.alive = false;
      }
    });

    particles.update(dt);
    enemies.sweep();
    bullets.sweep();
    enemyBullets.sweep();
    orbs.sweep();

    if (player.dead) app.gameOver({ time: world.time, kills: world.kills, level: world.levelIndex + 1 });
  }

  function drawWorld(alpha) {
    const ix = lerp(player.px, player.x, alpha);
    const iy = lerp(player.py, player.y, alpha);
    Render.follow(ix, iy);
    Render.begin();

    colorfield.render(Render);

    enemies.forEach((e) => e.render(Render, alpha));
    if (boss) boss.render(Render, alpha);

    Render.additive();
    bullets.forEach((b) => b.render(Render, alpha));
    enemyBullets.forEach((b) => b.render(Render, alpha));
    const pc = world.palette.colors[1];
    orbs.forEach((o) => o.render(Render, pc, alpha));
    Render.normal();

    particles.render(Render);
    weapons.render(Render, ix, iy);
    player.render(Render, alpha);

    Render.end();
  }

  function drawBossBar() {
    const ctx = Render.ctx;
    const vw = Render.viewW;
    const bw = Math.min(540, vw * 0.62);
    const x = (vw - bw) / 2;
    const y = 76;
    fillBar(ctx, x, y, bw, 14, Math.max(0, boss.hp / boss.maxHp), CONFIG.danger);
    ctx.fillStyle = CONFIG.textPrimary;
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('⬡ LE STATIQUE', vw / 2, y - 4);
  }

  function drawComplete(R) {
    const ctx = R.ctx;
    const vw = R.viewW;
    const vh = R.viewH;
    ctx.fillStyle = 'rgba(8,8,14,0.5)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = world.palette.colors[1];
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText('COULEUR RESTAURÉE', vw / 2, vh / 2 - 84);
    ctx.fillStyle = CONFIG.textPrimary;
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText('100%', vw / 2, vh / 2 - 6);
    ctx.font = `800 32px ${FONT}`;
    const last = world.levelIndex + 1 >= CONFIG.levels.length;
    ctx.fillText(last ? 'DERNIER BIOME PURIFIÉ' : `${world.palette.name.toUpperCase()} — BIOME PURIFIÉ`, vw / 2, vh / 2 + 64);
    if (completeT > 1.2) {
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(last ? 'Entrée / clic pour la victoire' : 'Entrée / clic pour le biome suivant', vw / 2, vh / 2 + 116);
    }
  }

  return {
    world,
    getMode: () => mode,
    getChoices: () => (upgrade ? upgrade.choices.map((c) => c.name) : null),
    getDebug: () => ({ mode, levelIndex: world.levelIndex, percent: world.colorfield.percent, boss: boss ? { hp: boss.hp, max: boss.maxHp } : null }),

    enter(_app) {
      app = _app;
      player.reset(CONFIG.arena.width / 2, CONFIG.arena.height / 2);
      weapons.reset();
      weapons.add('eclat');
      world.time = 0;
      world.kills = 0;
      world.xp = 0;
      world.level = 1;
      world.xpNext = xpForLevel(1);
      pendingLevels = 0;
      loadLevel(0);
    },

    update(dt) {
      if ((mode === 'play' || mode === 'paused') && Input.pressed('KeyP', 'Escape')) {
        mode = mode === 'paused' ? 'play' : 'paused';
      }
      if (mode === 'paused') return;

      if (mode === 'complete') {
        completeT += dt;
        if (completeT > 1.2 && app.input.confirmPressed()) advanceLevel();
        return;
      }
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
      if (colorfield.complete) {
        mode = 'complete';
        completeT = 0;
      }
    },

    render(alpha) {
      drawWorld(alpha);

      if (mode === 'levelup') {
        const ctx = Render.ctx;
        ctx.fillStyle = hexA(world.palette.colors[0], 0.14 * (slowmoT / CONFIG.levelUp.slowmoTime));
        ctx.fillRect(0, 0, Render.viewW, Render.viewH);
      }

      drawHud(Render, world);
      if (boss) drawBossBar();

      if (mode === 'upgrade') upgrade.render(Render);
      if (mode === 'paused') renderPause(Render);
      if (mode === 'complete') drawComplete(Render);
    },
  };
}
