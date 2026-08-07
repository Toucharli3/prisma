# Polices

Sous-ensembles **latin** (couvre les accents français) au format woff2, extraits
de Google Fonts. ~38 Ko au total, auto-hébergés : aucune requête vers un tiers,
le jeu reste jouable hors-ligne.

| Fichier | Famille | Graisse | Usage |
|---|---|---|---|
| `orbitron-900.woff2` | [Orbitron](https://fonts.google.com/specimen/Orbitron) | 900 | Titres (PRISMA, GAME OVER, PAUSE…) |
| `rajdhani-600.woff2` | [Rajdhani](https://fonts.google.com/specimen/Rajdhani) | 600 | Texte d'interface |
| `rajdhani-700.woff2` | Rajdhani | 700 | Interface en gras, HUD |

Les deux familles sont publiées sous **SIL Open Font License 1.1**, qui autorise
la redistribution avec le projet. Voir <https://openfontlicense.org>.

Déclarées dans `src/styles.css` (`@font-face`), exposées par `src/ui/fonts.js`.
Vite les bundle et les hache automatiquement — ne pas les référencer par un
chemin absolu, cela casserait le déploiement en sous-chemin (GitHub Pages).
