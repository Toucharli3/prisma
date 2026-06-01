# PRISMA — Design doc & état d'avancement

Survival-arène top-down en vue **néon vectorielle**. Le monde a été vidé de sa
couleur par *le Statique* ; le joueur (*le Prisme*) restaure la couleur en
détruisant des ennemis. Objectif d'un niveau : **100 % de couleur restaurée**.

## Comment lancer

```bash
npm install
npm run dev      # serveur de dev (ouvre le navigateur)
npm run build    # build de production -> dist/
npm run preview  # prévisualise le build
```

## Stack

- **Vite** (vanilla, ES modules), **Canvas 2D** uniquement (pas de WebGL/framework).
- **Web Audio API** : SFX + musique 100 % procéduraux (aucun fichier externe).
- **localStorage** pour la sauvegarde.

## Contraintes de perf (machine bas de gamme, GPU intégré — 60 fps non négociable)

- Boucle **timestep fixe** (`engine/loop.js`) + interpolation au rendu.
- **Pas de `ctx.shadowBlur` par frame** : halos pré-rendus en offscreen, puis blit.
- **Object pooling** (projectiles, particules, orbes, ennemis).
- **Spatial hash** pour les collisions (pas de O(n²)).
- Plafonds sur particules / ennemis ; DPR plafonné à 1.5.
- Calques statiques (grille) pré-rendus.

## Architecture

- `src/config.js` — **toutes** les constantes (DA, palettes, équilibrage).
- `src/main.js` — bootstrap, contexte `app`, machine à états des scènes, boucle.
- `src/engine/` — `loop`, `input`, `render` (+ `audio`, `pool`, `grid`,
  `particles`, `save`, `math`).
- `src/entities/` — `player`, `enemy`, `bullet`, `orb`, `boss`.
- `src/systems/` — `spawner`, `upgrades`, `colorfield`, `weapons`.
- `src/scenes/` — `menu`, `game`, `upgrade`, `pause`, `gameover`, `victory`.
- `src/ui/` — `hud`, `widgets`.

Les scènes implémentent `enter / update(dt) / render(ctx, alpha) / exit`.

## État d'avancement

- [x] **Phase 0 — Setup** : Vite, canvas plein écran responsive, boucle timestep
      fixe, grille de fond pré-rendue, overlay FPS.
- [x] **Phase 1 — Joueur & déplacement** : entité joueur (cœur + halo cyan +
      traînée comète), input 8 directions normalisé, caméra qui suit, cache de
      glow offscreen (`Render.glowSprite` / `softDot` / `drawSprite`).
- [x] **Phase 2 — Ennemis & collisions** : object pool générique, spatial hash,
      ennemis triangle/carré qui poursuivent + séparation, PV joueur + dégâts de
      contact + i-frames, mort → Game Over basique. (`window.__prisma` = handle debug)
- [ ] Phase 3 — Armes & combat
- [ ] Phase 4 — XP, niveaux, upgrades
- [ ] Phase 5 — Restauration de couleur & objectif
- [ ] Phase 6 — Multi-niveaux & boss
- [ ] Phase 7 — Audio
- [ ] Phase 8 — Polish & juice
- [ ] Phase 9 — Méta-progression & optimisation finale
