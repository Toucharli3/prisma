// gameover.js — fin de partie (la mort est la seule fin en mode sans fin).
// Enregistre la méta locale, soumet le score au classement (en ligne ou local),
// et affiche le rang + le top des scores.

import { Render } from '../engine/render.js';
import { Audio } from '../engine/audio.js';
import { Save } from '../engine/save.js';
import { Leaderboard } from '../engine/leaderboard.js';
import { CONFIG } from '../config.js';
import { fmtInt } from '../engine/math.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

export function createGameOverScene(stats = {}) {
  let app = null;
  let t = 0;
  let meta = { newHighScore: false };
  let board = [];
  let rank = null;
  let online = false;
  let submitting = true;

  return {
    enter(_app) {
      app = _app;
      t = 0;
      Audio.gameover();
      meta = Save.recordRun(stats, false);
      const name = Save.data.name || 'Anonyme';
      Leaderboard.submit({ name, score: stats.score || 0, biome: stats.biome || 1, combo: stats.bestCombo || 0 }).then((res) => {
        rank = res.rank;
        board = res.scores || [];
        online = res.online;
        submitting = false;
      });
    },

    update(dt) {
      t += dt;
      if (t > 0.6) {
        if (app.input.confirmPressed()) app.startGame();
        else if (app.input.pressed('Escape')) app.gotoMenu(); // (pas KeyM : réservé au mute global)
      }
    },

    render() {
      Render.begin();
      Render.end();
      const ctx = Render.ctx;
      const vw = Render.viewW;
      const vh = Render.viewH;

      ctx.fillStyle = 'rgba(10,10,15,0.82)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = CONFIG.danger;
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText('GAME OVER', vw / 2, vh * 0.16);

      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`Score ${fmtInt(stats.score ?? 0)}`, vw / 2, vh * 0.25);
      if (meta.newHighScore) {
        ctx.fillStyle = CONFIG.player.glowColor;
        ctx.font = `700 16px ${FONT}`;
        ctx.fillText('★ Nouveau record perso !', vw / 2, vh * 0.25 + 30);
      }

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 16px ${FONT}`;
      const tm = stats.time != null ? `${Math.floor(stats.time / 60)}:${Math.floor(stats.time % 60).toString().padStart(2, '0')}` : '0:00';
      ctx.fillText(`Biome ${stats.biome ?? 1}   ·   Kills ${stats.kills ?? 0}   ·   Combo ×${stats.bestCombo ?? 0}   ·   ${tm}`, vw / 2, vh * 0.33);

      // Classement.
      const ly = vh * 0.42;
      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText('CLASSEMENT', vw / 2, ly);
      ctx.font = `600 13px ${FONT}`;
      if (submitting) {
        ctx.fillStyle = CONFIG.textSecondary;
        ctx.fillText('envoi du score…', vw / 2, ly + 22);
      } else {
        ctx.fillStyle = online ? '#2bff88' : CONFIG.textSecondary;
        ctx.fillText(`${online ? '● en ligne' : '○ local'}${rank ? `  ·  ton rang : #${rank}` : ''}`, vw / 2, ly + 22);
        ctx.font = `600 15px ${FONT}`;
        for (let i = 0; i < Math.min(6, board.length); i++) {
          const e = board[i];
          const ry = ly + 50 + i * 24;
          const me = e.name === (Save.data.name || 'Anonyme') && e.score === stats.score;
          ctx.textAlign = 'right';
          ctx.fillStyle = CONFIG.textSecondary;
          ctx.font = `700 15px ${FONT}`;
          ctx.fillText(`${i + 1}.`, vw / 2 - 170, ry);
          ctx.textAlign = 'left';
          ctx.fillStyle = me ? CONFIG.player.glowColor : CONFIG.textPrimary;
          ctx.fillText(e.name, vw / 2 - 156, ry);
          ctx.textAlign = 'right';
          ctx.fillStyle = me ? CONFIG.player.glowColor : CONFIG.textSecondary;
          ctx.fillText(String(e.score), vw / 2 + 170, ry);
        }
        ctx.textAlign = 'center';
      }

      if (t > 0.6) {
        ctx.fillStyle = CONFIG.textPrimary;
        ctx.font = `600 17px ${FONT}`;
        ctx.fillText('Entrée / clic : rejouer      Échap : menu', vw / 2, vh - 36);
      }
    },
  };
}
