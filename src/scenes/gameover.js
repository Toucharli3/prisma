// gameover.js — écran de fin de partie (version Phase 2, stylisé en Phase 8).
// La transition vers une nouvelle partie passe par app.startGame().

import { Render } from '../engine/render.js';
import { CONFIG } from '../config.js';

export function createGameOverScene(stats = {}) {
  let app = null;
  let t = 0;

  return {
    enter(_app) {
      app = _app;
      t = 0;
    },

    update(dt) {
      t += dt;
      if (t > 0.6 && app.input.confirmPressed()) app.startGame();
    },

    render() {
      // Fond + grille (caméra figée sur la dernière position), puis overlay.
      Render.begin();
      Render.end();
      const ctx = Render.ctx;
      const w = Render.viewW;
      const h = Render.viewH;

      ctx.fillStyle = 'rgba(10,10,15,0.78)';
      ctx.fillRect(0, 0, w, h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.danger;
      ctx.font = '800 64px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('GAME OVER', w / 2, h / 2 - 40);

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = '500 20px "Segoe UI", system-ui, sans-serif';
      const time = stats.time != null ? stats.time.toFixed(1) : '0.0';
      ctx.fillText(`Survie : ${time} s`, w / 2, h / 2 + 24);

      if (t > 0.6) {
        ctx.fillStyle = CONFIG.textPrimary;
        ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Entrée / clic pour rejouer', w / 2, h / 2 + 70);
      }
    },
  };
}
