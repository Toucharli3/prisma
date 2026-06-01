// weapons.js — définitions (data-driven dans config.js) + logique de tir.
// Phase 3 : arme « Éclat » (projectile auto-aim). Étendu en Phase 4 (Onde,
// Orbital, Nova) et Phase 8 (visée souris).

import { CONFIG } from '../config.js';

// Ennemi le plus proche du joueur (auto-aim). O(n) — suffisant pour nos densités.
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
  return best;
}

export function createWeapons(world) {
  const list = [];

  // Stats effectives d'une arme à un niveau donné (Phase 4 affine la montée).
  function stats(def, level) {
    const lv = level - 1;
    return {
      cooldown: def.cooldown * Math.pow(0.9, lv), // +cadence par niveau
      damage: def.damage * (1 + 0.35 * lv), // +dégâts par niveau
      speed: def.speed,
      bulletRadius: def.bulletRadius,
      life: def.life,
      pierce: def.pierce + (def.piercePerLevel ? lv * def.piercePerLevel : 0),
      count: def.count + (def.countPerLevel ? Math.floor(lv * def.countPerLevel) : 0),
      spread: def.spread,
      color: def.color,
      kind: def.kind,
    };
  }

  function aimAngle(world) {
    const p = world.player;
    if (p.aimMode === 'mouse') {
      const m = world.mouseWorld;
      if (m) return Math.atan2(m.y - p.y, m.x - p.x);
    }
    const t = nearestEnemy(world);
    if (!t) return null;
    return Math.atan2(t.y - p.y, t.x - p.x);
  }

  function fireProjectile(w, world) {
    const p = world.player;
    const ang = aimAngle(world);
    if (ang == null) return false; // pas de cible -> ne pas consommer le cooldown

    const count = w.count + p.mods.projAdd;
    const dmg = w.damage * p.mods.damageMul;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * w.spread : 0;
      const a = ang + off;
      world.bullets
        .obtain()
        .init(p.x, p.y, Math.cos(a) * w.speed, Math.sin(a) * w.speed, {
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

  function fire(w, world) {
    // Le switch sur `kind` prépare les armes non-projectiles (Phase 4).
    switch (w.kind) {
      case 'projectile':
      default:
        return fireProjectile(w, world);
    }
  }

  return {
    list,

    reset() {
      list.length = 0;
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
      const w = { key, def, level: 1, timer: 0, ...stats(def, 1) };
      list.push(w);
      return w;
    },

    update(dt) {
      const rate = world.player.mods.rateMul;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        w.timer -= dt;
        if (w.timer <= 0 && fire(w, world)) w.timer = w.cooldown / rate;
      }
    },
  };
}
