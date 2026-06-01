// main.js — bootstrap, contexte applicatif partagé, machine à états des scènes
// et boucle de jeu. Les scènes implémentent : enter / update(dt) / render(ctx, alpha) / exit.

import { CONFIG } from './config.js';
import { Render } from './engine/render.js';
import { Input } from './engine/input.js';
import { createLoop } from './engine/loop.js';

const canvas = document.getElementById('game');
Render.init(canvas);
Input.init(canvas);

// Contexte partagé passé à toutes les scènes.
const app = {
  config: CONFIG,
  render: Render,
  input: Input,
  get ctx() {
    return Render.ctx;
  },
  get width() {
    return Render.viewW;
  },
  get height() {
    return Render.viewH;
  },
  scene: null,
  setScene(scene, ...args) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = scene;
    if (scene.enter) scene.enter(this, ...args);
  },
};

// Scène d'amorçage de la Phase 0 : la grille de fond et le compteur FPS
// sont gérés par la boucle ; cette scène est volontairement vide.
const bootScene = {
  enter() {},
  update() {},
  render() {},
};

app.setScene(bootScene);

const loop = createLoop({
  update(dt) {
    if (app.scene.update) app.scene.update(dt);
    Input.endFrame();
  },
  render(alpha) {
    Render.begin();
    if (app.scene.render) app.scene.render(Render.ctx, alpha);
    Render.end();
    if (CONFIG.debug) Render.drawFPS(loop.fps);
  },
});

app.loop = loop;
loop.start();
