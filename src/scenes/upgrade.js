// upgrade.js — overlay de choix d'amélioration (1 parmi 3). Rendu PAR-DESSUS le
// monde figé (la scène de jeu dessine le monde, puis appelle render ici).
// Navigation : flèches / ZQSD / 1-2-3 / Entrée / souris (survol + clic).

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { CONFIG } from '../config.js';
import { hexA, TAU } from '../engine/math.js';
import { roundRect, wrapText } from '../ui/widgets.js';
import { FONT, FONT_TITLE } from '../ui/fonts.js';

// onReroll() doit renvoyer un NOUVEAU tirage (ou null si plus de relances).
export function createUpgradeOverlay(world, initialChoices, onPick, onReroll, onBanish) {
  let choices = initialChoices;
  let sel = 0;
  let t = 0;
  let rects = [];
  let flash = 0; // éclair bref quand la main change

  function layout() {
    const vw = Render.viewW;
    const vh = Render.viewH;
    const n = choices.length;
    const cardW = Math.min(280, (vw - 100) / n - 20);
    const gap = 26;
    const totalW = n * cardW + (n - 1) * gap;
    const x0 = (vw - totalW) / 2;
    const cardH = Math.min(330, vh * 0.55);
    const y = (vh - cardH) / 2 + 24;
    rects.length = 0;
    for (let i = 0; i < n; i++) rects.push({ x: x0 + i * (cardW + gap), y, w: cardW, h: cardH });
  }

  function pick() {
    Audio.uiSelect();
    onPick(choices[sel]);
  }

  // Relance : nouvelle main, la sélection revient au début.
  function reroll() {
    if (!onReroll || world.rerolls <= 0) return;
    const next = onReroll();
    if (!next) return;
    choices = next;
    sel = Math.min(sel, choices.length - 1);
    flash = 0.25;
    Audio.uiSelect();
  }

  // Bannissement : la carte visée disparaît du tirage pour toute la partie,
  // puis la main est retirée pour la remplacer immédiatement.
  function banish() {
    if (!onBanish || world.banishes <= 0 || choices.length === 0) return;
    const next = onBanish(choices[sel]);
    if (!next) return;
    choices = next;
    sel = Math.min(sel, choices.length - 1);
    flash = 0.25;
    Audio.nova();
  }

  function move(d) {
    sel = (sel + d + choices.length) % choices.length;
    Audio.uiMove();
  }

  function drawCard(ctx, r, c, i, selected) {
    const pop = selected ? 1 + 0.03 * Math.sin(t * 6) : 1;
    const cx = r.x + r.w / 2;
    ctx.save();
    if (selected) {
      ctx.translate(cx, r.y + r.h / 2);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -(r.y + r.h / 2));
    }

    ctx.fillStyle = selected ? 'rgba(28,28,44,0.97)' : 'rgba(18,18,30,0.92)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 16);
    ctx.fill();
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeStyle = selected ? c.color : hexA(c.color, 0.45);
    roundRect(ctx, r.x, r.y, r.w, r.h, 16);
    ctx.stroke();

    // Pastille de couleur (icône) + halo.
    const iconY = r.y + 64;
    const grad = ctx.createRadialGradient(cx, iconY, 4, cx, iconY, 40);
    grad.addColorStop(0, hexA(c.color, 0.9));
    grad.addColorStop(1, hexA(c.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, iconY, 40, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(cx, iconY, 20, 0, TAU);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CONFIG.textPrimary;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(c.name, cx, r.y + 132);

    ctx.fillStyle = CONFIG.textSecondary;
    ctx.font = `600 15px ${FONT}`;
    wrapText(ctx, c.desc, cx, r.y + 172, r.w - 36, 22);

    ctx.fillStyle = selected ? c.color : CONFIG.textSecondary;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`[ ${i + 1} ]`, cx, r.y + r.h - 26);
    ctx.restore();
  }

  return {
    get choices() {
      return choices; // exposé pour debug/tests (la main change au reroll)
    },

    update(dt) {
      t += dt;
      if (flash > 0) flash -= dt;
      layout();

      // Survol / clic souris.
      const m = Input.mouse;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) {
          if (sel !== i) {
            sel = i;
            Audio.uiMove();
          }
          if (m.clicked) {
            pick();
            return;
          }
        }
      }

      if (Input.pressed('ArrowLeft', 'KeyA', 'KeyQ')) move(-1);
      if (Input.pressed('ArrowRight', 'KeyD')) move(1);
      if (Input.pressed('Digit1')) {
        sel = 0;
        pick();
        return;
      }
      if (Input.pressed('Digit2') && choices.length > 1) {
        sel = 1;
        pick();
        return;
      }
      if (Input.pressed('Digit3') && choices.length > 2) {
        sel = 2;
        pick();
        return;
      }
      if (Input.pressed('KeyR')) reroll();
      if (Input.pressed('KeyX')) banish();
      if (Input.pressed('Enter', 'Space')) pick();
    },

    render(R) {
      const ctx = R.ctx;
      const vw = R.viewW;
      const vh = R.viewH;
      if (rects.length === 0) layout();

      ctx.fillStyle = 'rgba(8,8,14,0.74)';
      ctx.fillRect(0, 0, vw, vh);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `900 36px ${FONT_TITLE}`;
      ctx.fillText('MONTÉE DE NIVEAU', vw / 2, rects[0].y - 56);
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText('Choisis une amélioration', vw / 2, rects[0].y - 26);

      for (let i = 0; i < choices.length; i++) drawCard(ctx, rects[i], choices[i], i, i === sel);

      // Barre d'actions : relance et bannissement, grisés une fois épuisés.
      const by = rects[0].y + rects[0].h + 34;
      const canR = world.rerolls > 0;
      const canB = world.banishes > 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 15px ${FONT}`;
      const gap = 26;
      const lR = `⟳ RELANCER  [R] ×${world.rerolls}`;
      const lB = `⊘ BANNIR  [X] ×${world.banishes}`;
      const wR = ctx.measureText(lR).width;
      const wB = ctx.measureText(lB).width;
      const x0 = vw / 2 - (wR + gap + wB) / 2;
      ctx.fillStyle = canR ? CONFIG.player.glowColor : 'rgba(150,150,170,0.35)';
      ctx.fillText(lR, x0 + wR / 2, by);
      ctx.fillStyle = canB ? '#ff6a3d' : 'rgba(150,150,170,0.35)';
      ctx.fillText(lB, x0 + wR + gap + wB / 2, by);

      // Éclair bref quand la main vient de changer (relance / bannissement).
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.16 * (flash / 0.25)})`;
        ctx.fillRect(0, 0, vw, vh);
      }
    },
  };
}
