// menu.js — menu principal stylé : titre PRISMA au dégradé animé (les couleurs
// du monde « coulent »), pastilles lumineuses dérivantes, accès aux options.

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { CONFIG, PALETTES } from '../config.js';
import { TAU } from '../engine/math.js';
import { createOptionsOverlay } from './options.js';

const FONT = '"Segoe UI", system-ui, sans-serif';
const FLAT = PALETTES.flatMap((p) => p.colors); // 15 couleurs

export function createMenuScene(opts = {}) {
  let app = null;
  let t = 0;
  let options = null;
  // Pastilles dérivantes (fond).
  const dots = [];
  for (let i = 0; i < 16; i++) {
    dots.push({
      x: Math.random(),
      y: Math.random(),
      r: 30 + Math.random() * 70,
      sp: 0.01 + Math.random() * 0.03,
      ph: Math.random() * TAU,
      color: FLAT[(Math.random() * FLAT.length) | 0],
    });
  }

  return {
    enter(_app) {
      app = _app;
      t = 0;
      Audio.setBiome(0);
    },

    update(dt) {
      t += dt;
      if (options) {
        options.update(dt);
        return;
      }
      if (Input.pressed('KeyO')) {
        Audio.uiSelect();
        options = createOptionsOverlay(() => (options = null));
        return;
      }
      if (app.input.confirmPressed()) app.startGame();
    },

    render() {
      const ctx = Render.ctx;
      const vw = Render.viewW;
      const vh = Render.viewH;

      // Fond + grille (caméra centrée sur l'arène).
      Render.begin();
      Render.end();

      // Pastilles lumineuses dérivantes (additif).
      Render.additive();
      for (const d of dots) {
        const x = (d.x + Math.cos(t * d.sp + d.ph) * 0.06) * vw;
        const y = (d.y + Math.sin(t * d.sp * 1.3 + d.ph) * 0.06) * vh;
        Render.drawSprite(Render.softDot(d.color, d.r), x, y, 0, 1, 0.18);
      }
      Render.normal();

      // Titre PRISMA — dégradé animé (rotation des couleurs de palette).
      const pulse = 1 + 0.025 * Math.sin(t * 2);
      const half = Math.min(vw * 0.42, 360);
      const off = Math.floor(t * 4) % FLAT.length;
      const grad = ctx.createLinearGradient(vw / 2 - half, 0, vw / 2 + half, 0);
      for (let i = 0; i < FLAT.length; i++) grad.addColorStop(i / (FLAT.length - 1), FLAT[(i + off) % FLAT.length]);

      ctx.save();
      ctx.translate(vw / 2, vh * 0.38);
      ctx.scale(pulse, pulse);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = grad;
      ctx.font = `900 ${Math.min(120, vw * 0.16)}px ${FONT}`;
      ctx.fillText('PRISMA', 0, 0);
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText('La dernière étincelle de couleur — rends sa couleur au monde.', vw / 2, vh * 0.52);

      // Invite clignotante.
      const blink = 0.55 + 0.45 * Math.sin(t * 3);
      ctx.fillStyle = `rgba(232,232,255,${blink})`;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText('Entrée / clic pour commencer', vw / 2, vh * 0.66);

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 15px ${FONT}`;
      ctx.fillText('ZQSD / WASD / flèches : se déplacer   ·   tir automatique   ·   [O] Options   ·   [P] Pause   ·   [M] Muet', vw / 2, vh - 40);

      if (options) options.render(Render);
    },
  };
}
