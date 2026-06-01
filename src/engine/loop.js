// loop.js — boucle de jeu à timestep FIXE pour la logique, avec interpolation
// pour le rendu. Garantit une simulation déterministe et fluide quel que soit
// le taux de rafraîchissement de l'écran (60/120/144 Hz).

export function createLoop({ update, render, fixedDt = 1 / 60, maxSteps = 5 }) {
  let running = false;
  let last = 0;
  let acc = 0;
  const MAX_FRAME = 0.25; // anti « spiral of death » si l'onglet a lagué

  // Mesure de FPS lissée (fenêtre 0.5 s).
  let fpsTimer = 0;
  let fpsFrames = 0;

  function frame(nowMs) {
    if (!running) return;
    const now = nowMs / 1000;
    let frameDt = now - last;
    last = now;
    if (frameDt > MAX_FRAME) frameDt = MAX_FRAME;

    acc += frameDt;
    let steps = 0;
    while (acc >= fixedDt && steps < maxSteps) {
      update(fixedDt);
      acc -= fixedDt;
      steps++;
    }
    // Si on a saturé le budget, on jette le retard pour rester réactif.
    if (steps === maxSteps) acc = 0;

    const alpha = acc / fixedDt; // facteur d'interpolation [0,1)
    render(alpha, frameDt);

    fpsTimer += frameDt;
    fpsFrames++;
    if (fpsTimer >= 0.5) {
      loop.fps = fpsFrames / fpsTimer;
      fpsTimer = 0;
      fpsFrames = 0;
    }

    requestAnimationFrame(frame);
  }

  const loop = {
    fps: 0,
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now() / 1000;
      acc = 0;
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
  };

  return loop;
}
