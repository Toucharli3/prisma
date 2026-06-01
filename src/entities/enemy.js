// enemy.js — ennemis « vidés » (formes géométriques grises) qui poursuivent le
// joueur. Poolés (engine/pool.js) : init() recycle l'objet sans allocation.
// La séparation (anti-empilement) est calculée par la scène via la grille
// spatiale et appliquée ici via sepx/sepy.

import { CONFIG } from '../config.js';
import { lerp, TAU } from '../engine/math.js';

export class Enemy {
  constructor() {
    this.alive = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.sepx = 0; // poussée de séparation (remplie par la scène)
    this.sepy = 0;
    this.angle = 0;
    this.rotSpeed = 0;
    this.hitFlash = 0; // éclair blanc bref quand touché
    this.lastBulletId = -1; // anti double-hit des projectiles perforants
    this.type = '';
    this.sides = 3;
    this.radius = 12;
    this.hp = 1;
    this.maxHp = 1;
    this.speed = 100;
    this.damage = 5;
    this.xp = 1;
  }

  init(def, x, y, hpScale = 1, speedScale = 1) {
    this.alive = true;
    this.type = def.key;
    this.sides = def.sides;
    this.radius = def.radius;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale;
    this.damage = def.damage;
    this.xp = def.xp;
    this.x = this.px = x;
    this.y = this.py = y;
    this.sepx = 0;
    this.sepy = 0;
    this.hitFlash = 0;
    this.lastBulletId = -1;
    this.angle = Math.random() * TAU;
    this.rotSpeed = (Math.random() * 2 - 1) * 0.7;
  }

  update(dt, target) {
    this.px = this.x;
    this.py = this.y;

    // Direction de poursuite + séparation (déjà pondérée par la scène).
    let vx = target.x - this.x;
    let vy = target.y - this.y;
    const d = Math.hypot(vx, vy) || 1;
    vx = vx / d + this.sepx;
    vy = vy / d + this.sepy;
    const vl = Math.hypot(vx, vy) || 1;
    this.x += (vx / vl) * this.speed * dt;
    this.y += (vy / vl) * this.speed * dt;

    this.angle += this.rotSpeed * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Réinitialise la séparation pour la frame suivante.
    this.sepx = 0;
    this.sepy = 0;
  }

  render(R, alpha) {
    const ix = lerp(this.px, this.x, alpha);
    const iy = lerp(this.py, this.y, alpha);
    const spr = R.polySprite(
      this.sides,
      this.radius,
      CONFIG.enemyGrayA,
      CONFIG.enemyGrayB,
      CONFIG.textPrimary,
      CONFIG.enemyGrayA,
      1.7
    );
    R.drawSprite(spr, ix, iy, this.angle);

    if (this.hitFlash > 0) {
      const f = R.polySprite(this.sides, this.radius, '#ffffff', '#ffffff', '#ffffff', '#ffffff', 1.2);
      R.drawSprite(f, ix, iy, this.angle, 1, Math.min(1, this.hitFlash / 0.08));
    }
  }
}
