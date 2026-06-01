// hud.js — interface en jeu : barre d'XP + niveau, jauge de couleur (objectif),
// chrono, barre de PV. (Combo & vague ajoutés en Phases 6/8.) Espace écran.

import { CONFIG } from '../config.js';
import { roundRect, fillBar } from './widgets.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

function drawColorGauge(ctx, x, y, w, h, percent, palette) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  const fw = Math.max(0, Math.min(1, percent)) * w;
  if (fw > 1) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, palette.colors[0]);
    g.addColorStop(0.5, palette.colors[1]);
    g.addColorStop(1, palette.colors[2]);
    ctx.fillStyle = g;
    roundRect(ctx, x, y, Math.max(fw, h), h, h / 2);
    ctx.fill();
  }
}

export function drawHud(R, world) {
  const ctx = R.ctx;
  const vw = R.viewW;
  const vh = R.viewH;
  const p = world.player;

  // Barre d'XP (tout en haut, fine, pleine largeur).
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  fillBar(ctx, 150, 12, vw - 300, 6, world.xp / world.xpNext, CONFIG.player.glowColor);

  // Jauge de couleur (objectif) — haut-centre, proéminente.
  const gw = Math.min(440, vw * 0.5);
  const gx = (vw - gw) / 2;
  const gy = 28;
  const gh = 18;
  drawColorGauge(ctx, gx, gy, gw, gh, world.colorfield.percent, world.palette);
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.font = `800 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`COULEUR ${Math.floor(world.colorfield.percent * 100)}%`, vw / 2, gy + gh / 2);

  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = `700 12px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(`${world.palette.name.toUpperCase()} · NIVEAU ${world.level}`, vw / 2, gy + gh + 7);

  // Chrono (haut-droite).
  const t = world.time;
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60);
  ctx.textAlign = 'right';
  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(`${mm}:${ss.toString().padStart(2, '0')}`, vw - 16, 12);

  // Barre de PV (bas-gauche).
  const y = vh - 34;
  const frac = Math.max(0, p.hp / p.maxHp);
  fillBar(ctx, 16, y, 280, 16, frac, frac > 0.3 ? CONFIG.player.glowColor : CONFIG.danger);
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`, 24, y + 8);

  if (CONFIG.debug) {
    ctx.fillStyle = CONFIG.textSecondary;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `ennemis:${world.enemies.count} tirs:${world.bullets.count} orbes:${world.orbs.count} kills:${world.kills}`,
      vw - 16,
      34
    );
  }
}
