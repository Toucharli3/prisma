// render.js — caméra, gestion du canvas (DPR plafonné), grille de fond
// pré-rendue et helpers de dessin. Le cache de glow (offscreen) est ajouté
// en Phase 1. Tout passe par ce module pour garder le rendu cohérent.

import { CONFIG } from '../config.js';
import { clamp, TAU, HALF_PI, hexToRgb, rgbCss } from './math.js';
import { FONT } from '../ui/fonts.js';

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
  shakeTrauma: 0, // screen shake (trauma au carré -> amplitude)
  _lastBeginTime: 0,
  _vignette: null,
  _scanPattern: null,
  _backdrop: null, // fond de biome procédural (canvas)

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d', { alpha: false, desynchronized: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._buildGrid();
    this._buildScanlines();
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
    this._bloomA = null; // tampons de bloom redimensionnés à la volée
    // Le pattern doit être recréé après changement de contexte/taille.
    if (this._gridTile) this._gridPattern = this.ctx.createPattern(this._gridTile, 'repeat');
    this._buildVignette();
  },

  // Vignette pré-rendue (dépend de la taille de la fenêtre).
  _buildVignette() {
    const c = document.createElement('canvas');
    c.width = this.viewW;
    c.height = this.viewH;
    const t = c.getContext('2d');
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    const g = t.createRadialGradient(cx, cy, Math.min(this.viewW, this.viewH) * 0.36, cx, cy, Math.max(this.viewW, this.viewH) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    t.fillStyle = g;
    t.fillRect(0, 0, this.viewW, this.viewH);
    this._vignette = c;
  },

  // Pattern de scanlines (1 ligne sombre toutes les 3 px).
  _buildScanlines() {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 3;
    const t = c.getContext('2d');
    t.fillStyle = 'rgba(0,0,0,0.16)';
    t.fillRect(0, 2, 1, 1);
    this._scanPattern = this.ctx.createPattern(c, 'repeat');
  },

  addShake(amount) {
    this.shakeTrauma = Math.min(1, this.shakeTrauma + amount);
  },

  setBackdrop(canvas) {
    this._backdrop = canvas;
  },

  // Pré-rend une tuile de grille une seule fois (calque statique).
  _buildGrid() {
    const s = CONFIG.gridSize;
    const tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const t = tile.getContext('2d');
    t.strokeStyle = 'rgba(255,255,255,0.045)'; // grille subtile lisible sur le fond de biome
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

    // Screen shake : décroissance + amplitude = trauma².
    const now = performance.now();
    const sdt = this._lastBeginTime ? Math.min(0.1, (now - this._lastBeginTime) / 1000) : 0;
    this._lastBeginTime = now;
    this.shakeTrauma = Math.max(0, this.shakeTrauma - sdt * 1.8);
    const mag = this.shakeTrauma * this.shakeTrauma * CONFIG.maxShake;
    this.camera.shakeX = (Math.random() * 2 - 1) * mag;
    this.camera.shakeY = (Math.random() * 2 - 1) * mag;

    const camX = this.camera.x + this.camera.shakeX;
    const camY = this.camera.y + this.camera.shakeY;
    this._tx = this.viewW / 2 - camX;
    this._ty = this.viewH / 2 - camY;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this._tx * this.dpr, this._ty * this.dpr);

    // Fond de biome (scalé sur l'arène) sous la grille et les entités.
    if (this._backdrop) {
      const a = CONFIG.arena;
      ctx.drawImage(this._backdrop, 0, 0, this._backdrop.width, this._backdrop.height, 0, 0, a.width, a.height);
    }
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

  // --- Bloom plein écran ---
  // Sans shader, on obtient un bloom convaincant en trois temps :
  //   1. réduction en 1/4 (le filtrage bilinéaire fournit déjà la moitié du flou)
  //   2. SEUIL : on multiplie l'image par elle-même, ce qui donne ≈ couleur². Le
  //      fond sombre s'écrase vers le noir, les néons saturés restent — c'est
  //      l'équivalent d'un « bright pass » sans avoir à lire un seul pixel.
  //   3. seconde réduction + flou léger, puis recomposition en additif.
  // Tout se passe sur des tampons minuscules : le coût ne dépend pas du nombre
  // d'entités à l'écran, seulement de la taille de la fenêtre.
  _ensureBloomBuffers() {
    const w = Math.max(1, Math.floor(this.viewW / 4));
    const h = Math.max(1, Math.floor(this.viewH / 4));
    if (this._bloomA && this._bloomA.width === w && this._bloomA.height === h) return;
    this._bloomA = document.createElement('canvas');
    this._bloomA.width = w;
    this._bloomA.height = h;
    this._bloomAc = this._bloomA.getContext('2d');
    this._bloomB = document.createElement('canvas');
    this._bloomB.width = Math.max(1, w >> 1);
    this._bloomB.height = Math.max(1, h >> 1);
    this._bloomBc = this._bloomB.getContext('2d');
  },

  // À appeler en espace écran, après le monde et AVANT le HUD (sinon le texte
  // d'interface bave). Sans effet en mode perf.
  bloom() {
    if (CONFIG.perf || !CONFIG.bloom.enabled) return;
    this._ensureBloomBuffers();
    const A = this._bloomAc;
    const B = this._bloomBc;
    const aw = this._bloomA.width;
    const ah = this._bloomA.height;
    const bw = this._bloomB.width;
    const bh = this._bloomB.height;

    A.globalCompositeOperation = 'source-over';
    A.clearRect(0, 0, aw, ah);
    A.drawImage(this.canvas, 0, 0, aw, ah);
    const passes = CONFIG.bloom.thresholdPasses | 0;
    if (passes > 0) {
      A.globalCompositeOperation = 'multiply';
      // n multiplications = couleur^(2ⁿ) : chaque passe écrase davantage le fond.
      for (let i = 0; i < passes; i++) A.drawImage(this._bloomA, 0, 0);
      A.globalCompositeOperation = 'source-over';
    }

    B.clearRect(0, 0, bw, bh);
    B.filter = 'blur(2px)';
    B.drawImage(this._bloomA, 0, 0, bw, bh);
    B.filter = 'none';

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = CONFIG.bloom.strength;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._bloomB, 0, 0, this.viewW, this.viewH);
    ctx.restore();
  },

  // Post-traitement plein écran (vignette + scanlines, sauf mode perf).
  postFx() {
    const ctx = this.ctx;
    if (this._vignette) ctx.drawImage(this._vignette, 0, 0);
    if (!CONFIG.perf && this._scanPattern) {
      ctx.fillStyle = this._scanPattern;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  },

  // Voile de transition (fondu). alpha 0..1.
  drawFade(alpha) {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(6,6,10,${alpha})`;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
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

      // Anneau intérieur facetté (décalé) -> aspect « créature ».
      c.beginPath();
      const off = Math.PI / sides;
      for (let i = 0; i < sides; i++) {
        const a = -HALF_PI + off + (i * TAU) / sides;
        const x = cx + Math.cos(a) * radius * 0.52;
        const y = cx + Math.sin(a) * radius * 0.52;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      c.globalAlpha = 0.5;
      c.lineWidth = 1.5;
      c.stroke();
      c.globalAlpha = 1;

      // Cœur lumineux central.
      const cg = c.createRadialGradient(cx, cx, 0, cx, cx, radius * 0.5);
      cg.addColorStop(0, outline);
      cg.addColorStop(1, rgbCss(gl.r, gl.g, gl.b, 0));
      c.fillStyle = cg;
      c.beginPath();
      c.arc(cx, cx, radius * 0.5, 0, TAU);
      c.fill();
    });
  },

  // Sprite du joueur selon la forme du skin (halo + forme + cœur). Mis en cache.
  playerSprite(shape, core, glow, radius) {
    const glowR = radius * 2.6;
    const pad = Math.ceil(glowR) + 3;
    const size = pad * 2;
    const g = hexToRgb(glow);
    return this.sprite(`pskin|${shape}|${core}|${glow}|${radius}`, size, (c, sz) => {
      const cx = sz / 2;
      // Halo commun.
      const grad = c.createRadialGradient(cx, cx, radius * 0.2, cx, cx, glowR);
      grad.addColorStop(0, rgbCss(g.r, g.g, g.b, 0.85));
      grad.addColorStop(0.45, rgbCss(g.r, g.g, g.b, 0.28));
      grad.addColorStop(1, rgbCss(g.r, g.g, g.b, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(cx, cx, glowR, 0, TAU);
      c.fill();

      const poly = (sides, r, rot = -HALF_PI) => {
        c.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = rot + (i * TAU) / sides;
          const x = cx + Math.cos(a) * r;
          const y = cx + Math.sin(a) * r;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.closePath();
      };

      c.fillStyle = core;
      c.strokeStyle = glow;
      c.lineWidth = 2;
      switch (shape) {
        case 'prism': {
          poly(3, radius * 1.25);
          c.fill();
          c.stroke();
          // facette intérieure
          c.globalAlpha = 0.55;
          c.fillStyle = glow;
          poly(3, radius * 0.6);
          c.fill();
          c.globalAlpha = 1;
          break;
        }
        case 'star': {
          c.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -HALF_PI + (i * TAU) / 10;
            const r = i % 2 === 0 ? radius * 1.35 : radius * 0.55;
            const x = cx + Math.cos(a) * r;
            const y = cx + Math.sin(a) * r;
            if (i) c.lineTo(x, y);
            else c.moveTo(x, y);
          }
          c.closePath();
          c.fill();
          c.stroke();
          break;
        }
        case 'ring': {
          c.lineWidth = radius * 0.55;
          c.strokeStyle = core;
          c.beginPath();
          c.arc(cx, cx, radius * 0.85, 0, TAU);
          c.stroke();
          c.lineWidth = 2;
          c.strokeStyle = glow;
          c.beginPath();
          c.arc(cx, cx, radius * 1.18, 0, TAU);
          c.stroke();
          break;
        }
        case 'hex': {
          poly(6, radius * 1.15);
          c.fill();
          c.stroke();
          c.globalAlpha = 0.5;
          c.fillStyle = glow;
          poly(6, radius * 0.55, -HALF_PI + TAU / 12);
          c.fill();
          c.globalAlpha = 1;
          break;
        }
        case 'ghost': {
          c.globalAlpha = 0.7;
          c.beginPath();
          c.arc(cx, cx, radius, 0, TAU);
          c.fill();
          c.globalAlpha = 1;
          c.strokeStyle = core;
          c.setLineDash([5, 4]);
          c.beginPath();
          c.arc(cx, cx, radius * 1.3, 0, TAU);
          c.stroke();
          c.setLineDash([]);
          break;
        }
        default: {
          // orb
          c.beginPath();
          c.arc(cx, cx, radius, 0, TAU);
          c.fill();
        }
      }
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
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = CONFIG.textSecondary;
    ctx.fillText(`${fps.toFixed(0)} FPS`, 10, 8);
  },
};
