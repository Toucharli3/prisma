// grid.js — grille spatiale (spatial hash) à cellules uniformes pour des
// requêtes de proximité en O(voisins) plutôt qu'en O(n²). Reconstruite chaque
// frame à partir des objets vivants.

import { clamp } from './math.js';

export class SpatialGrid {
  constructor(width, height, cell) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.buckets = [];
    const n = this.cols * this.rows;
    for (let i = 0; i < n; i++) this.buckets.push([]);
  }

  clear() {
    const b = this.buckets;
    for (let i = 0; i < b.length; i++) b[i].length = 0;
  }

  insert(obj) {
    const cx = clamp((obj.x / this.cell) | 0, 0, this.cols - 1);
    const cy = clamp((obj.y / this.cell) | 0, 0, this.rows - 1);
    this.buckets[cy * this.cols + cx].push(obj);
  }

  // Appelle fn(obj) pour chaque objet dans les cellules couvrant le disque
  // (x,y,r). Peut inclure quelques objets légèrement hors rayon : l'appelant
  // affine avec un test de distance précis.
  queryCircle(x, y, r, fn) {
    const c = this.cell;
    const x0 = clamp(((x - r) / c) | 0, 0, this.cols - 1);
    const x1 = clamp(((x + r) / c) | 0, 0, this.cols - 1);
    const y0 = clamp(((y - r) / c) | 0, 0, this.rows - 1);
    const y1 = clamp(((y + r) / c) | 0, 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[row + cx];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}
