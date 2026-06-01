// render.js — caméra, gestion du canvas (DPR plafonné), grille de fond
// pré-rendue et helpers de dessin. Le cache de glow (offscreen) est ajouté
// en Phase 1. Tout passe par ce module pour garder le rendu cohérent.

import { CONFIG } from '../config.js';
import { clamp } from './math.js';

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
