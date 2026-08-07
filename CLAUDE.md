# PRISMA — Design doc & état d'avancement

Survival-arène top-down en vue **néon vectorielle**. Le monde a été vidé de sa
couleur par *le Statique* ; le joueur (*le Prisme*) restaure la couleur en
détruisant des ennemis. Chaque biome = **100 % de couleur** puis un **boss**.
Après les 5 biomes de campagne, le jeu continue en **mode SANS FIN** (difficulté
infinie, boss de plus en plus forts) : la **mort est la seule fin**, le **score**
sert au **classement** (en ligne via Vercel/Upstash, sinon local). Voir `DEPLOY.md`.

## Comment lancer

```bash
npm install
npm run dev      # serveur de dev (ouvre le navigateur)
npm run build    # build de production -> dist/
npm run preview  # prévisualise le build

node tools/balance.mjs   # audit d'équilibrage chiffré (aucune dépendance)
node tools/smoke.mjs URL # fumigation : joue une partie dans Chromium (npm i -D playwright)
```

**`tools/balance.mjs` est l'outil à lancer après TOUTE retouche d'équilibrage.**
Il importe `config.js` et la courbe de difficulté du jeu (jamais de recopie, donc
pas de dérive possible) et sort quatre tableaux : DPS par arme (mono-cible et
nuée, par niveau et évolution), valeur et plafond des upgrades, courbe de
difficulté, puis une simulation de partie complète. Les seuils y sont explicites :
écart entre armes ≤ ×2 par axe, mort visée entre 12 et 15 min.

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

- `src/config.js` — **toutes** les constantes (DA, palettes, équilibrage,
  directeur, hazards, bombe, burst, élites, évolutions).
- `src/main.js` — bootstrap, contexte `app`, machine à états des scènes, boucle.
- `src/engine/` — `loop`, `input` (clavier + souris + manette), `render`,
  `audio`, `pool`, `grid`, `particles`, `floaters`, `save`, `leaderboard`, `math`.
- `src/entities/` — `player`, `enemy`, `bullet`, `orb`, `boss`.
- `src/systems/` — `director` (rythme sans-fin), `upgrades`, `colorfield`,
  `weapons`, `backdrop`.
- `src/scenes/` — `menu`, `game`, `upgrade`, `pause`, `gameover`, `options`.
- `src/ui/` — `hud`, `widgets`, `nameInput`.
- `tools/` — outils hors jeu : `balance` (audit d'équilibrage), `smoke` (fumigation).

**Source unique de la difficulté** : `difficultyScales(time)` et `warmupFactor(time)`
sont exportées par `systems/director.js` et utilisées par le directeur, les boss
et l'outil d'audit. Ne jamais recopier ces formules ailleurs (elles l'étaient
dans `boss.js`, où toute correction divergeait en silence).

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
- [x] **Phase 3 — Armes & combat** : arme « Éclat » auto-aim, pool de projectiles,
      PV ennemis + mort, système de particules (SoA, ring buffer) → éclaboussure
      de couleur du biome. Collisions projectile→ennemi via grille spatiale.
- [x] **Phase 4 — XP, niveaux, upgrades** : orbes d'XP poolés (aimant + dérive
      douce), barre d'XP, montée de niveau + ralenti, écran 1-parmi-3 (clavier/souris),
      8 upgrades de stats + 3 armes (Onde/Orbital/Nova) data-driven, pause (P/Échap).
- [x] **Phase 5 — Restauration de couleur & objectif** : `colorfield.js` (champ
      basse résolution peint par les kills, upscalé + lissé en taches douces +
      teinte ambiante globale), jauge de couleur HUD (`ui/hud.js`), 100% = niveau
      terminé → overlay. Chaque kill « repeint » l'arène de la palette du biome.
- [x] **Phase 6 — Multi-niveaux & boss** : 5 biomes data-driven (palettes +
      difficulté croissante), pentagone tireur (+ projectiles ennemis), boss
      hexagone avec 3 patterns de tir (déclenché à ~78% et gate du 100%),
      enchaînement des niveaux (build conservé), écran de victoire final.
- [x] **Phase 7 — Audio** : `engine/audio.js` 100% procédural (Web Audio).
      SFX oscillateurs (tir, kill, ramassage, dégât, level-up, nova, boss, victoire,
      game over, UI) + boucle musicale synthé générative (scheduler lookahead).
      Contexte créé au 1er geste ; volumes réglables ; mute (touche M).
- [x] **Phase 8 — Polish & juice** : screen shake (trauma), chiffres de dégâts
      flottants, combo + score, vignette + scanlines (off en mode perf), menu
      principal animé (titre dégradé), transitions en fondu, visée souris,
      overlay d'options (visée, perf, volumes, mute) depuis menu et pause.
- [x] **Phase 9 — Méta-progression & optimisation finale** : sauvegarde
      localStorage (`engine/save.js` : highscore, biome atteint, victoires,
      armes de départ débloquées, réglages), passe d'équilibrage, profilage perf
      (≈3.8 ms/frame avec 150 ennemis → ~4× la marge 60 fps). `debug:false` (F3).
- [x] **Post-campagne — refonte sans fin** : la campagne 5 niveaux a été
      remplacée par un **mode sans fin rythmé** (`systems/director.js` : cycles
      montée → pic télégraphié → respiration, +1 palier/cycle, boss au pic).
      Ajouts : dash (i-frames), bombe de couleur (E), PRISMA BURST (R, jauge de
      couleur pleine → déflagration + surcharge), failles du Statique + météores,
      élites (aura + affixes), évolutions d'armes, 2 variantes de boss (phase 2
      enragée), skins débloquables, mini-carte, classement en ligne
      (Vercel/Upstash, repli local) avec pseudo. Manette complète (stick +
      dash/bombe/burst/pause). Projectiles ennemis à rendu distinct (`hostile`).

## Contrôles

- Déplacement : **ZQSD / WASD / flèches** · tir **automatique** (ou visée souris en option)
- **Espace / Shift** : dash (i-frames) · **E** : bombe de couleur · **R** : PRISMA BURST (jauge pleine)
- **P / Échap** : pause · **O** : options · **M** : muet · **F3** : overlay debug (FPS)
- Menus : **flèches / 1-2-3 / Entrée / clic**
- **Manette** : stick gauche = bouger · A/RB = dash + valider · B = bombe ·
  X = burst · Start = pause (mapping dans `engine/input.js`, `pollGamepad`)

## Comment étendre (data-driven)

- **Ajouter une arme** : ajoute une entrée dans `CONFIG.weapons` (`src/config.js`)
  avec un `kind` (`projectile` | `orbital` | `nova`). Référence-la dans
  `systems/upgrades.js` (déblocage) — c'est tout. Pour un nouveau `kind`, gère-le
  dans `systems/weapons.js` (fire/applyContactDamage/render).
- **Ajouter un biome** : ajoute une palette dans `PALETTES` — les paliers du
  mode sans fin les parcourent en boucle (`onTierUp`). Le rythme (montée / pic /
  respiration, scaling par palier) se règle dans `CONFIG.director`.
- **Ajouter un ennemi** : ajoute une entrée dans `CONFIG.enemyTypes` (sides, hp,
  speed, `behavior`...) et inclus sa clé dans les `types` d'un niveau. Un nouveau
  comportement se code dans `entities/enemy.js` (`update`).

## Choix d'architecture

- **Boucle timestep fixe + interpolation** (`engine/loop.js`) : simulation
  déterministe, rendu fluide à tout taux de rafraîchissement.
- **Pas de `shadowBlur` par frame** : tous les halos sont des sprites offscreen
  pré-rendus, mis en cache par couleur/forme, puis « blittés » (`render.glowSprite`/
  `polySprite`/`softDot`).
- **Pools** partout (ennemis, projectiles, orbes) ; particules & chiffres de
  dégâts en **typed arrays** (ring buffer plafonné).
- **Spatial hash** reconstruit chaque frame pour les collisions (O(voisins)).
- **Scènes** : `main.js` détient le contexte `app` + les transitions ; les
  overlays (pause/upgrade/options) figent le monde sans perdre son état.
- **Colorfield** : champ basse résolution (ImageData) upscalé + lissé ; le % est
  piloté par les kills (objectif), indépendant du rendu.
