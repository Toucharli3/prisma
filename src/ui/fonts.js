// fonts.js — source unique des familles de polices du jeu.
//
// Deux familles, chacune pour son usage :
//   - TITLE (Orbitron 900) — géométrique, large, très « techno ». Superbe en
//     gros, illisible en petit : réservée aux titres et aux grands nombres.
//   - UI (Rajdhani 600/700) — condensée et taillée pour les petites tailles :
//     c'est elle qui porte le HUD, les cartes et les menus.
//
// Les fichiers sont AUTO-HÉBERGÉS (public/fonts, sous-ensemble latin, ~38 Ko au
// total) : aucune requête vers un tiers, le jeu reste jouable hors-ligne et sur
// un simple file://.
//
// ⚠ Canvas 2D échoue en SILENCE si la police n'est pas encore chargée : il
// retombe sur la police par défaut sans prévenir. D'où `waitForFonts()`, appelé
// avant le démarrage de la boucle dans main.js.

export const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
export const FONT_TITLE = '"Orbitron", "Rajdhani", "Segoe UI", system-ui, sans-serif';

// Précharge explicitement les graisses réellement utilisées par le canvas.
export async function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('900 64px "Orbitron"'),
      document.fonts.load('600 16px "Rajdhani"'),
      document.fonts.load('700 16px "Rajdhani"'),
    ]);
    await document.fonts.ready;
  } catch {
    /* police indisponible : les replis système prennent le relais */
  }
}
