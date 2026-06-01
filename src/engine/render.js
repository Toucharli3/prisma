// render.js — caméra, gestion du canvas (DPR plafonné), grille de fond
// pré-rendue et helpers de dessin. Le cache de glow (offscreen) est ajouté
// en Phase 1. Tout passe par ce module pour garder le rendu cohérent.

import { CONFIG } from '../config.js';
import { clamp, TAU, HALF_PI, hexToRgb, rgbCss } from './math.js';

export const Render = {
  canvas: null,
  ctx: null,
  dpr: 1,
  viewW: 0, // largeur logique (CSS px)
  viewH: 0,
  camera: { x: 0, y: 0, shakeX: 0, shakeY: 0 },

  _tx: 0, // translation monde->écran courante (CSS px)
  _ty: 0,
  _gridTile: null,
  _gridPattern: null,
  _spriteCache: new Map(), // halos pré-rendus (clé -> {canvas,size,half})

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d', { alpha: false, desynchronized: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._buildGrid();
    // Caméra centrée sur l'arène par défaut.
    this.camera.x = CONFIG.arena.width / 2;
    this.camera.y = CONFIG.arena.height / 2;
    return this;
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(this.viewW * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.viewH * this.dpr));
    this.canvas.style.width = this.viewW + 'px';
    this.canvas.style.height = this.viewH + 'px';
    // Le pattern doit être recréé après changement de contexte/taille.
    if (this._gridTile) this._gridPattern = this.ctx.createPattern(this._gridTile, 'repeat');
  },

  // Pré-rend une tuile de grille une seule fois (calque statique).
  _buildGrid() {
    const s = CONFIG.gridSize;
    const tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const t = tile.getContext('2d');
    t.strokeStyle = CONFIG.gridColor;
    t.lineWidth = 1;
    t.beginPath();
    t.moveTo(0.5, 0);
    t.lineTo(0.5, s);
    t.moveTo(0, 0.5);
    t.lineTo(s, 0.5);
    t.stroke();
    this._gridTile = tile;
    this._gridPattern = this.ctx.createPattern(tile, 'repeat');
  },

  // Place la caméra sur une cible en la bornant à l'arène.
  follow(x, y) {
    const a = CONFIG.arena;
    const halfW = this.viewW / 2;
    const halfH = this.viewH / 2;
    this.camera.x = a.width <= this.viewW ? a.width / 2 : clamp(x, halfW, a.width - halfW);
    this.camera.y = a.height <= this.viewH ? a.height / 2 : clamp(y, halfH, a.height - halfH);
  },

  // Ouvre la frame : efface, applique la caméra (monde) et dessine la grille.
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = CONFIG.bgColor;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const camX = this.camera.x + this.camera.shakeX;
    const camY = this.camera.y + this.camera.shakeY;
    this._tx = this.viewW / 2 - camX;
    this._ty = this.viewH / 2 - camY;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this._tx * this.dpr, this._ty * this.dpr);

    this._drawGrid();
  },

  _drawGrid() {
    const ctx = this.ctx;
    const a = CONFIG.arena;
    // Région visible bornée à l'arène (limite la surface remplie).
    const vx = this.camera.x + this.camera.shakeX - this.viewW / 2;
    const vy = this.camera.y + this.camera.shakeY - this.viewH / 2;
    const x0 = clamp(vx, 0, a.width);
    const y0 = clamp(vy, 0, a.height);
    const x1 = clamp(vx + this.viewW, 0, a.width);
    const y1 = clamp(vy + this.viewH, 0, a.height);
    if (x1 <= x0 || y1 <= y0) return;

    ctx.fillStyle = this._gridPattern;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Bordure d'arène (lisible, discrète).
    ctx.strokeStyle = 'rgba(120,120,160,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, a.width, a.height);
  },

  // Ferme la frame : repasse en espace écran pour dessiner l'UI.
  end() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },

  // --- Cache de sprites offscreen ---
  // Les halos coûteux (gradients radiaux) sont rendus UNE fois dans un petit
  // canvas, puis simplement « blittés ». Aucun ctx.shadowBlur par frame.

  // Récupère ou crée un sprite carré de côté `size`, rendu une seule fois.
  sprite(key, size, drawFn) {
    let s = this._spriteCache.get(key);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    drawFn(c.getContext('2d'), size);
    s = { canvas: c, size, half: size / 2 };
    this._spriteCache.set(key, s);
    return s;
  },

  // Vide le cache (ex. changement de palette de biome).
  clearSpriteCache() {
    this._spriteCache.clear();
  },

  // Disque lumineux : halo radial + cœur plein (joueur, orbes, projectiles).
  glowSprite(coreColor, glowColor, radius, glowScale = 2.6) {
    const glowR = radius * glowScale;
    const pad = Math.ceil(glowR) + 2;
    const size = pad * 2;
    const g = hexToRgb(glowColor);
    return this.sprite(`glow|${coreColor}|${glowColor}|${radius}|${glowScale}`, size, (c, sz) => {
      const cx = sz / 2;
      const grad = c.createRadialGradient(cx, cx, radius * 0.2, cx, cx, glowR);
      grad.addColorStop(0, rgbCss(g.r, g.g, g.b, 0.85));
      grad.addColorStop(0.45, rgbCss(g.r, g.g, g.b, 0.28));
      grad.addColorStop(1, rgbCss(g.r, g.g, g.b, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(cx, cx, glowR, 0, TAU);
      c.fill();
      c.fillStyle = coreColor;
      c.beginPath();
      c.arc(cx, cx, radius, 0, TAU);
      c.fill();
    });
  },

  // Blob radial doux sans cœur dur (traînée, particules, splash de couleur).
  softDot(color, radius) {
    const pad = Math.ceil(radius) + 2;
    const size = pad * 2;
    const g = hexToRgb(color);
    return this.sprite(`soft|${color}|${radius}`, size, (c, sz) => {
      const cx = sz / 2;
      const grad = c.createRadialGradient(cx, cx, 0, cx, cx, radius);
      grad.addColorStop(0, rgbCss(g.r, g.g, g.b, 0.95));
      grad.addColorStop(0.5, rgbCss(g.r, g.g, g.b, 0.4));
      grad.addColorStop(1, rgbCss(g.r, g.g, g.b, 0));
      c.fillStyle = grad;
      c.fillRect(0, 0, sz, sz);
    });
  },

  // Blit d'un sprite centré en (x,y), rotation/échelle/alpha optionnels.
  drawSprite(spr, x, y, rot = 0, scale = 1, alpha = 1) {
    const ctx = this.ctx;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (rot === 0 && scale === 1) {
      ctx.drawImage(spr.canvas, x - spr.half, y - spr.half);
    } else {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(spr.canvas, -spr.half, -spr.half);
      ctx.restore();
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  },

  // Polygone régulier pré-rendu (halo + remplissage dégradé + contour lumineux).
  // La forme pointe vers le haut ; appliquer la rotation au moment du blit.
  polySprite(sides, radius, fillA, fillB, outline, glow, glowScale = 1.8) {
    const glowR = radius * glowScale;
    const pad = Math.ceil(glowR) + 3;
    const size = pad * 2;
    const gl = hexToRgb(glow);
    const key = `poly|${sides}|${radius}|${fillA}|${fillB}|${outline}|${glow}|${glowScale}`;
    return this.sprite(key, size, (c, sz) => {
      const cx = sz / 2;
      // halo
      const grad = c.createRadialGradient(cx, cx, radius * 0.3, cx, cx, glowR);
      grad.addColorStop(0, rgbCss(gl.r, gl.g, gl.b, 0.4));
      grad.addColorStop(1, rgbCss(gl.r, gl.g, gl.b, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(cx, cx, glowR, 0, TAU);
      c.fill();
      // chemin du polygone
      c.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = -HALF_PI + (i * TAU) / sides;
        const x = cx + Math.cos(a) * radius;
        const y = cx + Math.sin(a) * radius;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      const lg = c.createLinearGradient(cx, cx - radius, cx, cx + radius);
      lg.addColorStop(0, fillA);
      lg.addColorStop(1, fillB);
      c.fillStyle = lg;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = outline;
      c.stroke();
    });
  },

  additive() {
    this.ctx.globalCompositeOperation = 'lighter';
  },
  normal() {
    this.ctx.globalCompositeOperation = 'source-over';
  },

  worldToScreen(x, y, out = {}) {
    out.x = x + this._tx;
    out.y = y + this._ty;
    return out;
  },
  screenToWorld(x, y, out = {}) {
    out.x = x - this._tx;
    out.y = y - this._ty;
    return out;
  },

  // Overlay debug FPS (espace écran).
  drawFPS(fps) {
    const ctx = this.ctx;
    ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = CONFIG.textSecondary;
    ctx.fillText(`${fps.toFixed(0)} FPS`, 10, 8);
  },
};
