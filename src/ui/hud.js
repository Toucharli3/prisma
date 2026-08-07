// hud.js — interface en jeu : barre d'XP + niveau, jauge de couleur (objectif),
// chrono, barre de PV. (Combo & vague ajoutés en Phases 6/8.) Espace écran.

import { CONFIG } from '../config.js';
import { hexA, TAU, fmtInt } from '../engine/math.js';
import { roundRect, fillBar } from './widgets.js';
import { FONT } from './fonts.js';


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

  // Jauge PRISMA (ulti) — haut-centre. Pleine = Burst déclenchable (R).
  const gw = Math.min(440, vw * 0.5);
  const gx = (vw - gw) / 2;
  const gy = 28;
  const gh = 18;
  const charged = world.colorfield.percent >= 1;
  drawColorGauge(ctx, gx, gy, gw, gh, world.colorfield.percent, world.palette);
  if (charged) {
    // Liseré blanc pulsant quand prête.
    ctx.strokeStyle = hexA('#ffffff', 0.5 + 0.5 * Math.sin(world.time * 9));
    ctx.lineWidth = 2;
    roundRect(ctx, gx - 2, gy - 2, gw + 4, gh + 4, (gh + 4) / 2);
    ctx.stroke();
  }
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.font = `800 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (world.overchargeT > 0) ctx.fillText(`⚡ SURCHARGE ${world.overchargeT.toFixed(1)}s`, vw / 2, gy + gh / 2);
  else ctx.fillText(charged ? '✦ PRISMA PRÊT — R ✦' : `PRISMA ${Math.floor(world.colorfield.percent * 100)}%`, vw / 2, gy + gh / 2);

  // Ligne biome / palier / niveau, posée sur un fond assombri : au-dessus du
  // champ de couleur saturé, le gris secondaire devenait illisible.
  const info = `${world.palette.name.toUpperCase()} · PALIER ${world.tier + 1} · NIV ${world.level}`;
  ctx.font = `700 12px ${FONT}`;
  const iw = ctx.measureText(info).width + 20;
  ctx.fillStyle = 'rgba(8,8,16,0.55)';
  roundRect(ctx, vw / 2 - iw / 2, gy + gh + 4, iw, 19, 9.5);
  ctx.fill();
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.textBaseline = 'top';
  ctx.fillText(info, vw / 2, gy + gh + 8);

  // Avertissement de pic (télégraphe) + flash de palier.
  if (world.telegraph) {
    ctx.fillStyle = hexA(CONFIG.danger, 0.5 + 0.5 * Math.sin(world.time * 18));
    ctx.font = `800 22px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠ VAGUE !', vw / 2, vh * 0.2);
  } else if (world.tierFlash > 0) {
    ctx.fillStyle = hexA(world.palette.colors[2], Math.min(1, world.tierFlash));
    ctx.font = `800 30px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`PALIER ${world.tier + 1}`, vw / 2, vh * 0.2);
  }

  // Combo (centre) — apparaît à partir de ×3, avec un pop quand récent.
  if (world.combo >= 3) {
    const pulse = 1 + 0.3 * Math.max(0, world.comboTimer / CONFIG.comboWindow - 0.6);
    ctx.save();
    ctx.translate(vw / 2, 106);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = world.palette.colors[2];
    ctx.font = `900 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`×${world.combo}`, 0, 0);
    ctx.restore();
  }

  // Chrono + score (haut-droite).
  const t = world.time;
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(`${mm}:${ss.toString().padStart(2, '0')}`, vw - 16, 12);
  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.fillText(`SCORE ${fmtInt(world.score)}`, vw - 16, 32);

  // Jauge de dash (bas-centre). Cooldown effectif (Réflexe).
  const dr = 1 - Math.max(0, p.dashCd) / (CONFIG.dash.cooldown * (p.mods.dashCdMul || 1));
  const dbw = 130;
  const dbx = (vw - dbw) / 2;
  const dby = vh - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, dbx, dby, dbw, 8, 4);
  ctx.fill();
  ctx.fillStyle = dr >= 1 ? CONFIG.player.glowColor : 'rgba(180,180,200,0.55)';
  roundRect(ctx, dbx, dby, dbw * dr, 8, 4);
  ctx.fill();
  ctx.fillStyle = dr >= 1 ? CONFIG.textPrimary : CONFIG.textSecondary;
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(dr >= 1 ? 'DASH ⟫ ESPACE' : 'DASH', vw / 2, dby - 3);

  // Bombes de couleur (compétence active, touche E).
  const nb = p.bombs || 0;
  ctx.fillStyle = nb > 0 ? world.palette.colors[2] : 'rgba(180,180,200,0.4)';
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`BOMBE ⟫ E  ×${nb}`, vw / 2, dby - 18);

  // Mini-carte (haut-gauche).
  drawMinimap(ctx, world);

  // Panneau ÉQUIPEMENT (bas-droite) : stats d'améliorations + armes + PV.
  drawStatsCard(ctx, vw, vh, world);

  if (CONFIG.debug) {
    ctx.fillStyle = CONFIG.textSecondary;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`ennemis:${world.enemies.count} tirs:${world.bullets.count} orbes:${world.orbs.count} kills:${world.kills}`, 16, vh - 14);
  }
}

// Carte d'état en bas à droite : multiplicateurs d'upgrades chiffrés, armes & PV.
function drawStatsCard(ctx, vw, vh, world) {
  const p = world.player;
  const m = p.mods;
  const rows = [
    ['Dégâts', '×' + m.damageMul.toFixed(2), '#ff6a3d'],
    ['Cadence', '×' + m.rateMul.toFixed(2), '#ff9a3d'],
    ['Projectiles', '+' + m.projAdd, '#ffd34d'],
    ['Vitesse', '×' + m.moveMul.toFixed(2), '#4dd6ff'],
    ["Zone d'effet", '×' + m.areaMul.toFixed(2), '#c46dff'],
    ['Collecte', '×' + m.collectMul.toFixed(2), '#4dffd0'],
  ];
  // Armes au niveau max pas encore évoluées : on affiche le passif qu'il reste
  // à obtenir, sinon la synergie serait invisible — donc juste frustrante.
  const pending = world.weapons.list.filter((w) => w.level >= CONFIG.maxWeaponLevel && !w.evolved && CONFIG.evolutions[w.key]).slice(0, 3);

  const cw = 226;
  const cx = vw - 12 - cw;
  const rowH = 16;
  const headH = 18;
  // head + stats + ARMES + 2 lignes de pastilles + synergies + PV
  const ch = 12 + headH + rows.length * rowH + 16 + 34 + (pending.length ? 6 + pending.length * 14 : 0) + 26 + 10;
  const cy = vh - 12 - ch;

  ctx.fillStyle = 'rgba(12,12,22,0.66)';
  roundRect(ctx, cx, cy, cw, ch, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, cx, cy, cw, ch, 12);
  ctx.stroke();

  let yy = cy + 12 + 9;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('ÉQUIPEMENT', cx + 12, yy);
  yy += headH;

  ctx.font = `600 12px ${FONT}`;
  for (const [label, val, col] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.textPrimary;
    ctx.fillText(label, cx + 12, yy);
    ctx.textAlign = 'right';
    ctx.fillStyle = col;
    ctx.fillText(val, cx + cw - 12, yy);
    yy += rowH;
  }

  yy += 4;
  ctx.textAlign = 'left';
  ctx.fillStyle = CONFIG.textSecondary;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('ARMES', cx + 12, yy);
  yy += 15;

  ctx.font = `700 11px ${FONT}`;
  let chx = cx + 12;
  for (const wp of world.weapons.list) {
    const t = `${wp.def.name} ${wp.level}`;
    const wdt = ctx.measureText(t).width + 12;
    if (chx + wdt > cx + cw - 8) {
      chx = cx + 12;
      yy += 17;
    }
    ctx.fillStyle = hexA(wp.def.color, 0.22);
    roundRect(ctx, chx, yy - 8, wdt, 16, 5);
    ctx.fill();
    ctx.fillStyle = wp.def.color;
    ctx.textAlign = 'left';
    ctx.fillText(t, chx + 6, yy);
    chx += wdt + 5;
  }

  // Synergies : ★ doré = évolution débloquée au prochain niveau, ○ gris = il
  // manque encore le passif indiqué.
  if (pending.length) {
    yy += 20;
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'left';
    for (const wp of pending) {
      const evo = CONFIG.evolutions[wp.key];
      const ok = !evo.req || evo.req(world);
      ctx.fillStyle = ok ? '#ffd700' : 'rgba(175,175,200,0.55)';
      ctx.fillText(`${ok ? '★' : '○'} ${evo.name} · ${evo.hint || ''}`, cx + 12, yy);
      yy += 14;
    }
  }

  // Barre de PV en bas de la carte.
  const hpY = cy + ch - 22;
  const frac = Math.max(0, p.hp / p.maxHp);
  fillBar(ctx, cx + 12, hpY, cw - 24, 16, frac, frac > 0.3 ? CONFIG.player.glowColor : CONFIG.danger);
  ctx.fillStyle = CONFIG.textPrimary;
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp} PV`, cx + cw / 2, hpY + 8);
}

// Mini-carte (haut-gauche) : joueur, ennemis, boss.
function drawMinimap(ctx, world) {
  const a = CONFIG.arena;
  const mw = 132;
  const mh = Math.round((mw * a.height) / a.width);
  const mx = 12;
  const my = 12;
  ctx.fillStyle = 'rgba(10,10,20,0.5)';
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.stroke();

  const sx = mw / a.width;
  const sy = mh / a.height;
  // Ennemis.
  ctx.fillStyle = 'rgba(180,180,200,0.8)';
  world.enemies.forEach((e) => ctx.fillRect(mx + e.x * sx - 1, my + e.y * sy - 1, 2, 2));
  // Boss.
  if (world.boss) {
    ctx.fillStyle = CONFIG.danger;
    ctx.fillRect(mx + world.boss.x * sx - 3, my + world.boss.y * sy - 3, 6, 6);
  }
  // Joueur.
  const p = world.player;
  ctx.fillStyle = p.glowColor || CONFIG.player.glowColor;
  ctx.beginPath();
  ctx.arc(mx + p.x * sx, my + p.y * sy, 3, 0, TAU);
  ctx.fill();
}
