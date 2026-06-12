// enemy.js — ennemis « vidés » (formes géométriques grises) qui poursuivent le
// joueur. Poolés (engine/pool.js) : init() recycle l'objet sans allocation.
// La séparation (anti-empilement) est calculée par la scène via la grille
// spatiale et appliquée ici via sepx/sepy.

import { CONFIG } from '../config.js';
import { lerp, TAU, hexA } from '../engine/math.js';

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
    // Élite :
    this.elite = null; // clé d'affixe ('swift' | 'colossus' | 'volatile') ou null
    this.eliteAura = '#ffffff';
    this.deathBullets = 0;
    this.deathBulletSpeed = 0;
    // Sniper :
    this.aiming = 0;
    this.aimTime = 0;
    // Soigneur :
    this.healRadius = 0;
    this.healFrac = 0;
    this.healCd = 0;
    this.healTimer = 0;
    this.healReady = false;
    // Bombardier :
    this.fuseRange = 0;
    this.fuseTime = 0;
    this.fusing = -1; // -1 = pas amorcé
    this.blastRadius = 0;
    this.blastDamage = 0;
    this.explodeReady = false;
  }

  init(def, x, y, hpScale = 1, speedScale = 1, damageScale = 1) {
    this.alive = true;
    this.type = def.key;
    this.sides = def.sides;
    this.radius = def.radius;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale;
    this.damage = def.damage * damageScale;
    this.xp = def.xp;
    this.behavior = def.behavior || 'chase';
    this.preferredRange = def.preferredRange || 0;
    this.shootCooldown = def.shootCooldown || 0;
    this.shootTimer = (def.shootCooldown || 0) * (0.4 + Math.random() * 0.6);
    this.fireReady = false;
    this.bulletSpeed = def.bulletSpeed || 0;
    this.bulletDamage = (def.bulletDamage || 0) * damageScale;
    this.dashSpeed = def.dashSpeed || 0;
    this.dashRange = def.dashRange || 0;
    this.dashCd = def.dashCd || 0;
    this.dashDuration = def.dashDuration || 0;
    this.dashTimer = (def.dashCd || 0) * (0.3 + Math.random() * 0.7);
    this.dashing = 0;
    this.splitInto = def.splitInto || 0;
    this.splitType = def.splitType || null;
    this.elite = null;
    this.deathBullets = 0;
    this.aiming = 0;
    this.aimTime = def.aimTime || 0;
    this.healRadius = def.healRadius || 0;
    this.healFrac = def.healFrac || 0;
    this.healCd = def.healCd || 0;
    this.healTimer = (def.healCd || 0) * (0.5 + Math.random() * 0.5);
    this.healReady = false;
    this.fuseRange = def.fuseRange || 0;
    this.fuseTime = def.fuseTime || 0;
    this.fusing = -1;
    this.blastRadius = def.blastRadius || 0;
    this.blastDamage = (def.blastDamage || 0) * damageScale;
    this.explodeReady = false;
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

  // Promeut l'ennemi en ÉLITE (affixe de config.elites.affixes).
  makeElite(key, affix) {
    this.elite = key;
    this.eliteAura = affix.aura;
    if (affix.radius) this.radius *= affix.radius;
    if (affix.hp) {
      this.maxHp *= affix.hp;
      this.hp = this.maxHp;
    }
    if (affix.speed) this.speed *= affix.speed;
    if (affix.damage) this.damage *= affix.damage;
    if (affix.xp) this.xp *= affix.xp;
    this.deathBullets = affix.deathBullets || 0;
    this.deathBulletSpeed = affix.deathBulletSpeed || 0;
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
    } else if (this.behavior === 'sniper') {
      // Garde une grande distance ; vise (laser télégraphié) puis tire vite.
      if (d < this.preferredRange * 0.85) {
        dirx = -dirx;
        diry = -diry;
      } else if (d < this.preferredRange * 1.2) {
        dirx = 0;
        diry = 0;
      }
      if (this.aiming > 0) {
        this.aiming -= dt;
        this.fireAngle = Math.atan2(ty, tx); // suit la cible pendant la visée
        dirx = 0;
        diry = 0; // immobile pendant la visée
        if (this.aiming <= 0) {
          this.fireReady = true;
          this.shootTimer = this.shootCooldown;
        }
      } else {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0 && d < this.preferredRange * 1.5) this.aiming = this.aimTime;
      }
    } else if (this.behavior === 'healer') {
      // Fuit le joueur et soigne les ennemis autour (la scène applique).
      if (d < this.preferredRange) {
        dirx = -dirx;
        diry = -diry;
      } else {
        dirx *= 0.3;
        diry *= 0.3;
      }
      this.healTimer -= dt;
      if (this.healTimer <= 0) {
        this.healReady = true;
        this.healTimer = this.healCd;
      }
    } else if (this.behavior === 'bomber') {
      if (this.fusing >= 0) {
        // Amorcé : immobile, compte à rebours puis explosion (gérée par la scène).
        this.fusing -= dt;
        dirx = 0;
        diry = 0;
        this.sepx = 0;
        this.sepy = 0;
        if (this.fusing <= 0) this.explodeReady = true;
      } else if (d < this.fuseRange) {
        this.fusing = this.fuseTime;
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
    const ctx = R.ctx;
    // Sniper : laser de visée télégraphié (s'intensifie à l'approche du tir).
    if (this.aiming > 0) {
      const a = 1 - this.aiming / this.aimTime;
      ctx.strokeStyle = hexA(CONFIG.danger, 0.25 + a * 0.6);
      ctx.lineWidth = 1 + a * 2;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ix + Math.cos(this.fireAngle) * 700, iy + Math.sin(this.fireAngle) * 700);
      ctx.stroke();
    }
    // Bombardier amorcé : cercle d'explosion télégraphié + clignotement.
    if (this.fusing >= 0) {
      const f = 1 - this.fusing / this.fuseTime;
      ctx.strokeStyle = hexA(CONFIG.danger, 0.4 + 0.5 * Math.sin(f * 30));
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(ix, iy, this.blastRadius, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Soigneur : halo vert permanent (cible prioritaire identifiable).
    if (this.behavior === 'healer') {
      R.additive();
      R.drawSprite(R.softDot('#2bff88', Math.round(this.radius * 1.7)), ix, iy, 0, 1, 0.55);
      R.normal();
    }
    // Aura d'élite (sous la forme), pulsante.
    if (this.elite) {
      R.additive();
      const pulse = 1 + 0.15 * Math.sin(performance.now() * 0.008);
      R.drawSprite(R.softDot(this.eliteAura, Math.round(this.radius * 1.9)), ix, iy, 0, pulse, 0.65);
      R.normal();
    }
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
