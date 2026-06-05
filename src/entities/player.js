// player.js — le Prisme : déplacement 8 directions normalisé, traînée comète,
// halo cyan pré-rendu. Position précédente conservée pour l'interpolation rendu.

import { CONFIG } from '../config.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { clamp, lerp, hexA, TAU } from '../engine/math.js';

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
    this.dashCd = 0; // cooldown du dash
    this.dashTime = 0; // durée de dash restante
    this.dashVX = 0;
    this.dashVY = 0;
    this.bombs = 0; // bombes de couleur en réserve (touche E)
    this.aimMode = 'auto'; // 'auto' | 'mouse' (option Phase 8)
    this.coreColor = CONFIG.player.coreColor; // surchargé par le skin choisi
    this.glowColor = CONFIG.player.glowColor;

    // Modificateurs cumulés par les upgrades (Phase 4). Multiplicateurs neutres
    // par défaut ; remis à zéro à chaque nouvelle partie.
    this.mods = this._defaultMods();

    this._mv = { x: 0, y: 0 };
    // Ring buffer de la traînée (Float32Array : aucune allocation en boucle).
    this.trail = new Float32Array(TRAIL_LEN * 2);
    this.trailHead = 0;
    this.trailCount = 0;
  }

  _defaultMods() {
    return {
      damageMul: 1,
      rateMul: 1,
      projAdd: 0,
      areaMul: 1,
      moveMul: 1,
      collectMul: 1,
    };
  }

  reset(x, y) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.maxHp = CONFIG.playerStats.maxHp;
    this.hp = this.maxHp;
    this.angle = 0;
    this.inv = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.bombs = 0;
    this.aimMode = 'auto';
    this.mods = this._defaultMods();
    this.trailHead = 0;
    this.trailCount = 0;
  }

  get dead() {
    return this.hp <= 0;
  }

  // Applique des dégâts si non invincible. Renvoie true si le coup a porté.
  takeDamage(dmg) {
    if (!(dmg > 0)) return false; // ignore NaN / 0 / négatif -> jamais d'immortalité par bug
    if (this.inv > 0 || this.hp <= 0) return false;
    this.hp -= dmg;
    this.inv = CONFIG.playerStats.iframes;
    return true;
  }

  update(dt) {
    this.px = this.x;
    this.py = this.y;
    if (this.inv > 0) this.inv -= dt;
    // Régénération passive (parties plus longues).
    if (this.hp > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + CONFIG.playerStats.regen * dt);

    if (this.dashCd > 0) this.dashCd -= dt;
    Input.moveVector(this._mv);
    if (this._mv.x || this._mv.y) this.angle = Math.atan2(this._mv.y, this._mv.x);

    // Dash (Espace) : ruée rapide + i-frames.
    if (this.dashTime <= 0 && this.dashCd <= 0 && Input.pressed('Space', 'ShiftLeft')) {
      let dx = this._mv.x;
      let dy = this._mv.y;
      if (dx === 0 && dy === 0) {
        dx = Math.cos(this.angle);
        dy = Math.sin(this.angle);
      }
      const l = Math.hypot(dx, dy) || 1;
      this.dashVX = (dx / l) * CONFIG.dash.speed;
      this.dashVY = (dy / l) * CONFIG.dash.speed;
      this.dashTime = CONFIG.dash.duration;
      this.dashCd = CONFIG.dash.cooldown;
      this.inv = Math.max(this.inv, CONFIG.dash.iframes);
      Audio.dash();
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.x += this.dashVX * dt;
      this.y += this.dashVY * dt;
    } else {
      const sp = this.speed * this.mods.moveMul;
      this.x += this._mv.x * sp * dt;
      this.y += this._mv.y * sp * dt;
    }

    // Bornage à l'arène.
    const a = CONFIG.arena;
    const m = a.margin + this.radius;
    this.x = clamp(this.x, m, a.width - m);
    this.y = clamp(this.y, m, a.height - m);

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
    const dot = R.softDot(this.glowColor, this.radius * 1.15);
    for (let i = 0; i < this.trailCount; i++) {
      const idx = (this.trailHead - this.trailCount + i + TRAIL_LEN) % TRAIL_LEN;
      const t = (i + 1) / this.trailCount; // 0 (vieux) -> 1 (récent)
      R.drawSprite(dot, this.trail[idx * 2], this.trail[idx * 2 + 1], 0, 0.35 + t * 0.65, t * 0.5);
    }
    // Aura pulsante (style).
    const ctx = R.ctx;
    const ph = performance.now() * 0.004;
    ctx.strokeStyle = hexA(this.glowColor, 0.22 + 0.12 * Math.sin(ph));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ix, iy, this.radius * 2.2 + Math.sin(ph) * 3, 0, TAU);
    ctx.stroke();
    R.normal();

    // Corps : halo + cœur (couleur du skin). Clignote pendant les i-frames.
    const blink = this.inv > 0 && (this.inv * 16) % 2 < 1 ? 0.35 : 1;
    R.drawSprite(R.glowSprite(this.coreColor, this.glowColor, this.radius), ix, iy, 0, 1, blink);
  }
}
