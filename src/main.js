// main.js — bootstrap, contexte applicatif partagé, machine à états des scènes
// et boucle de jeu. Les scènes gèrent elles-mêmes Render.begin()/end() afin de
// pouvoir positionner la caméra (avec interpolation) avant l'ouverture de frame.

import { CONFIG } from './config.js';
import { Render } from './engine/render.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { Save } from './engine/save.js';
import { createLoop } from './engine/loop.js';
import { createMenuScene } from './scenes/menu.js';
import { createGameScene } from './scenes/game.js';
import { createGameOverScene } from './scenes/gameover.js';
import { createVictoryScene } from './scenes/victory.js';

const canvas = document.getElementById('game');
Render.init(canvas);
Input.init(canvas);
Audio.init(); // contexte créé au 1er geste utilisateur
Save.load(); // méta-progression + réglages
Save.applySettings();

// Contexte partagé passé à toutes les scènes.
const app = {
  config: CONFIG,
  render: Render,
  input: Input,
  scene: null,
  _fade: 1,
  setScene(scene, ...args) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = scene;
    this._fade = 1; // fondu d'entrée
    if (scene.enter) scene.enter(this, ...args);
  },
};

const loop = createLoop({
  update(dt) {
    if (Input.pressed('KeyM')) {
      Audio.toggleMute();
      Save.syncSettings();
    }
    if (Input.pressed('F3')) CONFIG.debug = !CONFIG.debug; // overlay debug
    if (app.scene.update) app.scene.update(dt);
    Input.endFrame();
  },
  render(alpha, frameDt) {
    if (app.scene.render) app.scene.render(alpha);
    Render.end(); // espace écran
    Render.postFx(); // vignette + scanlines
    if (app._fade > 0) {
      app._fade = Math.max(0, app._fade - frameDt * 3.2);
      Render.drawFade(app._fade);
    }
    if (CONFIG.debug) Render.drawFPS(loop.fps);
  },
});

app.loop = loop;

// Transitions de scènes centralisées (évite les imports croisés entre scènes).
app.gotoMenu = () => app.setScene(createMenuScene());
app.startGame = (opts) => app.setScene(createGameScene(opts));
app.gameOver = (stats) => app.setScene(createGameOverScene(stats));
app.victory = (stats) => app.setScene(createVictoryScene(stats));

// Démarre sur le menu principal.
app.gotoMenu();
loop.start();

// Handle d'inspection (jeu local solo) : utile pour tests/réglages. F3 affiche l'overlay.
window.__prisma = app;
window.__audio = Audio;
window.__save = Save;
