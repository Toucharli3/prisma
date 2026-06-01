// game.js — scène de jeu principale. (Étendue phase par phase :
// ennemis, armes, XP, colorfield, boss...). Pour l'instant : le joueur seul.

import { Render } from '../engine/render.js';
import { CONFIG } from '../config.js';
import { lerp } from '../engine/math.js';
import { Player } from '../entities/player.js';

export function createGameScene() {
  const player = new Player();
  let app = null;

  return {
    enter(_app) {
      app = _app;
      player.reset(CONFIG.arena.width / 2, CONFIG.arena.height / 2);
    },

    update(dt) {
      player.update(dt);
    },

    render(alpha) {
      // Caméra suit le joueur (position interpolée pour la fluidité).
      Render.follow(lerp(player.px, player.x, alpha), lerp(player.py, player.y, alpha));
      Render.begin();
      player.render(Render, alpha);
      Render.end();
    },
  };
}
