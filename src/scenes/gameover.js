// gameover.js — écran de fin de partie. Enregistre la partie (méta-progression)
// et affiche le score + déblocages éventuels. Retour au menu / rejouer.

import { Render } from '../engine/render.js';
import { Audio } from '../engine/audio.js';
import { Save } from '../engine/save.js';
import { CONFIG } from '../config.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

export function createGameOverScene(stats = {}) {
  let app = null;
  let t = 0;
  let result = { newHighScore: false, newlyUnlocked: [] };

  return {
    enter(_app) {
      app = _app;
      t = 0;
      result = Save.recordRun(stats, false);
      Audio.gameover();
    },

    update(dt) {
      t += dt;
      if (t > 0.6) {
        if (app.input.confirmPressed()) app.startGame();
        else if (app.input.pressed('Escape', 'KeyM')) app.gotoMenu();
      }
    },

    render() {
      Render.begin();
      Render.end();
      const ctx = Render.ctx;
      const vw = Render.viewW;
      const vh = Render.viewH;

      ctx.fillStyle = 'rgba(10,10,15,0.8)';
      ctx.fillRect(0, 0, vw, vh);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.danger;
      ctx.font = `800 62px ${FONT}`;
      ctx.fillText('GAME OVER', vw / 2, vh / 2 - 80);

      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`Score ${stats.score ?? 0}`, vw / 2, vh / 2 - 18);
      if (result.newHighScore) {
        ctx.fillStyle = CONFIG.player.glowColor;
        ctx.font = `700 17px ${FONT}`;
        ctx.fillText('★ Nouveau meilleur score !', vw / 2, vh / 2 + 14);
      }

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 17px ${FONT}`;
      const tm = stats.time != null ? `${Math.floor(stats.time / 60)}:${Math.floor(stats.time % 60).toString().padStart(2, '0')}` : '0:00';
      ctx.fillText(`Biome ${stats.biome ?? 1}/5   ·   Kills ${stats.kills ?? 0}   ·   Combo max ×${stats.bestCombo ?? 0}   ·   ${tm}`, vw / 2, vh / 2 + 44);

      let y = vh / 2 + 80;
      for (const label of result.newlyUnlocked) {
        ctx.fillStyle = CONFIG.player.glowColor;
        ctx.font = `700 16px ${FONT}`;
        ctx.fillText(`Débloqué : ${label}`, vw / 2, y);
        y += 24;
      }

      if (t > 0.6) {
        ctx.fillStyle = CONFIG.textPrimary;
        ctx.font = `600 18px ${FONT}`;
        ctx.fillText('Entrée / clic : rejouer      Échap : menu', vw / 2, y + 22);
      }
    },
  };
}
