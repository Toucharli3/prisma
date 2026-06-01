// particles.js — système de particules poolé en « Structure of Arrays » (typed
// arrays) pour la performance. Ring buffer plafonné : les plus anciennes sont
// recyclées automatiquement. Rendu additif via sprites softDot mis en cache.

import { TAU } from './math.js';

export class Particles {
  constructor(max) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alive = new Uint8Array(max);
    this.colorId = new Int16Array(max);
    this.colors = [];
    this._colorMap = new Map();
    this.head = 0;
    this.live = 0;
  }

  _cid(c) {
    let id = this._colorMap.get(c);
    if (id === undefined) {
      id = this.colors.length;
      this.colors.push(c);
      this._colorMap.set(c, id);
    }
    return id;
  }

  clear() {
    this.alive.fill(0);
    this.live = 0;
    this.head = 0;
  }

  emit(x, y, vx, vy, life, size, color) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    if (!this.alive[i]) this.live++; // sinon : recyclage d'une particule vivante
    this.alive[i] = 1;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.colorId[i] = this._cid(color);
  }

  // Éclaboussure radiale (mort d'ennemi, impacts...).
  burst(x, y, count, colors, rng, power = 1) {
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU;
      const sp = (50 + rng() * 230) * power;
      const col = colors[(rng() * colors.length) | 0];
      this.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + rng() * 0.5, 3 + rng() * 3, col);
    }
  }

  update(dt) {
    const drag = Math.pow(0.14, dt); // amortissement (indépendant du framerate)
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const l = this.life[i] - dt;
      if (l <= 0) {
        this.alive[i] = 0;
        this.live--;
        continue;
      }
      this.life[i] = l;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.vx[i] *= drag;
      this.vy[i] *= drag;
    }
  }

  render(R) {
    R.additive();
    const cols = this.colors;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const t = this.life[i] / this.maxLife[i]; // 1 -> 0
      const s = this.size[i] * (0.4 + 0.6 * t);
      R.drawSprite(R.softDot(cols[this.colorId[i]], Math.max(2, Math.round(s))), this.x[i], this.y[i], 0, 1, t);
    }
    R.normal();
  }
}
