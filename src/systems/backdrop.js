// backdrop.js — fond de biome procédural (aucune image externe) : dégradé sombre
// teinté du biome + nébuleuses lumineuses + champ d'étoiles. Rendu une seule fois
// par biome dans un canvas demi-résolution, puis dessiné (scalé) sous les entités.

import { hexToRgb, rgbCss, mixHex, TAU } from '../engine/math.js';

export function buildBackdrop(palette, arenaW, arenaH) {
  const W = Math.round(arenaW / 2);
  const H = Math.round(arenaH / 2);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const t = c.getContext('2d');

  // Dégradé de base : sombre, légèrement teinté du biome.
  const g = t.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, mixHex(palette.colors[0], '#05060c', 0.82));
  g.addColorStop(0.55, mixHex(palette.colors[2], '#05060c', 0.88));
  g.addColorStop(1, '#04050a');
  t.fillStyle = g;
  t.fillRect(0, 0, W, H);

  // Champ d'étoiles.
  for (let i = 0; i < 150; i++) {
    t.globalAlpha = 0.12 + Math.random() * 0.6;
    t.fillStyle = '#ffffff';
    const r = Math.random() < 0.85 ? 1 : 2;
    t.fillRect(Math.random() * W, Math.random() * H, r, r);
  }
  t.globalAlpha = 1;

  // Nébuleuses douces (additif) dans les couleurs du biome.
  t.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const col = hexToRgb(palette.colors[(Math.random() * palette.colors.length) | 0]);
    const x = Math.random() * W;
    const y = Math.random() * H;
    const rad = 120 + Math.random() * 280;
    const grad = t.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, rgbCss(col.r, col.g, col.b, 0.1 + Math.random() * 0.07));
    grad.addColorStop(1, rgbCss(col.r, col.g, col.b, 0));
    t.fillStyle = grad;
    t.beginPath();
    t.arc(x, y, rad, 0, TAU);
    t.fill();
  }
  t.globalCompositeOperation = 'source-over';

  return c;
}
