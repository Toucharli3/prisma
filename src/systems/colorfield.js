// colorfield.js — LE mécanisme signature : restauration de la couleur.
// Le % de couleur (objectif du niveau) monte à chaque kill. Visuellement, chaque
// kill « éclabousse » la palette du biome dans un petit champ basse résolution
// (ImageData), upscalé avec lissage -> taches de couleur douces. Une teinte
// ambiante globale proportionnelle au % fait « revivre » toute l'arène.

import { CONFIG } from '../config.js';
import { hexToRgb, rgbCss } from '../engine/math.js';

export class ColorField {
  constructor(arenaW, arenaH) {
    const cf = CONFIG.colorfield;
    this.cols = cf.cols;
    this.rows = cf.rows;
    this.radius = cf.splashRadius;
    this.cellW = arenaW / this.cols;
    this.cellH = arenaH / this.rows;
    this.arenaW = arenaW;
    this.arenaH = arenaH;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(this.cols, this.rows);
    this.data = this.img.data;

    this.paletteRgb = [];
    this.primary = { r: 255, g: 255, b: 255 };
    this.percent = 0; // objectif du niveau (piloté par les kills)
    this.perKill = 0;
    this._dirty = true;
  }

  reset(palette, killsToFull) {
    this.paletteRgb = palette.colors.map(hexToRgb);
    this.primary = hexToRgb(palette.colors[1]);
    this.data.fill(0);
    this.percent = 0;
    this.perKill = 1 / Math.max(1, killsToFull);
    this._dirty = true;
  }

  get complete() {
    return this.percent >= 1;
  }

  // À appeler à chaque mort d'ennemi.
  onKill(x, y, rng) {
    this.percent = Math.min(1, this.percent + this.perKill);
    this.splash(x, y, rng);
  }

  // Peint un disque de couleur dans le champ basse résolution.
  splash(x, y, rng) {
    const ccx = x / this.cellW;
    const ccy = y / this.cellH;
    const rad = this.radius;
    const col = this.paletteRgb[(rng() * this.paletteRgb.length) | 0];
    const minx = Math.max(0, Math.floor(ccx - rad));
    const maxx = Math.min(this.cols - 1, Math.ceil(ccx + rad));
    const miny = Math.max(0, Math.floor(ccy - rad));
    const maxy = Math.min(this.rows - 1, Math.ceil(ccy + rad));
    for (let gy = miny; gy <= maxy; gy++) {
      for (let gx = minx; gx <= maxx; gx++) {
        const dx = gx + 0.5 - ccx;
        const dy = gy + 0.5 - ccy;
        const dist = Math.hypot(dx, dy);
        if (dist > rad) continue;
        const f = 1 - dist / rad; // falloff 0..1
        const idx = (gy * this.cols + gx) * 4;
        const oldA = this.data[idx + 3];
        const newA = Math.min(255, oldA + f * 175);
        const w = Math.min(1, f * 0.85); // poids du mélange de couleur
        this.data[idx] += (col.r - this.data[idx]) * w;
        this.data[idx + 1] += (col.g - this.data[idx + 1]) * w;
        this.data[idx + 2] += (col.b - this.data[idx + 2]) * w;
        this.data[idx + 3] = newA;
      }
    }
    this._dirty = true;
  }

  // Couche de couleur (en espace monde, sous les entités).
  render(R) {
    if (this._dirty) {
      this.ctx.putImageData(this.img, 0, 0);
      this._dirty = false;
    }
    const ctx = R.ctx;
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;

    // Taches peintes, upscalées et lissées -> dégradés doux.
    ctx.globalAlpha = 0.8;
    ctx.drawImage(this.canvas, 0, 0, this.cols, this.rows, 0, 0, this.arenaW, this.arenaH);
    ctx.globalAlpha = 1;

    // Teinte ambiante globale proportionnelle au % (le monde « revit »).
    const amb = this.percent * CONFIG.colorfield.ambientMax;
    if (amb > 0.005) {
      ctx.fillStyle = rgbCss(this.primary.r, this.primary.g, this.primary.b, amb);
      ctx.fillRect(0, 0, this.arenaW, this.arenaH);
    }

    ctx.imageSmoothingEnabled = prevSmooth;
  }
}
