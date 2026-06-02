// boss.js — boss à variantes (hexagone "Le Statique", octogone "Le Vide").
// Garde ses distances en tournant, alterne des patterns de tir. Une instance.

import { CONFIG } from '../config.js';
import { lerp, TAU } from '../engine/math.js';

function fire(b, w, ang, sp) {
  w.enemyBullets.obtain().init(b.x, b.y, Math.cos(ang) * sp, Math.sin(ang) * sp, { damage: b.bulletDamage, radius: 8, life: 3.4, pierce: 0, color: CONFIG.danger });
}

// Patterns indexés (référencés par variant.patterns dans config).
const PATTERNS = [
  (b, w) => {
    const n = 20;
    for (let i = 0; i < n; i++) fire(b, w, (i / n) * TAU, b.bulletSpeed);
  },
  (b, w) => {
    const base = Math.atan2(w.player.y - b.y, w.player.x - b.x);
    for (let i = -3; i <= 3; i++) fire(b, w, base + i * 0.13, b.bulletSpeed * 1.25);
  },
  (b, w) => {
    const base = b.angle * 4;
    for (let i = 0; i < 7; i++) fire(b, w, base + (i / 7) * TAU, b.bulletSpeed * 1.05);
  },
  // 3 — double spirale contrarotative
  (b, w) => {
    const base = b.angle * 5;
    for (let i = 0; i < 6; i++) {
      fire(b, w, base + (i / 6) * TAU, b.bulletSpeed);
      fire(b, w, -base + (i / 6) * TAU, b.bulletSpeed * 0.85);
    }
  },
  // 4 — mur de balles avec une brèche visée sur le joueur
  (b, w) => {
    const base = Math.atan2(w.player.y - b.y, w.player.x - b.x);
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if (Math.abs(((a - base + Math.PI) % TAU) - Math.PI) < 0.5) continue; // brèche
      fire(b, w, a, b.bulletSpeed * 0.9);
    }
  },
];

export class Boss {
  constructor() {
    this.alive = false;
  }

  init(levelIndex, x, y, variantIndex) {
    const b = CONFIG.boss;
    const v = b.variants[variantIndex % b.variants.length];
    this.alive = true;
    this.x = this.px = x;
    this.y = this.py = y;
    this.radius = b.radius;
    this.sides = v.sides;
    this.color = v.color;
    this.name = v.name;
    this.patternList = v.patterns;
    this.maxHp = Math.round(b.baseHp * (1 + levelIndex * b.hpPerLevel));
    this.hp = this.maxHp;
    this.speed = b.speed;
    this.contactDamage = b.contactDamage;
    this.bulletDamage = b.bulletDamage + levelIndex * 1.5;
    this.bulletSpeed = b.bulletSpeed;
    this.patternCd = b.patternCd;
    this.patternTimer = 1.4;
    this.patternStep = 0;
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
    const want = 320;
    let mvx = (-dy / d) * 0.6;
    let mvy = (dx / d) * 0.6;
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
      PATTERNS[this.patternList[this.patternStep % this.patternList.length]](this, world);
      if (world.onBossShoot) world.onBossShoot();
      this.patternTimer = this.patternCd;
      this.patternStep++;
    }
  }

  render(R, alpha) {
    const ix = lerp(this.px, this.x, alpha);
    const iy = lerp(this.py, this.y, alpha);
    R.drawSprite(R.polySprite(this.sides, this.radius, '#2a2030', this.color, this.color, this.color, 1.5), ix, iy, this.angle);
    if (this.hitFlash > 0) {
      R.drawSprite(R.polySprite(this.sides, this.radius, '#ffffff', '#ffffff', '#ffffff', '#ffffff', 1.2), ix, iy, this.angle, 1, Math.min(1, this.hitFlash / 0.08));
    }
  }
}
