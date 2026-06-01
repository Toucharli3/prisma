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
    this.damage = o.damage;
    this.radius = o.radius;
    this.pierce = o.pierce;
    this.color = o.color;
    this.id = BULLET_ID++;
  }

  update(dt) {
    this.px = this.x;
    this.py = this.y;
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
    R.drawSprite(
      R.glowSprite('#ffffff', this.color, this.radius, 2.4),
      lerp(this.px, this.x, alpha),
      lerp(this.py, this.y, alpha)
    );
  }
}
