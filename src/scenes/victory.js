// victory.js — écran de victoire finale (après le niveau 5). Stylisé en Phase 8.

import { Render } from '../engine/render.js';
import { CONFIG, PALETTES } from '../config.js';

export function createVictoryScene(stats = {}) {
  let app = null;
  let t = 0;

  return {
    enter(_app) {
      app = _app;
      t = 0;
    },

    update(dt) {
      t += dt;
      if (t > 0.8 && app.input.confirmPressed()) app.startGame();
    },

    render() {
      Render.begin();
      Render.end();
      const ctx = Render.ctx;
      const vw = Render.viewW;
      const vh = Render.viewH;

      ctx.fillStyle = 'rgba(8,8,14,0.82)';
      ctx.fillRect(0, 0, vw, vh);

      // Titre arc-en-ciel (toutes les palettes réunies = couleur restaurée).
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const grad = ctx.createLinearGradient(vw / 2 - 240, 0, vw / 2 + 240, 0);
      const cols = PALETTES.flatMap((p) => p.colors);
      cols.forEach((c, i) => grad.addColorStop(i / (cols.length - 1), c));
      ctx.fillStyle = grad;
      ctx.font = '900 84px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('VICTOIRE', vw / 2, vh / 2 - 60);

      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = '500 20px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('Le monde a retrouvé toutes ses couleurs.', vw / 2, vh / 2 + 16);

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = '500 17px "Segoe UI", system-ui, sans-serif';
      const time = stats.time != null ? `${Math.floor(stats.time / 60)}:${Math.floor(stats.time % 60).toString().padStart(2, '0')}` : '—';
      ctx.fillText(`Temps : ${time}   ·   Kills : ${stats.kills ?? 0}   ·   Niveau : ${stats.level ?? 1}`, vw / 2, vh / 2 + 52);

      if (t > 0.8) {
        ctx.fillStyle = CONFIG.textPrimary;
        ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Entrée / clic pour rejouer', vw / 2, vh / 2 + 104);
      }
    },
  };
}
