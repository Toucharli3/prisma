// weapons.js — définitions (data-driven dans config.js) + logique de tir.
// 3 familles (`kind`) :
//   - projectile : tire des balles auto-aim (Éclat, Onde)
//   - orbital    : entretient des orbes tournant autour du joueur (dégâts contact)
//   - nova       : explosion de zone périodique
// Les dégâts de contact (orbital/nova) sont appliqués depuis la scène, avec la
// grille spatiale à jour, via applyContactDamage(damageEnemyFn).

import { CONFIG } from '../config.js';
import { TAU, hexA } from '../engine/math.js';

const ORBITAL_HIT_CD = 0.35; // intervalle de dégâts orbital par ennemi
const NODE_QUERY_PAD = 24;

function nearestEnemy(world) {
  let best = null;
  let bd = Infinity;
  const px = world.player.x;
  const py = world.player.y;
  world.enemies.forEach((e) => {
    const dx = e.x - px;
    const dy = e.y - py;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  // Le boss est aussi une cible valide (sinon l'auto-aim l'ignorerait).
  if (world.boss) {
    const dx = world.boss.x - px;
    const dy = world.boss.y - py;
    const d = dx * dx + dy * dy;
    if (d < bd) best = world.boss;
  }
  return best;
}

export function createWeapons(world) {
  const list = [];
  const novas = []; // explosions actives (visuel + dégâts)
  const chains = []; // éclairs Foudre actifs (visuel) : { pts:[{x,y}], life }
  const beams = []; // rayons Faisceau actifs (visuel) : { x1,y1,x2,y2,color,life }

  // Stats effectives d'une arme à un niveau donné.
  function stats(def, level) {
    const lv = level - 1;
    return {
      ...def,
      cooldown: def.cooldown != null ? def.cooldown * Math.pow(0.92, lv) : 0,
      damage: def.damage * (1 + 0.3 * lv),
      count: (def.count || 1) + (def.countPerLevel ? Math.floor(lv * def.countPerLevel) : 0),
      pierce: (def.pierce || 0) + (def.piercePerLevel ? lv * def.piercePerLevel : 0),
      chainCount: (def.chainCount || 0) + (def.countPerLevel ? Math.floor(lv * def.countPerLevel) : 0),
      spread: def.spread || 0,
    };
  }

  function aimAngle() {
    const p = world.player;
    if (p.aimMode === 'mouse' && world.mouseWorld) {
      return Math.atan2(world.mouseWorld.y - p.y, world.mouseWorld.x - p.x);
    }
    const t = nearestEnemy(world);
    if (!t) return null;
    return Math.atan2(t.y - p.y, t.x - p.x);
  }

  function fireProjectile(w) {
    const p = world.player;
    const ang = aimAngle();
    if (ang == null) return false; // pas de cible -> ne pas consommer le cooldown
    const count = w.count + p.mods.projAdd;
    const dmg = w.damage * p.mods.damageMul;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * w.spread : 0;
      const a = ang + off;
      world.bullets.obtain().init(p.x, p.y, Math.cos(a) * w.speed, Math.sin(a) * w.speed, {
        damage: dmg,
        radius: w.bulletRadius,
        life: w.life,
        pierce: w.pierce,
        color: w.color,
      });
    }
    if (world.onFire) world.onFire(w);
    return true;
  }

  function triggerNova(w) {
    const p = world.player;
    const r = w.radius * p.mods.areaMul;
    novas.push({
      x: p.x,
      y: p.y,
      r: 0,
      maxR: r,
      life: 0.45,
      maxLife: 0.45,
      damage: w.damage * p.mods.damageMul,
      color: w.color,
      pending: true, // dégâts aux ennemis (grille) appliqués une fois
      bossHit: false, // dégâts au boss appliqués une fois
    });
    if (world.onNova) world.onNova(w);
  }

  // Foudre : frappe la cible la plus proche puis rebondit sur les voisins.
  function doChain(w, damageEnemy) {
    const p = world.player;
    const dmg = w.damage * p.mods.damageMul;
    const count = Math.max(1, w.chainCount + p.mods.projAdd);
    const range2 = (w.chainRange || 240) ** 2;
    const hit = [];
    const pts = [{ x: p.x, y: p.y }];
    let cx = p.x;
    let cy = p.y;
    for (let j = 0; j < count; j++) {
      let best = null;
      let bd = range2;
      world.enemies.forEach((e) => {
        if (!e.alive || hit.indexOf(e) >= 0) return;
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = e;
        }
      });
      if (!best) break;
      hit.push(best);
      pts.push({ x: best.x, y: best.y });
      cx = best.x;
      cy = best.y;
      damageEnemy(best, dmg);
    }
    if (pts.length > 1) chains.push({ pts, color: w.color, life: 0.13 });
  }

  // Faisceau : rayon instantané qui traverse tous les ennemis sur une ligne.
  function doBeam(w, damageEnemy) {
    const p = world.player;
    const ang = aimAngle();
    if (ang == null) return;
    const dmg = w.damage * p.mods.damageMul;
    const len = w.beamLength || 520;
    const halfW = (w.beamWidth || 18) / 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    world.enemies.forEach((e) => {
      if (!e.alive) return;
      const rx = e.x - p.x;
      const ry = e.y - p.y;
      const t = rx * dx + ry * dy; // projection sur l'axe
      if (t < 0 || t > len) return;
      const perp = Math.abs(rx * -dy + ry * dx);
      if (perp <= halfW + e.radius) damageEnemy(e, dmg);
    });
    beams.push({ x1: p.x, y1: p.y, x2: p.x + dx * len, y2: p.y + dy * len, color: w.color, life: 0.1 });
  }

  return {
    list,
    novas,

    reset() {
      list.length = 0;
      novas.length = 0;
      chains.length = 0;
      beams.length = 0;
    },

    has(key) {
      return list.some((w) => w.key === key);
    },

    // Ajoute une arme ou la monte d'un niveau si déjà présente.
    add(key) {
      const def = CONFIG.weapons[key];
      if (!def) return null;
      const existing = list.find((w) => w.key === key);
      if (existing) {
        existing.level++;
        Object.assign(existing, stats(def, existing.level));
        return existing;
      }
      const w = { key, def, level: 1, timer: def.cooldown ? 0 : 0, angle: 0, ...stats(def, 1) };
      list.push(w);
      return w;
    },

    update(dt) {
      const p = world.player;
      const rate = p.mods.rateMul;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        if (w.kind === 'orbital') {
          w.angle += w.rotSpeed * dt;
          continue;
        }
        if (w.kind === 'nova') {
          w.timer -= dt;
          if (w.timer <= 0) {
            w.timer = w.cooldown / rate;
            triggerNova(w);
          }
          continue;
        }
        if (w.kind === 'chain' || w.kind === 'beam') {
          w.timer -= dt;
          if (w.timer <= 0) {
            w.pending = true; // dégâts appliqués dans applyContactDamage (grille à jour)
            w.timer = w.cooldown / rate;
          }
          continue;
        }
        // projectile
        w.timer -= dt;
        if (w.timer <= 0 && fireProjectile(w)) w.timer = w.cooldown / rate;
      }

      for (let i = novas.length - 1; i >= 0; i--) {
        const nv = novas[i];
        nv.life -= dt;
        nv.r = nv.maxR * (1 - nv.life / nv.maxLife);
        if (nv.life <= 0) novas.splice(i, 1);
      }
      for (let i = chains.length - 1; i >= 0; i--) if ((chains[i].life -= dt) <= 0) chains.splice(i, 1);
      for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].life -= dt) <= 0) beams.splice(i, 1);
    },

    // Applique les dégâts de contact (orbital + nova), grille à jour.
    applyContactDamage(damageEnemy) {
      const p = world.player;
      const grid = world.grid;

      for (const w of list) {
        if (w.kind !== 'orbital') continue;
        const R = w.radius * p.mods.areaMul;
        const dmg = w.damage * p.mods.damageMul;
        for (let i = 0; i < w.count; i++) {
          const a = w.angle + (i * TAU) / w.count;
          const nx = p.x + Math.cos(a) * R;
          const ny = p.y + Math.sin(a) * R;
          grid.queryCircle(nx, ny, w.nodeRadius + NODE_QUERY_PAD, (e) => {
            if (!e.alive || e.orbitalCd > 0) return;
            const rr = w.nodeRadius + e.radius;
            const dx = e.x - nx;
            const dy = e.y - ny;
            if (dx * dx + dy * dy <= rr * rr) {
              damageEnemy(e, dmg);
              e.orbitalCd = ORBITAL_HIT_CD;
            }
          });
        }
      }

      for (const nv of novas) {
        if (!nv.pending) continue;
        nv.pending = false;
        const r2 = nv.maxR * nv.maxR;
        grid.queryCircle(nv.x, nv.y, nv.maxR, (e) => {
          if (!e.alive) return;
          const dx = e.x - nv.x;
          const dy = e.y - nv.y;
          if (dx * dx + dy * dy <= r2) damageEnemy(e, nv.damage);
        });
      }

      // Foudre / Faisceau (déclenchés ce frame ; touchent les ennemis, pas le boss).
      for (const w of list) {
        if (w.kind === 'chain' && w.pending) {
          w.pending = false;
          doChain(w, damageEnemy);
        } else if (w.kind === 'beam' && w.pending) {
          w.pending = false;
          doBeam(w, damageEnemy);
        }
      }
    },

    // Itère les positions monde des orbes orbitaux (pour collisions hors grille,
    // ex. le boss). cb(x, y, nodeRadius, damage).
    forEachOrbitalNode(cb) {
      const p = world.player;
      for (const w of list) {
        if (w.kind !== 'orbital') continue;
        const R = w.radius * p.mods.areaMul;
        const dmg = w.damage * p.mods.damageMul;
        for (let i = 0; i < w.count; i++) {
          const a = w.angle + (i * TAU) / w.count;
          cb(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, w.nodeRadius, dmg);
        }
      }
    },

    // Rendu des orbes orbitaux + anneaux de nova (centre = joueur interpolé).
    render(R, px, py) {
      const p = world.player;
      const ctx = R.ctx;

      R.additive();
      for (const w of list) {
        if (w.kind !== 'orbital') continue;
        const Rr = w.radius * p.mods.areaMul;
        for (let i = 0; i < w.count; i++) {
          const a = w.angle + (i * TAU) / w.count;
          R.drawSprite(R.glowSprite('#ffffff', w.color, w.nodeRadius, 2.2), px + Math.cos(a) * Rr, py + Math.sin(a) * Rr);
        }
      }
      for (const nv of novas) {
        const a = nv.life / nv.maxLife; // 1 -> 0
        ctx.strokeStyle = hexA(nv.color, a * 0.9);
        ctx.lineWidth = 5 * a + 2;
        ctx.beginPath();
        ctx.arc(nv.x, nv.y, nv.r, 0, TAU);
        ctx.stroke();
      }
      ctx.lineCap = 'round';
      for (const c of chains) {
        ctx.strokeStyle = hexA(c.color, c.life / 0.13);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.pts[0].x, c.pts[0].y);
        for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
        ctx.stroke();
      }
      for (const bm of beams) {
        const a = bm.life / 0.1;
        ctx.strokeStyle = hexA(bm.color, a * 0.85);
        ctx.lineWidth = 8 * a + 3;
        ctx.beginPath();
        ctx.moveTo(bm.x1, bm.y1);
        ctx.lineTo(bm.x2, bm.y2);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      R.normal();
    },
  };
}
