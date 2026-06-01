// options.js — overlay d'options réutilisable (menu et pause). Navigation au
// clavier : haut/bas pour choisir, gauche/droite pour régler, Échap/O pour fermer.
// Modifie directement les réglages (CONFIG.aimMode, CONFIG.perf, volumes Audio).

import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { CONFIG } from '../config.js';
import { clamp } from '../engine/math.js';
import { roundRect, fillBar } from '../ui/widgets.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

export function createOptionsOverlay(onClose, onQuitMenu) {
  let sel = 0;

  const items = [
    { label: 'Visée', value: () => (CONFIG.aimMode === 'auto' ? 'Automatique' : 'Souris'), change: () => (CONFIG.aimMode = CONFIG.aimMode === 'auto' ? 'mouse' : 'auto') },
    { label: 'Mode performance', value: () => (CONFIG.perf ? 'Activé' : 'Désactivé'), change: () => (CONFIG.perf = !CONFIG.perf) },
    { label: 'Volume musique', bar: () => Audio.musicVol, value: () => `${Math.round(Audio.musicVol * 100)}%`, change: (d) => Audio.setMusicVol(clamp(Audio.musicVol + d * 0.1, 0, 1)) },
    { label: 'Volume effets', bar: () => Audio.sfxVol, value: () => `${Math.round(Audio.sfxVol * 100)}%`, change: (d) => Audio.setSfxVol(clamp(Audio.sfxVol + d * 0.1, 0, 1)) },
    { label: 'Son', value: () => (Audio.muted ? 'Muet' : 'Activé'), change: () => Audio.toggleMute() },
  ];
  if (onQuitMenu) items.push({ label: 'Quitter vers le menu', action: onQuitMenu, danger: true });

  return {
    update() {
      if (Input.pressed('ArrowUp', 'KeyW', 'KeyZ')) {
        sel = (sel - 1 + items.length) % items.length;
        Audio.uiMove();
      }
      if (Input.pressed('ArrowDown', 'KeyS')) {
        sel = (sel + 1) % items.length;
        Audio.uiMove();
      }
      const it = items[sel];
      if (it.change && Input.pressed('ArrowLeft', 'KeyA', 'KeyQ')) {
        it.change(-1);
        Audio.uiMove();
      }
      if (it.change && Input.pressed('ArrowRight', 'KeyD')) {
        it.change(1);
        Audio.uiMove();
      }
      if (Input.pressed('Enter')) {
        Audio.uiSelect();
        if (it.action) it.action();
        else if (it.change) it.change(1);
      }
      if (Input.pressed('Escape', 'KeyO')) {
        Audio.uiSelect();
        onClose();
      }
    },

    render(R) {
      const ctx = R.ctx;
      const vw = R.viewW;
      const vh = R.viewH;
      ctx.fillStyle = 'rgba(8,8,14,0.8)';
      ctx.fillRect(0, 0, vw, vh);

      const pw = Math.min(520, vw - 60);
      const px = (vw - pw) / 2;
      const rowH = 52;
      const py = vh / 2 - (items.length * rowH) / 2 - 20;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.textPrimary;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText('OPTIONS', vw / 2, py - 44);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const y = py + i * rowH;
        const on = i === sel;
        if (on) {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          roundRect(ctx, px - 14, y - rowH / 2 + 4, pw + 28, rowH - 8, 10);
          ctx.fill();
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = it.danger ? CONFIG.danger : on ? CONFIG.player.glowColor : CONFIG.textPrimary;
        ctx.font = `600 18px ${FONT}`;
        ctx.fillText(it.label, px, y);

        ctx.textAlign = 'right';
        if (it.bar) {
          fillBar(ctx, px + pw - 150, y - 5, 110, 10, it.bar(), CONFIG.player.glowColor);
          ctx.fillStyle = CONFIG.textSecondary;
          ctx.font = `600 14px ${FONT}`;
          ctx.fillText(it.value(), px + pw, y);
        } else if (it.value) {
          ctx.fillStyle = CONFIG.textSecondary;
          ctx.font = `600 16px ${FONT}`;
          ctx.fillText(`‹ ${it.value()} ›`, px + pw, y);
        }
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = CONFIG.textSecondary;
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText('↑↓ choisir   ‹ › régler   Échap / O fermer', vw / 2, py + items.length * rowH + 14);
    },
  };
}
