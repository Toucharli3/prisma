// player.js — le Prisme : déplacement 8 directions normalisé, traînée comète,
// halo cyan pré-rendu. Position précédente conservée pour l'interpolation rendu.

import { CONFIG } from '../config.js';
import { Input } from '../engine/input.js';
import { clamp, lerp } from '../engine/math.js';

const TRAIL_LEN = 16;

export class Player {
  constructor() {
    const s = CONFIG.playerStats;
    this.x = 0;
    this.y = 0;
    this.px = 0; // position précédente (interpolation)
    this.py = 0;
    this.radius = s.radius;
    this.speed = s.speed;
    this.maxHp = s.maxHp;
    this.hp = s.maxHp;
    this.angle = 0;
    this.inv = 0; // timer d'invincibilité (i-frames)

    this._mv = { x: 0, y: 0 };
    // Ring buffer de la traînée (Float32Array : aucune allocation en boucle).
    this.trail = new Float32Array(TRAIL_LEN * 2);
    this.trailHead = 0;
    this.trailCount = 0;
  }

  reset(x, y) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.hp = this.maxHp;
    this.angle = 0;
    this.inv = 0;
    this.trailHead = 0;
    this.trailCount = 0;
  }

  get dead() {
    return this.hp <= 0;
  }

  // Applique des dégâts si non invincible. Renvoie true si le coup a porté.
  takeDamage(dmg) {
    if (this.inv > 0 || this.hp <= 0) return false;
    this.hp -= dmg;
    this.inv = CONFIG.playerStats.iframes;
    return true;
  }

  update(dt) {
    this.px = this.x;
    this.py = this.y;
    if (this.inv > 0) this.inv -= dt;

    Input.moveVector(this._mv);
    this.x += this._mv.x * this.speed * dt;
    this.y += this._mv.y * this.speed * dt;

    // Bornage à l'arène.
    const a = CONFIG.arena;
    const m = a.margin + this.radius;
    this.x = clamp(this.x, m, a.width - m);
    this.y = clamp(this.y, m, a.height - m);

    if (this._mv.x || this._mv.y) this.angle = Math.atan2(this._mv.y, this._mv.x);

    // Enregistre le point de traînée courant.
    this.trail[this.trailHead * 2] = this.x;
    this.trail[this.trailHead * 2 + 1] = this.y;
    this.trailHead = (this.trailHead + 1) % TRAIL_LEN;
    if (this.trailCount < TRAIL_LEN) this.trailCount++;
  }

  render(R, alpha) {
    const ix = lerp(this.px, this.x, alpha);
    const iy = lerp(this.py, this.y, alpha);

    // Traînée comète (blending additif, du plus ancien au plus récent).
    R.additive();
    const dot = R.softDot(CONFIG.player.glowColor, this.radius * 1.15);
    for (let i = 0; i < this.trailCount; i++) {
      const idx = (this.trailHead - this.trailCount + i + TRAIL_LEN) % TRAIL_LEN;
      const t = (i + 1) / this.trailCount; // 0 (vieux) -> 1 (récent)
      R.drawSprite(dot, this.trail[idx * 2], this.trail[idx * 2 + 1], 0, 0.35 + t * 0.65, t * 0.5);
    }
    R.normal();

    // Corps : halo cyan + cœur blanc. Clignote pendant les i-frames.
    const blink = this.inv > 0 && (this.inv * 16) % 2 < 1 ? 0.35 : 1;
    R.drawSprite(R.glowSprite(CONFIG.player.coreColor, CONFIG.player.glowColor, this.radius), ix, iy, 0, 1, blink);
  }
}
