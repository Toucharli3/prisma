// victory.js — écran de victoire finale (après le niveau 5). Enregistre la
// partie (gagnée) et affiche le score + déblocages.

import { Render } from '../engine/render.js';
import { Audio } from '../engine/audio.js';
import { Save } from '../engine/save.js';
import { CONFIG, PALETTES } from '../config.js';

const FONT = '"Segoe UI", system-ui, sans-serif';
const FLAT = PALETTES.flatMap((p) => p.colors);

export function createVictoryScene(stats = {}) {
  let app = null;
  let t = 0;
  let result = { newHighScore: false, newlyUnlocked: [] };

  return {
    enter(_app) {
      app = _app;
      t = 0;
      result = Save.recordRun(stats, true);
      Audio.victory();
    },

    update(dt) {
      t += dt;
      if (t > 0.8) {
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

      ctx.fillStyle = 'rgba(8,8,14,0.84)';
      ctx.fillRect(0, 0, vw, vh);

      // Titre arc-en-ciel animé (toutes les palettes = couleur restaurée).
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const off = Math.floor(t * 5) % FLAT.length;
      const grad = ctx.createLinearGradient(vw / 2 - 260, 0, vw / 2 + 260, 0);
      for (let i = 0; i < FLAT.length; i++) grad.addColorStop(i / (FLAT.length - 1), FLAT[(i + off) % FLAT.length]);
      ctx.fillStyle = grad;
      ctx.font = `900 80px ${FONT}`;
      ctx.fillText('VICTOIRE', vw / 2, vh / 2 - 86);

      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `500 20px ${FONT}`;
      ctx.fillText('Le monde a retrouvé toutes ses couleurs.', vw / 2, vh / 2 - 30);

      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`Score ${stats.score ?? 0}`, vw / 2, vh / 2 + 8);
      if (result.newHighScore) {
        ctx.fillStyle = CONFIG.player.glowColor;
        ctx.font = `700 17px ${FONT}`;
        ctx.fillText('★ Nouveau meilleur score !', vw / 2, vh / 2 + 38);
      }

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 16px ${FONT}`;
      const tm = stats.time != null ? `${Math.floor(stats.time / 60)}:${Math.floor(stats.time % 60).toString().padStart(2, '0')}` : '0:00';
      ctx.fillText(`Kills ${stats.kills ?? 0}   ·   Combo max ×${stats.bestCombo ?? 0}   ·   ${tm}`, vw / 2, vh / 2 + 66);

      let y = vh / 2 + 98;
      for (const label of result.newlyUnlocked) {
        ctx.fillStyle = CONFIG.player.glowColor;
        ctx.font = `700 16px ${FONT}`;
        ctx.fillText(`Débloqué : ${label}`, vw / 2, y);
        y += 24;
      }

      if (t > 0.8) {
        ctx.fillStyle = CONFIG.textPrimary;
        ctx.font = `600 18px ${FONT}`;
        ctx.fillText('Entrée / clic : rejouer      Échap : menu', vw / 2, y + 22);
      }
    },
  };
}
