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
    this.orbitalCd = 0; // cooldown de dégâts par contact orbital
    this.type = '';
    this.sides = 3;
    this.radius = 12;
    this.hp = 1;
    this.maxHp = 1;
    this.speed = 100;
    this.damage = 5;
    this.xp = 1;
    // Tireur (pentagone) :
    this.behavior = 'chase';
    this.preferredRange = 0;
    this.shootCooldown = 0;
    this.shootTimer = 0;
    this.fireReady = false; // la scène lit ce flag pour générer un projectile ennemi
    this.fireAngle = 0;
    this.bulletSpeed = 0;
    this.bulletDamage = 0;
    // Fonceur (dasher) :
    this.dashSpeed = 0;
    this.dashRange = 0;
    this.dashCd = 0;
    this.dashDuration = 0;
    this.dashTimer = 0;
    this.dashing = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;
    // Diviseur (splitter) :
    this.splitInto = 0;
    this.splitType = null;
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
    this.behavior = def.behavior || 'chase';
    this.preferredRange = def.preferredRange || 0;
    this.shootCooldown = def.shootCooldown || 0;
    this.shootTimer = (def.shootCooldown || 0) * (0.4 + Math.random() * 0.6);
    this.fireReady = false;
    this.bulletSpeed = def.bulletSpeed || 0;
    this.bulletDamage = def.bulletDamage || 0;
    this.dashSpeed = def.dashSpeed || 0;
    this.dashRange = def.dashRange || 0;
    this.dashCd = def.dashCd || 0;
    this.dashDuration = def.dashDuration || 0;
    this.dashTimer = (def.dashCd || 0) * (0.3 + Math.random() * 0.7);
    this.dashing = 0;
    this.splitInto = def.splitInto || 0;
    this.splitType = def.splitType || null;
    this.x = this.px = x;
    this.y = this.py = y;
    this.sepx = 0;
    this.sepy = 0;
    this.hitFlash = 0;
    this.lastBulletId = -1;
    this.orbitalCd = 0;
    this.angle = Math.random() * TAU;
    this.rotSpeed = (Math.random() * 2 - 1) * 0.7;
  }

  update(dt, target) {
    this.px = this.x;
    this.py = this.y;

    const tx = target.x - this.x;
    const ty = target.y - this.y;
    const d = Math.hypot(tx, ty) || 1;
    let dirx = tx / d;
    let diry = ty / d;

    let spd = this.speed;

    if (this.behavior === 'shooter') {
      // Garde ses distances : recule si trop près, tient sa position sinon.
      if (d < this.preferredRange * 0.85) {
        dirx = -dirx;
        diry = -diry;
      } else if (d < this.preferredRange * 1.15) {
        dirx = 0;
        diry = 0;
      }
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && d < this.preferredRange * 1.4) {
        this.fireReady = true;
        this.fireAngle = Math.atan2(ty, tx);
        this.shootTimer = this.shootCooldown;
      }
    } else if (this.behavior === 'dasher') {
      if (this.dashing > 0) {
        // En pleine charge : direction verrouillée, vitesse élevée, pas de séparation.
        this.dashing -= dt;
        dirx = this.dashDirX;
        diry = this.dashDirY;
        spd = this.dashSpeed;
        this.sepx = 0;
        this.sepy = 0;
      } else {
        this.dashTimer -= dt;
        if (this.dashTimer <= 0 && d < this.dashRange) {
          this.dashing = this.dashDuration;
          this.dashTimer = this.dashCd;
          this.dashDirX = dirx;
          this.dashDirY = diry;
        }
      }
    }

    let vx = dirx + this.sepx;
    let vy = diry + this.sepy;
    const vl = Math.hypot(vx, vy) || 1;
    this.x += (vx / vl) * spd * dt;
    this.y += (vy / vl) * spd * dt;

    this.angle += this.rotSpeed * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.orbitalCd > 0) this.orbitalCd -= dt;

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
