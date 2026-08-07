// pause.js — overlay de pause (version basique, stylisée en Phase 8). Le monde
// est figé ; la scène de jeu gère la bascule via la touche P / Échap.

import { CONFIG } from '../config.js';
import { FONT, FONT_TITLE } from '../ui/fonts.js';

export function renderPause(R) {
  const ctx = R.ctx;
  const vw = R.viewW;
  const vh = R.viewH;

  ctx.fillStyle = 'rgba(8,8,14,0.7)';
  ctx.fillRect(0, 0, vw, vh);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.font = `900 56px ${FONT_TITLE}`;
  ctx.fillText('PAUSE', vw / 2, vh / 2 - 20);

  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText('P / Échap / clic : reprendre', vw / 2, vh / 2 + 34);
  ctx.fillText('O : options', vw / 2, vh / 2 + 62);
}
