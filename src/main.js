// main.js — bootstrap, contexte applicatif partagé, machine à états des scènes
// et boucle de jeu. Les scènes gèrent elles-mêmes Render.begin()/end() afin de
// pouvoir positionner la caméra (avec interpolation) avant l'ouverture de frame.

import { CONFIG } from './config.js';
import { Render } from './engine/render.js';
import { Input } from './engine/input.js';
import { createLoop } from './engine/loop.js';
import { createGameScene } from './scenes/game.js';

const canvas = document.getElementById('game');
Render.init(canvas);
Input.init(canvas);

// Contexte partagé passé à toutes les scènes.
const app = {
  config: CONFIG,
  render: Render,
  input: Input,
  scene: null,
  setScene(scene, ...args) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = scene;
    if (scene.enter) scene.enter(this, ...args);
  },
};

const loop = createLoop({
  update(dt) {
    if (app.scene.update) app.scene.update(dt);
    Input.endFrame();
  },
  render(alpha) {
    if (app.scene.render) app.scene.render(alpha);
    Render.end(); // garantit l'espace écran pour l'overlay debug
    if (CONFIG.debug) Render.drawFPS(loop.fps);
  },
});

app.loop = loop;

// Démarre directement dans le jeu (le menu stylé arrive en Phase 8).
app.setScene(createGameScene());
loop.start();
