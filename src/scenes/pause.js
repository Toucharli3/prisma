// pause.js — overlay de pause (version basique, stylisée en Phase 8). Le monde
// est figé ; la scène de jeu gère la bascule via la touche P / Échap.

import { CONFIG } from '../config.js';

export function renderPause(R) {
  const ctx = R.ctx;
  const vw = R.viewW;
  const vh = R.viewH;

  ctx.fillStyle = 'rgba(8,8,14,0.7)';
  ctx.fillRect(0, 0, vw, vh);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.font = '800 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('PAUSE', vw / 2, vh / 2 - 20);

  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = '500 18px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('P / Échap pour reprendre', vw / 2, vh / 2 + 36);
}
