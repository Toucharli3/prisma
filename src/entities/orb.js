// orb.js — orbe de couleur (XP) lâché à la mort d'un ennemi. Poolé. Petit
// « pop » initial, puis aimanté vers le joueur dès qu'il entre dans le rayon de
// collecte. update() renvoie la valeur d'XP si ramassé (0 sinon).

import { CONFIG } from '../config.js';
import { lerp, TAU } from '../engine/math.js';

const HOMING_ACCEL = 300; // dérive vers le joueur (XP fiable -> choix réguliers)
const MAX_DRIFT = 130; // plafond de la vitesse de dérive (hors aimant fort)

export class Orb {
  constructor() {
    this.alive = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.value = 1;
    this.life = 0;
  }

  init(x, y, value) {
    this.alive = true;
    this.x = this.px = x;
    this.y = this.py = y;
    this.value = value;
    this.life = CONFIG.orb.lifetime;
    const a = Math.random() * TAU;
    const s = 50 + Math.random() * 70;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
  }

  update(dt, player, collectR) {
    this.px = this.x;
    this.py = this.y;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return 0;
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;

    if (d < collectR) {
      // Aimant fort : fonce vers le joueur, plus vite en s'approchant.
      const speed = CONFIG.orb.magnetSpeed * (1 - (d / collectR) * 0.3);
      this.vx = (dx / d) * speed;
      this.vy = (dy / d) * speed;
    } else {
      // Hors aimant : le « pop » initial s'amortit puis une dérive douce
      // ramène l'orbe vers le joueur (évite les orbes inaccessibles).
      const damp = Math.pow(0.05, dt);
      this.vx = this.vx * damp + (dx / d) * HOMING_ACCEL * dt;
      this.vy = this.vy * damp + (dy / d) * HOMING_ACCEL * dt;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > MAX_DRIFT) {
        const k = MAX_DRIFT / sp;
        this.vx *= k;
        this.vy *= k;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (d < player.radius + 10) {
      this.alive = false;
      return this.value;
    }
    return 0;
  }

  render(R, color, alpha) {
    const ix = lerp(this.px, this.x, alpha);
    const iy = lerp(this.py, this.y, alpha);
    // Clignote en fin de vie.
    const a = this.life < 2.5 ? (Math.sin(this.life * 18) > -0.3 ? 1 : 0.35) : 1;
    R.drawSprite(R.glowSprite('#ffffff', color, CONFIG.orb.radius, 2.4), ix, iy, 0, 1, a);
  }
}
