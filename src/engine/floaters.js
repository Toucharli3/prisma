// floaters.js — chiffres de dégâts flottants (poolés, ring buffer plafonné).
// Rendus en espace monde, au-dessus des entités.

export class Floaters {
  constructor(max) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.text = new Array(max).fill('');
    this.color = new Array(max).fill('#fff');
    this.alive = new Uint8Array(max);
    this.head = 0;
  }

  clear() {
    this.alive.fill(0);
    this.head = 0;
  }

  spawn(x, y, text, color, size = 14, life = 0.7) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.x[i] = x + (Math.random() * 2 - 1) * 6;
    this.y[i] = y;
    this.vy[i] = -46;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.text[i] = text;
    this.color[i] = color;
    this.alive[i] = 1;
  }

  update(dt) {
    const damp = Math.pow(0.1, dt);
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        continue;
      }
      this.y[i] += this.vy[i] * dt;
      this.vy[i] *= damp;
    }
  }

  render(R) {
    const ctx = R.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const t = this.life[i] / this.maxLife[i];
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.font = `800 ${this.size[i]}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = this.color[i];
      ctx.fillText(this.text[i], this.x[i], this.y[i]);
    }
    ctx.globalAlpha = 1;
  }
}
