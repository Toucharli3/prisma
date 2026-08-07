// menu.js — menu principal : titre PRISMA au dégradé animé, saisie du pseudo
// (input DOM), classement en ligne (ou local), accès aux options.

import { Render } from '../engine/render.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { Save } from '../engine/save.js';
import { Leaderboard } from '../engine/leaderboard.js';
import { createNameInput } from '../ui/nameInput.js';
import { CONFIG, PALETTES } from '../config.js';
import { TAU, fmtInt } from '../engine/math.js';
import { buildBackdrop } from '../systems/backdrop.js';
import { createOptionsOverlay } from './options.js';
import { FONT, FONT_TITLE } from '../ui/fonts.js';

const FLAT = PALETTES.flatMap((p) => p.colors);

export function createMenuScene() {
  let app = null;
  let t = 0;
  let options = null;
  let nameInput = null;
  let board = [];
  let boardLoading = true;

  const dots = [];
  for (let i = 0; i < 16; i++) {
    dots.push({ x: Math.random(), y: Math.random(), r: 30 + Math.random() * 70, sp: 0.01 + Math.random() * 0.03, ph: Math.random() * TAU, color: FLAT[(Math.random() * FLAT.length) | 0] });
  }

  function refreshBoard() {
    boardLoading = true;
    board = [];
    Leaderboard.top(6).then((list) => {
      board = list;
      boardLoading = false;
    });
  }

  return {
    enter(_app) {
      app = _app;
      t = 0;
      Audio.setBiome(0);
      Render.setBackdrop(buildBackdrop(PALETTES[(Math.random() * PALETTES.length) | 0], CONFIG.arena.width, CONFIG.arena.height));
      nameInput = createNameInput(() => Save.data.name, (n) => Save.setName(n));
      refreshBoard();
    },

    exit() {
      if (nameInput) {
        nameInput.destroy();
        nameInput = null;
      }
    },

    update(dt) {
      t += dt;
      if (options) {
        if (nameInput) nameInput.hide();
        options.update(dt);
        return;
      }
      if (nameInput) nameInput.show();
      // Choix du personnage (flèches gauche/droite). Le champ pseudo avale ses
      // propres touches, donc pas de conflit quand il a le focus.
      if (Input.pressed('ArrowLeft')) {
        Save.cycleCharacter(-1);
        Audio.uiMove();
      }
      if (Input.pressed('ArrowRight')) {
        Save.cycleCharacter(1);
        Audio.uiMove();
      }
      if (Input.pressed('KeyO')) {
        Audio.uiSelect();
        options = createOptionsOverlay(() => (options = null));
        return;
      }
      if (app.input.confirmPressed()) {
        if (nameInput) Save.setName(nameInput.value());
        app.startGame();
      }
    },

    render() {
      const ctx = Render.ctx;
      const vw = Render.viewW;
      const vh = Render.viewH;

      Render.begin();
      Render.end();

      Render.additive();
      for (const d of dots) {
        const x = (d.x + Math.cos(t * d.sp + d.ph) * 0.06) * vw;
        const y = (d.y + Math.sin(t * d.sp * 1.3 + d.ph) * 0.06) * vh;
        Render.drawSprite(Render.softDot(d.color, d.r), x, y, 0, 1, 0.16);
      }
      Render.normal();

      // Titre.
      const pulse = 1 + 0.025 * Math.sin(t * 2);
      const half = Math.min(vw * 0.42, 360);
      const off = Math.floor(t * 4) % FLAT.length;
      const grad = ctx.createLinearGradient(vw / 2 - half, 0, vw / 2 + half, 0);
      for (let i = 0; i < FLAT.length; i++) grad.addColorStop(i / (FLAT.length - 1), FLAT[(i + off) % FLAT.length]);
      ctx.save();
      ctx.translate(vw / 2, vh * 0.22);
      ctx.scale(pulse, pulse);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = grad;
      ctx.font = `900 ${Math.min(104, vw * 0.14)}px ${FONT_TITLE}`;
      ctx.fillText('PRISMA', 0, 0);
      ctx.restore();

      // Bloom sur les nébuleuses + le titre (le texte informatif reste net).
      Render.bloom();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 17px ${FONT}`;
      ctx.fillText('La dernière étincelle de couleur — survis et grimpe au classement.', vw / 2, vh * 0.33);

      // Champ pseudo (DOM) positionné ici.
      if (nameInput && !options) nameInput.position(vw / 2, vh * 0.39, Math.min(300, vw * 0.5));

      // --- Sélecteur de personnage ---
      const chr = Save.getCharacter();
      const nUnlocked = Save.unlockedCharacters().length;
      const cy = vh * 0.5; // sous le champ pseudo (qui occupe ~44 px sous 0.39)
      ctx.font = `700 22px ${FONT}`;
      const nameW = ctx.measureText(chr.name).width;
      ctx.fillStyle = chr.color;
      ctx.fillText(chr.name, vw / 2, cy);
      // Chevrons : seulement s'il y a plusieurs personnages à parcourir.
      if (nUnlocked > 1) {
        ctx.fillStyle = `rgba(232,232,255,${0.35 + 0.35 * Math.sin(t * 4)})`;
        ctx.font = `700 20px ${FONT}`;
        ctx.fillText('‹', vw / 2 - nameW / 2 - 26, cy);
        ctx.fillText('›', vw / 2 + nameW / 2 + 26, cy);
      }
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText(`${chr.tagline}   ·   arme : ${CONFIG.weapons[chr.weapon].name}`, vw / 2, cy + 22);
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(180,180,210,0.6)';
      ctx.fillText(nUnlocked < CONFIG.characters.length ? `← → changer   ·   ${nUnlocked}/${CONFIG.characters.length} débloqués` : '← → changer', vw / 2, cy + 40);

      // Invite.
      const blink = 0.55 + 0.45 * Math.sin(t * 3);
      ctx.fillStyle = `rgba(232,232,255,${blink})`;
      ctx.font = `700 21px ${FONT}`;
      ctx.fillText('Entrée / clic pour commencer', vw / 2, vh * 0.59);

      if (Save.data.highScore > 0) {
        ctx.fillStyle = CONFIG.textSecondary;
        ctx.font = `600 14px ${FONT}`;
        ctx.fillText(`Ton record : ${fmtInt(Save.data.highScore)}   ·   Biome max : ${Save.data.furthestBiome}`, vw / 2, vh * 0.635);
      }

      // Classement.
      const lx = vw / 2;
      const ly = vh * 0.705;
      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText('CLASSEMENT', lx, ly);
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = Leaderboard.isOnline() ? '#2bff88' : CONFIG.textSecondary;
      ctx.fillText(Leaderboard.isOnline() ? '● en ligne' : '○ local (hors-ligne)', lx, ly + 19);

      ctx.font = `600 15px ${FONT}`;
      if (boardLoading) {
        ctx.fillStyle = CONFIG.textSecondary;
        ctx.fillText('chargement…', lx, ly + 48);
      } else if (board.length === 0) {
        ctx.fillStyle = CONFIG.textSecondary;
        ctx.fillText('Aucun score — sois le premier !', lx, ly + 48);
      } else {
        for (let i = 0; i < Math.min(5, board.length); i++) {
          const e = board[i];
          const ry = ly + 44 + i * 24;
          ctx.textAlign = 'right';
          ctx.fillStyle = CONFIG.textSecondary;
          ctx.font = `700 15px ${FONT}`;
          ctx.fillText(`${i + 1}.`, lx - 160, ry);
          ctx.textAlign = 'left';
          ctx.fillStyle = CONFIG.textPrimary;
          ctx.fillText(e.name, lx - 146, ry);
          ctx.textAlign = 'right';
          ctx.fillStyle = CONFIG.player.glowColor;
          ctx.fillText(String(e.score), lx + 160, ry);
        }
        ctx.textAlign = 'center';
      }

      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ZQSD / flèches : bouger   ·   tir auto   ·   [O] Options   ·   [P] Pause   ·   [M] Muet', vw / 2, vh - 28);

      if (options) options.render(Render);
    },
  };
}
