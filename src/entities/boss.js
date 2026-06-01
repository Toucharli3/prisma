// boss.js — l'Hexagone : gros PV, garde ses distances en tournant autour du
// joueur, alterne 3 patterns de tir (radial / visé en éventail / spirale).
// Une seule instance à la fois ; les collisions sont gérées par la scène.

import { CONFIG } from '../config.js';
import { lerp, TAU } from '../engine/math.js';

export class Boss {
  constructor() {
    this.alive = false;
  }

  init(levelIndex, x, y) {
    const b = CONFIG.boss;
    this.alive = true;
    this.x = this.px = x;
    this.y = this.py = y;
    this.radius = b.radius;
    this.sides = b.sides;
    this.maxHp = Math.round(b.baseHp * (1 + levelIndex * b.hpPerLevel));
    this.hp = this.maxHp;
    this.speed = b.speed;
    this.contactDamage = b.contactDamage;
    this.bulletDamage = b.bulletDamage + levelIndex * 1.5;
    this.bulletSpeed = b.bulletSpeed;
    this.patternCd = b.patternCd;
    this.patternTimer = 1.4;
    this.patternIndex = 0;
    this.angle = 0;
    this.rotSpeed = b.rotSpeed;
    this.hitFlash = 0;
    this.orbitalCd = 0;
    this.lastBulletId = -1;
    this.xp = b.xp;
  }

  update(dt, world) {
    this.px = this.x;
    this.py = this.y;
    const p = world.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;

    // Maintient une distance ~320 et tourne autour du joueur (strafe).
    const want = 320;
    let mvx = -dy / d * 0.6; // composante perpendiculaire
    let mvy = dx / d * 0.6;
    if (d > want + 40) {
      mvx += dx / d;
      mvy += dy / d;
    } else if (d < want - 40) {
      mvx -= dx / d;
      mvy -= dy / d;
    }
    const ml = Math.hypot(mvx, mvy) || 1;
    this.x += (mvx / ml) * this.speed * dt;
    this.y += (mvy / ml) * this.speed * dt;

    const a = CONFIG.arena;
    const m = a.margin + this.radius;
    this.x = Math.max(m, Math.min(a.width - m, this.x));
    this.y = Math.max(m, Math.min(a.height - m, this.y));

    this.angle += this.rotSpeed * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.orbitalCd > 0) this.orbitalCd -= dt;

    this.patternTimer -= dt;
    if (this.patternTimer <= 0) {
      this.firePattern(world);
      this.patternTimer = this.patternCd;
      this.patternIndex = (this.patternIndex + 1) % 3;
    }
  }

  firePattern(world) {
    const p = world.player;
    const eb = world.enemyBullets;
    const fire = (ang, sp) =>
      eb.obtain().init(this.x, this.y, Math.cos(ang) * sp, Math.sin(ang) * sp, {
        damage: this.bulletDamage,
        radius: 8,
        life: 3.4,
        pierce: 0,
        color: CONFIG.danger,
      });

    if (this.patternIndex === 0) {
      // Salve radiale.
      const n = 20;
      for (let i = 0; i < n; i++) fire((i / n) * TAU, this.bulletSpeed);
    } else if (this.patternIndex === 1) {
      // Éventail visé sur le joueur.
      const base = Math.atan2(p.y - this.y, p.x - this.x);
      for (let i = -3; i <= 3; i++) fire(base + i * 0.13, this.bulletSpeed * 1.25);
    } else {
      // Spirale.
      const base = this.angle * 4;
      for (let i = 0; i < 7; i++) fire(base + (i / 7) * TAU, this.bulletSpeed * 1.05);
    }
    if (world.onBossShoot) world.onBossShoot();
  }

  render(R, alpha) {
    const ix = lerp(this.px, this.x, alpha);
    const iy = lerp(this.py, this.y, alpha);
    R.drawSprite(R.polySprite(this.sides, this.radius, '#3a2740', '#5a2238', CONFIG.danger, CONFIG.danger, 1.5), ix, iy, this.angle);
    if (this.hitFlash > 0) {
      R.drawSprite(R.polySprite(this.sides, this.radius, '#ffffff', '#ffffff', '#ffffff', '#ffffff', 1.2), ix, iy, this.angle, 1, Math.min(1, this.hitFlash / 0.08));
    }
  }
}
