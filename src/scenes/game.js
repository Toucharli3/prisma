// game.js — scène de jeu (sans-fin RYTHMÉ piloté par le Directeur).
// Cycles montée -> pic (télégraphié) -> respiration ; +1 palier par cycle
// (difficulté linéaire). Boss au pic, DANS la nuée (pas de gate, pas de reset).
// La mort est la seule fin ; le score alimente le classement.

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { Save } from '../engine/save.js';
import { CONFIG, PALETTES } from '../config.js';
import { lerp, makeRng, hexA, TAU, clamp } from '../engine/math.js';
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
import { FONT } from '../ui/fonts.js';

const SEPARATION_WEIGHT = 0.7;
const QUERY_PAD = 32;
const ORBITAL_HIT_CD = 0.35;
const xpForLevel = (level) => Math.round(CONFIG.xp.base * Math.pow(CONFIG.xp.growth, level - 1));

export function createGameScene() {
  let app = null;
  let mode = 'play'; // play | levelup | upgrade | paused
  let slowmoT = 0;
  let upgrade = null;
  let pauseOptions = null;
  let pendingLevels = 0;
  let boss = null;
  let ended = false; // partie terminée (empêche un double gameOver)
  let pausedByBlur = false; // pause AUTOMATIQUE (perte de focus) vs volontaire
  // Arrêt sur image : le monde se fige quelques frames sur les gros impacts.
  // C'est le réglage de « game feel » le plus rentable du genre — sans lui, un
  // coup énorme et un coup ordinaire se ressemblent.
  let hitstop = 0;
  const addHitstop = (t) => {
    if (!CONFIG.hitstop.enabled) return;
    hitstop = Math.max(hitstop, t);
  };

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
  const rings = []; // ondes de choc (style) : { x, y, r, maxR, life, maxLife, color, w }
  const hazards = []; // failles du Statique : { x, y, r, state, t }
  const pickups = []; // objets de map : { type, x, y, t }
  let hazardTimer = CONFIG.hazards.firstDelay;
  let bombTimer = CONFIG.bomb.spawnInterval;
  let meteorTimer = 0;

  function spawnRing(x, y, maxR, color, width) {
    if (CONFIG.perf) return;
    rings.push({ x, y, r: 0, maxR, life: 0.34, maxLife: 0.34, color, w: width || 3 });
    if (rings.length > 36) rings.shift();
  }

  function spawnHazard(opts = {}) {
    const h = CONFIG.hazards;
    const m = world.time / 60;
    const ang = world.rng() * TAU;
    const dist = opts.distMin != null ? opts.distMin + world.rng() * (opts.distMax - opts.distMin) : h.spawnNearMin + world.rng() * (h.spawnNearMax - h.spawnNearMin);
    const a = CONFIG.arena;
    const mar = a.margin + 60;
    hazards.push({
      x: clamp(player.x + Math.cos(ang) * dist, mar, a.width - mar),
      y: clamp(player.y + Math.sin(ang) * dist, mar, a.height - mar),
      r: opts.r != null ? opts.r : Math.min(h.rMax, h.rBase + h.rPerMin * m),
      state: 'warn',
      t: opts.warn != null ? opts.warn : h.warn,
      activeDur: opts.active != null ? opts.active : h.active,
    });
  }

  function spawnPickup(type, x, y) {
    pickups.push({ type, x, y, t: type === 'heal' ? 13 : 22 });
  }

  // Bombe de couleur : déflagration qui nettoie la zone + soigne (porte de sortie).
  function detonateBomb() {
    const R = CONFIG.bomb.radius;
    const R2 = R * R;
    enemies.forEach((e) => {
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy < R2) damageEnemy(e, 1e9);
    });
    if (boss) damageBoss(boss.maxHp * CONFIG.bomb.bossDamageFrac);
    particles.burst(player.x, player.y, CONFIG.perf ? 30 : 70, world.palette.colors, world.rng, 2.2);
    spawnRing(player.x, player.y, R, '#ffffff', 9);
    spawnRing(player.x, player.y, R * 0.66, world.palette.colors[2], 6);
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * CONFIG.bomb.heal);
    player.inv = Math.max(player.inv, 0.6);
    Render.addShake(0.8);
    addHitstop(CONFIG.hitstop.bomb);
    Input.rumble(0.7, 220);
    Audio.nova();
  }

  // PRISMA BURST (touche R, jauge pleine) : déflagration arc-en-ciel qui nettoie
  // l'écran, surcharge les armes et rapporte gros. La jauge se vide.
  function prismaBurst() {
    const pb = CONFIG.prismaBurst;
    const R2 = pb.radius * pb.radius;
    enemies.forEach((e) => {
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy < R2) damageEnemy(e, 1e9);
    });
    if (boss) damageBoss(boss.maxHp * pb.bossDamageFrac);
    world.overchargeT = pb.overchargeTime;
    world.score += Math.round(pb.scoreBonus * (1 + world.tier * CONFIG.score.depthBonus));
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * pb.heal);
    player.inv = Math.max(player.inv, 0.8);
    colorfield.drainGauge();
    // Feu d'artifice arc-en-ciel : toutes les palettes.
    const allColors = PALETTES.flatMap((p) => p.colors);
    particles.burst(player.x, player.y, CONFIG.perf ? 40 : 90, allColors, world.rng, 2.6);
    spawnRing(player.x, player.y, pb.radius, '#ffffff', 10);
    spawnRing(player.x, player.y, pb.radius * 0.7, world.palette.colors[1], 7);
    spawnRing(player.x, player.y, pb.radius * 0.45, world.palette.colors[2], 5);
    Render.addShake(0.9);
    addHitstop(CONFIG.hitstop.burst);
    Input.rumble(1, 320);
    Audio.victory();
  }

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
    overchargeT: 0, // surcharge Prisma (après un Burst)
    bossKills: 0,
    bombsUsed: 0,
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
  world.onBossEnrage = () => {
    Audio.bossSpawn();
    Render.addShake(0.5);
    // Gel sur le passage en phase 2 : le moment doit se REMARQUER. (Pas sur
    // chaque coup porté au boss, sinon le jeu bégaierait en permanence.)
    addHitstop(CONFIG.hitstop.bossHurt);
    Input.rumble(0.8, 300);
  };
  world.onTierUp = (tier) => {
    world.palette = PALETTES[tier % PALETTES.length];
    Render.setBackdrop(buildBackdrop(world.palette, CONFIG.arena.width, CONFIG.arena.height));
    Audio.setBiome(tier % PALETTES.length);
    colorfield.setPalette(world.palette); // nouvelle teinte SANS vider la jauge Prisma
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
    boss.init(tier, bx, by, Math.floor(tier / CONFIG.director.bossEveryTiers) % CONFIG.boss.variants.length, director.scales(world).dmg);
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
    Audio.kill();
    world.kills++;
    world.combo++;
    world.comboTimer = CONFIG.comboWindow;
    if (world.combo > world.bestCombo) world.bestCombo = world.combo;
    world.score += Math.round(CONFIG.score.perKill * world.combo * (1 + world.tier * CONFIG.score.depthBonus));
    const n = CONFIG.perf ? CONFIG.particles.killBurstPerf : CONFIG.particles.killBurst;
    particles.burst(e.x, e.y, n, world.palette.colors, world.rng);
    spawnRing(e.x, e.y, e.radius * 3.6, world.palette.colors[(world.rng() * 3) | 0], 2.5);
    orbs.obtain().init(e.x, e.y, e.xp * (1 + world.tier * CONFIG.xp.orbXpDepth));
    colorfield.onKill(e.x, e.y, world.rng);
    if (world.rng() < CONFIG.bomb.healDropChance) spawnPickup('heal', e.x, e.y);

    // Élite : explosion de balles (Détonant), charge Prisma bonus, drop garanti.
    if (e.elite) {
      if (e.deathBullets > 0) {
        for (let i = 0; i < e.deathBullets; i++) {
          const a = (i / e.deathBullets) * TAU;
          enemyBullets.obtain().init(e.x, e.y, Math.cos(a) * e.deathBulletSpeed, Math.sin(a) * e.deathBulletSpeed, { damage: e.damage * 0.6, radius: 6, life: 2.2, pierce: 0, color: CONFIG.danger, hostile: true });
        }
      }
      colorfield.addCharge(CONFIG.elites.prismaFill);
      if (world.rng() < CONFIG.elites.dropChance) spawnPickup(world.rng() < 0.5 ? 'bomb' : 'heal', e.x, e.y);
      spawnRing(e.x, e.y, e.radius * 5, e.eliteAura, 4);
      addHitstop(CONFIG.hitstop.eliteKill);
      Input.rumble(0.22, 90);
    }

    if (e.splitInto > 0 && e.splitType && enemies.count < CONFIG.director.maxAliveCap) {
      const childDef = CONFIG.enemyTypes[e.splitType];
      const sc = director.scales(world);
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
    addHitstop(CONFIG.hitstop.playerHurt);
    Input.rumble(0.55, 160);
  }
  function killBoss() {
    const bx = boss.x;
    const by = boss.y;
    particles.burst(bx, by, CONFIG.perf ? 30 : 64, world.palette.colors, world.rng, 1.7);
    spawnRing(bx, by, 260, world.palette.colors[2], 7);
    spawnRing(bx, by, 180, '#ffffff', 4);
    for (let i = 0; i < 10; i++) orbs.obtain().init(bx + (world.rng() * 2 - 1) * 50, by + (world.rng() * 2 - 1) * 50, Math.ceil(boss.xp / 10) * (1 + world.tier * CONFIG.xp.orbXpDepth));
    world.score += CONFIG.score.bossKill * (world.tier + 1);
    world.bossKills++;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.25); // récompense : soin
    boss = null;
    world.boss = null;
    Render.addShake(0.85);
    addHitstop(CONFIG.hitstop.bossKill); // le temps s'arrête : le boss tombe
    Input.rumble(1, 420);
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
        // LE MIROIR : renvoie une partie des tirs reçus vers le joueur.
        if (boss && boss.mirror > 0 && world.rng() < boss.mirror) {
          const ang = Math.atan2(player.y - boss.y, player.x - boss.x);
          enemyBullets.obtain().init(boss.x, boss.y, Math.cos(ang) * 320, Math.sin(ang) * 320, { damage: boss.bulletDamage * 0.8, radius: 7, life: 2.6, pierce: 0, color: '#8af0ff', hostile: true });
        }
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
    bullets.forEach((b) => b.update(dt, player)); // player : retour des boomerangs
    enemyBullets.forEach((b) => b.update(dt));

    // Dash aspirateur : pendant le dash, le rayon de collecte est triplé.
    const collectR = CONFIG.playerStats.collectRadius * player.mods.collectMul * (player.dashTime > 0 ? 3 : 1);
    orbs.forEach((o) => {
      const got = o.update(dt, player, collectR);
      if (got) gainXp(got);
    });

    // Bombe de couleur (compétence active, touche E).
    if ((player.bombs || 0) > 0 && Input.pressed('KeyE', 'KeyF')) {
      player.bombs--;
      world.bombsUsed++;
      detonateBomb();
    }

    // PRISMA BURST (touche R) quand la jauge est pleine.
    if (colorfield.percent >= 1 && Input.pressed('KeyR')) prismaBurst();
    if (world.overchargeT > 0) world.overchargeT -= dt;

    // Failles du Statique (zones dangereuses télégraphiées).
    {
      const h = CONFIG.hazards;
      const hm = world.time / 60;
      const hdmg = h.dmgBase + h.dmgPerMin * hm;
      for (let i = hazards.length - 1; i >= 0; i--) {
        const z = hazards[i];
        z.t -= dt;
        if (z.state === 'warn') {
          if (z.t <= 0) {
            z.state = 'active';
            z.t = z.activeDur != null ? z.activeDur : h.active;
          }
        } else if (z.state === 'active') {
          const dx = player.x - z.x;
          const dy = player.y - z.y;
          if (dx * dx + dy * dy < z.r * z.r && player.takeDamage(hdmg)) playerHurt();
          if (z.t <= 0) {
            z.state = 'fade';
            z.t = h.fade;
          }
        } else if (z.t <= 0) {
          hazards.splice(i, 1);
        }
      }
      hazardTimer -= dt;
      if (hazardTimer <= 0) {
        spawnHazard();
        hazardTimer = Math.max(h.minInterval, h.baseInterval / (1 + h.intervalTightenPerMin * hm));
      }
      // MÉTÉORES pendant les pics : pluie de petites zones rapides à esquiver.
      if (world.phase === 'peak') {
        meteorTimer -= dt;
        if (meteorTimer <= 0) {
          meteorTimer = 1.7;
          spawnHazard({ r: 75, warn: 0.85, active: 0.4, distMin: 60, distMax: 320 });
          spawnHazard({ r: 75, warn: 0.85, active: 0.4, distMin: 60, distMax: 320 });
        }
      }
    }

    // Objets de map (soin / bombe) : apparition + ramassage.
    bombTimer -= dt;
    if (bombTimer <= 0) {
      bombTimer = CONFIG.bomb.spawnInterval;
      const a = CONFIG.arena;
      const ang = world.rng() * TAU;
      const dist = 220 + world.rng() * 420;
      const mar = a.margin + 40;
      spawnPickup('bomb', clamp(player.x + Math.cos(ang) * dist, mar, a.width - mar), clamp(player.y + Math.sin(ang) * dist, mar, a.height - mar));
    }
    const pcr2 = CONFIG.bomb.collectRadius * CONFIG.bomb.collectRadius;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.t -= dt;
      if (pk.t <= 0) {
        pickups.splice(i, 1);
        continue;
      }
      const dx = player.x - pk.x;
      const dy = player.y - pk.y;
      if (dx * dx + dy * dy < pcr2) {
        if (pk.type === 'heal') {
          player.hp = Math.min(player.maxHp, player.hp + CONFIG.bomb.healAmount);
          Audio.pickup();
        } else {
          player.bombs = Math.min(CONFIG.bomb.max, (player.bombs || 0) + 1);
          Audio.uiSelect();
        }
        pickups.splice(i, 1);
      }
    }

    rebuildGrid();
    separate();
    enemies.forEach((e) => {
      e.update(dt, player);
      if (e.fireReady) {
        e.fireReady = false;
        enemyBullets.obtain().init(e.x, e.y, Math.cos(e.fireAngle) * e.bulletSpeed, Math.sin(e.fireAngle) * e.bulletSpeed, { damage: e.bulletDamage, radius: 6, life: 3, pierce: 0, color: CONFIG.danger, hostile: true });
      }
      // Soigneur : régénère les ennemis autour (impulsion verte).
      if (e.healReady) {
        e.healReady = false;
        let healed = 0;
        grid.queryCircle(e.x, e.y, e.healRadius, (o) => {
          if (o !== e && o.alive && o.hp < o.maxHp) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.healFrac);
            healed++;
          }
        });
        if (healed > 0) spawnRing(e.x, e.y, e.healRadius, '#2bff88', 2.5);
      }
      // Bombardier : explosion (cercle télégraphié écoulé).
      if (e.explodeReady) {
        e.explodeReady = false;
        e.alive = false; // pas de kill -> pas d'orbe (il s'est sacrifié)
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        if (dx * dx + dy * dy < e.blastRadius * e.blastRadius && player.takeDamage(e.blastDamage)) playerHurt();
        particles.burst(e.x, e.y, CONFIG.perf ? 10 : 22, [CONFIG.danger, '#ff8a00', '#ffd000'], world.rng, 1.4);
        spawnRing(e.x, e.y, e.blastRadius, CONFIG.danger, 5);
        Render.addShake(0.25);
        Audio.nova();
      }
    });
    if (boss) {
      boss.update(dt, world);
      if (boss.life <= 0) {
        // Le boss se retire (non tué) -> pas de blocage, pas de récompense.
        boss = null;
        world.boss = null;
      }
    }

    rebuildGrid();
    bulletCollisions();
    weapons.applyContactDamage(damageEnemy, damageBoss);
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
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.life -= dt;
      if (rg.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      rg.r = rg.maxR * (1 - rg.life / rg.maxLife);
    }
    enemies.sweep();
    bullets.sweep();
    enemyBullets.sweep();
    orbs.sweep();

    if (player.dead && !ended) {
      ended = true; // garde : une seule transition (et une seule soumission de score)
      app.gameOver({
        score: world.score,
        kills: world.kills,
        time: world.time,
        playerLevel: world.level,
        biome: world.tier + 1,
        bestCombo: world.bestCombo,
        bossKills: world.bossKills,
        bombsUsed: world.bombsUsed,
      });
    }
  }

  function drawWorld(alpha) {
    const ix = lerp(player.px, player.x, alpha);
    const iy = lerp(player.py, player.y, alpha);
    Render.follow(ix, iy);
    Render.begin();
    colorfield.render(Render);

    // Failles du Statique (sous les entités).
    const hctx = Render.ctx;
    for (const z of hazards) {
      if (z.state === 'warn') {
        hctx.strokeStyle = hexA(CONFIG.danger, 0.45 + 0.35 * Math.sin(world.time * 16));
        hctx.lineWidth = 3;
        hctx.setLineDash([10, 8]);
        hctx.beginPath();
        hctx.arc(z.x, z.y, z.r, 0, TAU);
        hctx.stroke();
        hctx.setLineDash([]);
      } else {
        const za = z.state === 'fade' ? z.t / CONFIG.hazards.fade : 1;
        const g = hctx.createRadialGradient(z.x, z.y, z.r * 0.25, z.x, z.y, z.r);
        g.addColorStop(0, hexA(CONFIG.danger, 0.32 * za));
        g.addColorStop(1, hexA(CONFIG.danger, 0));
        hctx.fillStyle = g;
        hctx.beginPath();
        hctx.arc(z.x, z.y, z.r, 0, TAU);
        hctx.fill();
        hctx.strokeStyle = hexA(CONFIG.danger, 0.6 * za);
        hctx.lineWidth = 2;
        hctx.stroke();
      }
    }

    enemies.forEach((e) => e.render(Render, alpha));
    if (boss) boss.render(Render, alpha);
    Render.additive();
    bullets.forEach((b) => b.render(Render, alpha));
    enemyBullets.forEach((b) => b.render(Render, alpha));
    const pc = world.palette.colors[1];
    orbs.forEach((o) => o.render(Render, pc, alpha));
    for (const pk of pickups) {
      const col = pk.type === 'heal' ? '#2bff88' : '#ffffff';
      const glow = pk.type === 'heal' ? '#2bff88' : world.palette.colors[2];
      Render.drawSprite(Render.glowSprite(col, glow, 9, 2.9), pk.x, pk.y, 0, 1 + 0.18 * Math.sin(world.time * 6));
    }
    Render.normal();
    particles.render(Render);
    // Ondes de choc (style).
    const ctx = Render.ctx;
    Render.additive();
    for (const rg of rings) {
      const a = rg.life / rg.maxLife;
      ctx.strokeStyle = hexA(rg.color, a);
      ctx.lineWidth = rg.w * a + 1;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, TAU);
      ctx.stroke();
    }
    Render.normal();
    weapons.render(Render, ix, iy);
    player.render(Render, alpha);

    // Surcharge Prisma : anneaux arc-en-ciel tournants autour du joueur.
    if (world.overchargeT > 0) {
      Render.additive();
      const oc = world.overchargeT / CONFIG.prismaBurst.overchargeTime;
      const t = world.time * 3;
      const cols = world.palette.colors;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA(cols[i], 0.5 * oc + 0.2);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ix, iy, 26 + i * 9 + Math.sin(t + i * 2.1) * 3, 0, TAU);
        ctx.stroke();
      }
      Render.normal();
    }

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
      player.shape = skin.shape || 'orb';
      weapons.reset();
      weapons.add('eclat');
      enemies.clear();
      bullets.clear();
      enemyBullets.clear();
      orbs.clear();
      particles.clear();
      floaters.clear();
      rings.length = 0;
      hazards.length = 0;
      pickups.length = 0;
      hazardTimer = CONFIG.hazards.firstDelay;
      bombTimer = CONFIG.bomb.spawnInterval;
      meteorTimer = 0;
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
      world.overchargeT = 0;
      world.bossKills = 0;
      world.bombsUsed = 0;
      world.palette = PALETTES[0];
      Render.setBackdrop(buildBackdrop(world.palette, CONFIG.arena.width, CONFIG.arena.height));
      Audio.setBiome(0);
      colorfield.reset(world.palette, CONFIG.colorfield.killsToFull);
      mode = 'play';
      pendingLevels = 0;
      pauseOptions = null;
      ended = false;
      pausedByBlur = false;
      hitstop = 0;
    },

    update(dt) {
      // Stick tactile actif uniquement quand le monde tourne (les overlays
      // récupèrent des taps « purs » pour la navigation).
      Input.touch.stickEnabled = mode === 'play' || mode === 'levelup';
      if (mode === 'paused') {
        if (pauseOptions) {
          pauseOptions.update(dt);
          return;
        }
        if (Input.pressed('KeyP', 'Escape')) mode = 'play';
        else if (Input.pressed('KeyO')) pauseOptions = createOptionsOverlay(() => (pauseOptions = null), () => app.gotoMenu());
        else if (pausedByBlur) {
          // Pause auto : on AVALE le clic qui rend le focus à la fenêtre, sinon
          // la partie repartirait par surprise. Les clics suivants reprennent.
          if (document.hasFocus()) pausedByBlur = false;
        } else if (Input.mouse.clicked) mode = 'play';
        return;
      }
      // Auto-pause à la perte de focus (alt-tab) : évite de mourir pendant que
      // la partie continue en arrière-plan.
      if (mode === 'play') {
        const manual = Input.pressed('KeyP', 'Escape');
        if (manual || !document.hasFocus()) {
          mode = 'paused';
          pausedByBlur = !manual;
          return;
        }
      }
      if (mode === 'upgrade') {
        upgrade.update(dt);
        return;
      }
      // Gel d'impact : le monde s'arrête, mais le timer continue de courir.
      if (hitstop > 0) {
        hitstop -= dt;
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
      Render.bloom(); // après le monde, avant le HUD (sinon le texte bave)

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
