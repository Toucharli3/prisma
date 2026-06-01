// math.js — utilitaires mathématiques, RNG seedé et helpers couleur.
// Aucune allocation cachée : les fonctions vectorielles travaillent sur des
// scalaires ou un objet `out` fourni par l'appelant (pour les boucles chaudes).

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// Interpolation d'angle par le plus court chemin.
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// Amortissement indépendant du framerate (utile pour suivi caméra/visée).
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// --- Aléatoire global (non seedé) ---
export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

// --- RNG seedé (mulberry32) : reproductible, utile pour les vagues/patterns ---
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Couleurs ---
export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbCss = (r, g, b, a = 1) =>
  a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// Mélange de deux couleurs hex, renvoie une chaîne css rgb.
export function mixHex(hexA, hexB, t, alpha = 1) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbCss(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t), alpha);
}

// Désature une couleur hex vers le gris (t=1 => gris complet), renvoie css rgb.
export function desaturateHex(hex, t, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbCss(lerp(r, gray, t), lerp(g, gray, t), lerp(b, gray, t), alpha);
}
