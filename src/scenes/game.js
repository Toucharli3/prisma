// game.js — scène de jeu (sans-fin RYTHMÉ piloté par le Directeur).
// Cycles montée -> pic (télégraphié) -> respiration ; +1 palier par cycle
// (difficulté linéaire). Boss au pic, DANS la nuée (pas de gate, pas de reset).
// La mort est la seule fin ; le score alimente le classement.

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { Save } from '../engine/save.js';
import { CONFIG, PALETTES } from '../config.js';
import { lerp, makeRng, hexA, TAU } from '../engine/math.js';
import { Pool } from '../engine/pool.js';
import { SpatialGrid } from '../engine/grid.js';
import { Particles } from '../engine/particles.js';
import { Floaters } from '../engine/floaters.js';
import { ColorField } from '../systems/colorfield.js';
import { buildBackdrop } from '../systems/backdrop.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { Bullet } from '../entities/bullet.js';
import { Orb } from '../entities/orb.js';
import { Boss } from '../entities/boss.js';
import { createDirector } from '../systems/director.js';
import { createWeapons } from '../systems/weapons.js';
import { rollChoices } from '../systems/upgrades.js';
import { createUpgradeOverlay } from './upgrade.js';
import { renderPause } from './pause.js';
import { createOptionsOverlay } from './options.js';
import { drawHud } from '../ui/hud.js';
import { fillBar } from '../ui/widgets.js';

const SEPARATION_WEIGHT = 0.7;
const QUERY_PAD = 32;
const ORBITAL_HIT_CD = 0.35;
const FONT = '"Segoe UI", system-ui, sans-serif';
const xpForLevel = (level) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, level - 1));

export function createGameScene() {
  let app = null;
  let mode = 'play'; // play | levelup | upgrade | paused
  let slowmoT = 0;
  let upgrade = null;
  let pauseOptions = null;
  let pendingLevels = 0;
  let boss = null;

  const player = new Player();
  const enemies = new Pool(() => new Enemy(), 96);
  const bullets = new Pool(() => new Bullet(), CONFIG.bulletMax);
  const enemyBullets = new Pool(() => new Bullet(), CONFIG.enemyBulletMax);
  const orbs = new Pool(() => new Orb(), CONFIG.orbMax);
  const particles = new Particles(CONFIG.particles.max);
  const floaters = new Floaters(48);
  const colorfield = new ColorField(CONFIG.arena.width, CONFIG.arena.height);
  const grid = new SpatialGrid(CONFIG.arena.width, CONFIG.arena.height, CONFIG.grid.cell);
  const director = createDirector();

  const world = {
    player, enemies, bullets, enemyBullets, orbs, particles, floaters, colorfield, grid,
    boss: null,
    rng: makeRng(0xc0ffee),
    time: 0,
    tier: 0,
    phase: 'build',
    telegraph: false,
    tierFlash: 0,
    palette: PALETTES[0],
    kills: 0,
    xp: 0,
    level: 1,
    xpNext: xpForLevel(1),
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    score: 0,
    mouseWorld: { x: 0, y: 0 },
  };
  const weapons = createWeapons(world);
  world.weapons = weapons;

  // Hooks.
  world.onFire = () => Audio.shoot();
  world.onNova = () => {
    Audio.nova();
    Render.addShake(0.22);
  };
  world.onBossShoot = () => Audio.bossShoot();
  world.onTierUp = (tier) => {
    world.palette = PALETTES[tier % PALETTES.length];
    Render.setBackdrop(buildBackdrop(world.palette, CONFIG.arena.width, CONFIG.arena.height));
    Audio.setBiome(tier % PALETTES.length);
    colorfield.reset(world.palette, CONFIG.colorfield.killsToFull); // l'arène se repeint au nouveau palier
    world.tierFlash = 2.2;
    Audio.levelComplete();
  };
  world.onSpawnBoss = (tier) => {
    if (boss) return; // un seul boss à la fois
    const a = CONFIG.arena;
    const ang = world.rng() * TAU;
    const bx = Math.max(a.margin + 60, Math.min(a.width - a.margin - 60, player.x + Math.cos(ang) * 620));
    const by = Math.max(a.margin + 60, Math.min(a.height - a.margin - 60, player.y + Math.sin(ang) * 620));
    boss = new Boss();
    boss.init(tier, bx, by, Math.floor(tier / CONFIG.director.bossEveryTiers) % CONFIG.boss.variants.length);
    world.boss = boss;
    Render.addShake(0.6);
    Audio.bossSpawn();
  };

  // --- Progression ---
  function gainXp(v) {
    Audio.pickup();
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
    Audio.levelup();
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
    world.combo++;
    world.comboTimer = CONFIG.comboWindow;
    if (world.combo > world.bestCombo) world.bestCombo = world.combo;
    world.score += Math.round(CONFIG.score.perKill * world.combo * (1 + world.tier * CONFIG.score.depthBonus));
    const n = CONFIG.perf ? CONFIG.particles.killBurstPerf : CONFIG.particles.killBurst;
    particles.burst(e.x, e.y, n, world.palette.colors, world.rng);
    orbs.obtain().init(e.x, e.y, e.xp * (1 + world.tier * CONFIG.xp.orbXpDepth));
    colorfield.onKill(e.x, e.y, world.rng);

    if (e.splitInto > 0 && e.splitType && enemies.count < CONFIG.director.maxAliveCap) {
      const childDef = CONFIG.enemyTypes[e.splitType];
      const sc = director.scales();
      for (let i = 0; i < e.splitInto; i++) {
        const a = (i / e.splitInto) * TAU + world.rng();
        enemies.obtain().init(childDef, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, sc.hp * 0.6, sc.speed, sc.dmg);
      }
    }
  }
  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 0.08;
    if (!CONFIG.perf) floaters.spawn(e.x, e.y - e.radius, String(Math.round(dmg)), '#ffffff', 13, 0.6);
    if (e.hp <= 0) killEnemy(e);
  }
  function playerHurt() {
    Audio.hit();
    Render.addShake(0.3);
  }
  function killBoss() {
    const bx = boss.x;
    const by = boss.y;
    particles.burst(bx, by, CONFIG.perf ? 30 : 64, world.palette.colors, world.rng, 1.7);
    for (let i = 0; i < 10; i++) orbs.obtain().init(bx + (world.rng() * 2 - 1) * 50, by + (world.rng() * 2 - 1) * 50, Math.ceil(boss.xp / 10) * (1 + world.tier * CONFIG.xp.orbXpDepth));
    world.score += CONFIG.score.bossKill * (world.tier + 1);
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.25); // récompense : soin
    boss = null;
    world.boss = null;
    Render.addShake(0.85);
    Audio.bossDeath();
  }
  function damageBoss(dmg) {
    if (!boss) return;
    boss.hp -= dmg;
    boss.hitFlash = 0.08;
    if (!CONFIG.perf) floaters.spawn(boss.x, boss.y - boss.radius, String(Math.round(dmg)), CONFIG.danger, 16, 0.6);
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
    player.aimMode = CONFIG.aimMode;
    Render.screenToWorld(Input.mouse.x, Input.mouse.y, world.mouseWorld);
    if (world.comboTimer > 0) {
      world.comboTimer -= dt;
      if (world.comboTimer <= 0) world.combo = 0;
    }
    if (world.tierFlash > 0) world.tierFlash -= dt;

    player.update(dt);
    director.update(dt, world);
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
        enemyBullets.obtain().init(e.x, e.y, Math.cos(e.fireAngle) * e.bulletSpeed, Math.sin(e.fireAngle) * e.bulletSpeed, { damage: e.bulletDamage, radius: 6, life: 3, pierce: 0, color: CONFIG.danger });
      }
    });
    if (boss) boss.update(dt, world);

    rebuildGrid();
    bulletCollisions();
    weapons.applyContactDamage(damageEnemy);
    bossCollisions();

    enemies.forEach((e) => {
      const rr = player.radius + e.radius;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy < rr * rr && player.takeDamage(e.damage)) playerHurt();
    });
    if (boss) {
      const rr = player.radius + boss.radius;
      const dx = boss.x - player.x;
      const dy = boss.y - player.y;
      if (dx * dx + dy * dy < rr * rr && player.takeDamage(boss.contactDamage)) playerHurt();
    }
    enemyBullets.forEach((b) => {
      if (!b.alive) return;
      const rr = player.radius + b.radius;
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      if (dx * dx + dy * dy < rr * rr) {
        if (player.takeDamage(b.damage)) playerHurt();
        b.alive = false;
      }
    });

    particles.update(dt);
    floaters.update(dt);
    enemies.sweep();
    bullets.sweep();
    enemyBullets.sweep();
    orbs.sweep();

    if (player.dead) {
      app.gameOver({ score: world.score, kills: world.kills, time: world.time, playerLevel: world.level, biome: world.tier + 1, bestCombo: world.bestCombo });
    }
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
    floaters.render(Render);
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
    ctx.fillText('◆ ' + boss.name, vw / 2, y - 4);
  }

  return {
    world,
    getMode: () => mode,
    getChoices: () => (upgrade ? upgrade.choices.map((c) => c.name) : null),

    enter(_app) {
      app = _app;
      player.reset(CONFIG.arena.width / 2, CONFIG.arena.height / 2);
      const skin = Save.getSkin();
      player.coreColor = skin.core;
      player.glowColor = skin.glow;
      weapons.reset();
      weapons.add('eclat');
      enemies.clear();
      bullets.clear();
      enemyBullets.clear();
      orbs.clear();
      particles.clear();
      floaters.clear();
      boss = null;
      world.boss = null;
      director.reset();
      world.time = 0;
      world.kills = 0;
      world.xp = 0;
      world.level = 1;
      world.xpNext = xpForLevel(1);
      world.combo = 0;
      world.comboTimer = 0;
      world.bestCombo = 0;
      world.score = 0;
      world.tier = 0;
      world.tierFlash = 0;
      world.palette = PALETTES[0];
      Render.setBackdrop(buildBackdrop(world.palette, CONFIG.arena.width, CONFIG.arena.height));
      Audio.setBiome(0);
      colorfield.reset(world.palette, CONFIG.colorfield.killsToFull);
      mode = 'play';
      pendingLevels = 0;
      pauseOptions = null;
    },

    update(dt) {
      if (mode === 'paused') {
        if (pauseOptions) {
          pauseOptions.update(dt);
          return;
        }
        if (Input.pressed('KeyP', 'Escape')) mode = 'play';
        else if (Input.pressed('KeyO')) pauseOptions = createOptionsOverlay(() => (pauseOptions = null), () => app.gotoMenu());
        return;
      }
      if (mode === 'play' && Input.pressed('KeyP', 'Escape')) {
        mode = 'paused';
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
      if (mode === 'paused') {
        if (pauseOptions) pauseOptions.render(Render);
        else renderPause(Render);
      }
    },
  };
}
