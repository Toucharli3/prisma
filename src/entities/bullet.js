// bullet.js — projectile poolé. Un identifiant unique par tir permet aux
// projectiles perforants (pierce) de ne toucher chaque ennemi qu'une fois,
// sans allocation (l'ennemi mémorise `lastBulletId`).

import { CONFIG } from '../config.js';
import { lerp } from '../engine/math.js';

let BULLET_ID = 1;

export class Bullet {
  constructor() {
    this.alive = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.damage = 0;
    this.radius = 4;
    this.pierce = 0;
    this.color = '#ffffff';
    this.id = 0;
  }

  init(x, y, vx, vy, o) {
    this.alive = true;
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.life = o.life;
    this.maxLife = o.life;
    this.damage = o.damage;
    this.radius = o.radius;
    this.pierce = o.pierce;
    this.color = o.color;
    this.boomerang = !!o.boomerang;
    this.id = BULLET_ID++;
  }

  update(dt, player) {
    this.px = this.x;
    this.py = this.y;

    // Boomerang (Scie) : seconde moitié de vie = retour vers le joueur.
    if (this.boomerang && player && this.life < this.maxLife * 0.55) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.hypot(this.vx, this.vy) || 300;
      this.vx = (dx / d) * sp;
      this.vy = (dy / d) * sp;
      if (d < player.radius + this.radius) {
        this.alive = false; // rattrapée
        return;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }
    const a = CONFIG.arena;
    if (this.x < -30 || this.y < -30 || this.x > a.width + 30 || this.y > a.height + 30) {
      this.alive = false;
    }
  }

  render(R, alpha) {
    const ix = lerp(this.px, this.x, alpha);
    const iy = lerp(this.py, this.y, alpha);
    const spr = R.glowSprite('#ffffff', this.color, this.radius, 2.4);
    const ctx = R.ctx;
    // Étiré dans le sens du déplacement -> trait lumineux (bolt).
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.scale(1.9, 0.72);
    ctx.drawImage(spr.canvas, -spr.half, -spr.half);
    ctx.restore();
  }
}
