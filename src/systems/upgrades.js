// upgrades.js — définitions d'upgrades (data-driven) + tirage de 3 choix.
// Chaque choix expose { id, name, desc, color, apply(world) }. Extensible :
// il suffit d'ajouter une entrée dans STAT ou une arme dans config.weapons.

import { CONFIG } from '../config.js';

// Upgrades de statistiques (répétables sauf condition `avail`).
const STAT = [
  { id: 'dmg', name: 'Surcharge', desc: '+25% dégâts', color: '#ff4d00', apply: (w) => (w.player.mods.damageMul *= 1.25) },
  { id: 'rate', name: 'Cadence', desc: '+18% cadence de tir', color: '#ff8a00', apply: (w) => (w.player.mods.rateMul *= 1.18) },
  {
    id: 'proj',
    name: 'Multi-tir',
    desc: '+1 projectile',
    color: '#ffd000',
    weight: 1.1,
    avail: (w) => w.player.mods.projAdd < 4,
    apply: (w) => (w.player.mods.projAdd += 1),
  },
  { id: 'move', name: 'Célérité', desc: '+12% vitesse de déplacement', color: '#00e5ff', apply: (w) => (w.player.mods.moveMul *= 1.12) },
  { id: 'collect', name: 'Aimant', desc: '+35% rayon de collecte', color: '#18ffd5', apply: (w) => (w.player.mods.collectMul *= 1.35) },
  { id: 'area', name: 'Amplitude', desc: "+20% zone d'effet", color: '#b14dff', apply: (w) => (w.player.mods.areaMul *= 1.2) },
  {
    id: 'maxhp',
    name: 'Vitalité',
    desc: '+25 PV max & soin',
    color: '#2bff88',
    apply: (w) => {
      w.player.maxHp += 25;
      w.player.hp += 25;
    },
  },
  {
    id: 'heal',
    name: 'Réparation',
    desc: '+45 PV',
    color: '#b6ff3c',
    weight: 0.8,
    avail: (w) => w.player.hp < w.player.maxHp,
    apply: (w) => (w.player.hp = Math.min(w.player.maxHp, w.player.hp + 45)),
  },
];

const NEW_WEAPON_DESC = {
  onde: 'Nouvelle arme — transperce les ennemis',
  orbital: 'Nouvelle arme — orbes tournants',
  nova: 'Nouvelle arme — explosion périodique',
};

// Tirage pondéré sans remise.
function sample(cands, n, rng) {
  const pool = cands.slice();
  const out = [];
  n = Math.min(n, pool.length);
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (const c of pool) total += c.weight || 1;
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight || 1;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export function rollChoices(world, n = 3) {
  const cand = [];

  for (const u of STAT) {
    if (!u.avail || u.avail(world)) cand.push(u);
  }

  // Déblocage d'armes non possédées (si un emplacement est libre).
  if (world.weapons.list.length < CONFIG.maxWeapons) {
    for (const key of ['onde', 'orbital', 'nova']) {
      if (world.weapons.has(key)) continue;
      cand.push({
        id: 'w_' + key,
        name: CONFIG.weapons[key].name,
        desc: NEW_WEAPON_DESC[key],
        color: CONFIG.weapons[key].color,
        weight: 1.7,
        apply: (w) => w.weapons.add(key),
      });
    }
  }

  // Montée de niveau des armes possédées.
  for (const wp of world.weapons.list) {
    if (wp.level >= CONFIG.maxWeaponLevel) continue;
    cand.push({
      id: 'lvl_' + wp.key,
      name: `${wp.def.name} ${'+'.repeat(Math.min(wp.level, 5))}`,
      desc: `Améliore l'arme (niveau ${wp.level + 1})`,
      color: wp.def.color,
      weight: 1.2,
      apply: (w) => w.weapons.add(wp.key),
    });
  }

  return sample(cand, n, world.rng);
}
