// widgets.js — petits helpers de dessin UI réutilisables (rectangles arrondis,
// texte multiligne centré, barres). Tout en espace écran.

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Repli si roundRect indisponible.
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// Texte centré avec retour à la ligne sur la largeur maxW. Renvoie la hauteur.
export function wrapText(ctx, text, cx, y, maxW, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, y + i * lineHeight);
  return lines.length * lineHeight;
}

// Barre de progression arrondie (track + remplissage).
export function fillBar(ctx, x, y, w, h, frac, fillStyle, trackStyle = 'rgba(255,255,255,0.08)') {
  const r = h / 2;
  ctx.fillStyle = trackStyle;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0.5) {
    ctx.fillStyle = fillStyle;
    roundRect(ctx, x, y, Math.max(fw, h), h, r);
    ctx.fill();
  }
}
