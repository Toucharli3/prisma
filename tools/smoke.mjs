// tools/smoke.mjs — fumigation du build : lance une VRAIE partie dans Chromium,
// vérifie qu'aucune exception ne survient, que les valeurs du monde restent
// finies (garde anti-NaN) et que la mort mène bien à l'écran de fin.
//
//   npm run build
//   npm run preview -- --port 4173 &
//   npm i -D playwright          # non installé par défaut : gros paquet
//   node tools/smoke.mjs http://localhost:4173/
//
// Playwright n'est volontairement PAS une dépendance du projet : PRISMA tient à
// son zéro-dépendance runtime, et cet outil ne sert qu'en vérification manuelle.
// Chemin du binaire surchargeable via PRISMA_CHROMIUM.

import { readdirSync } from 'node:fs';
import { chromium } from 'playwright';

function findChromium() {
  if (process.env.PRISMA_CHROMIUM) return process.env.PRISMA_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined; // laisse Playwright résoudre lui-même
  try {
    const dir = readdirSync(root).find((n) => n.startsWith('chromium-'));
    if (dir) return `${root}/${dir}/chrome-linux/chrome`;
  } catch {
    /* résolution par défaut */
  }
  return undefined;
}

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOT = process.argv[3] || 'smoke.png';
const errors = [];
const notFound = [];

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('response', (r) => {
  if (r.status() === 404) notFound.push(r.url());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.keyboard.press('Enter'); // menu -> partie
await page.waitForTimeout(400);

// On avance le monde à la main (la boucle est à timestep fixe) en RELISANT la
// scène à chaque pas : la mort remplace la scène, et garder une référence figée
// reviendrait à tester un fantôme qui continue de tourner dans le vide.
const run = await page.evaluate(() => {
  const app = window.__prisma;
  const dt = 1 / 60;
  const game = app.scene;
  let steps = 0;
  let transitioned = false;
  for (let i = 0; i < 60 * 240; i++) {
    if (app.scene !== game) {
      transitioned = true;
      break;
    }
    app.scene.update(dt);
    steps++;
  }
  const w = game.world;
  return {
    transitioned,
    simulatedSeconds: +(steps * dt).toFixed(1),
    worldTime: +w.time.toFixed(1),
    tier: w.tier,
    level: w.level,
    kills: w.kills,
    score: w.score,
    enemiesAlive: w.enemies.count,
    weapons: w.weapons.list.map((x) => `${x.def.name}${x.evolved ? '★' : ''} N${x.level}`),
    finite: [w.player.hp, w.score, w.time, w.player.mods.damageMul].every(Number.isFinite),
  };
});

await page.waitForTimeout(700); // laisse l'écran de fin se rendre
await page.screenshot({ path: SHOT });
await browser.close();

console.log(JSON.stringify(run, null, 2));
// /api/scores en 404 est NORMAL sur un hébergement statique : le classement
// bascule alors sur localStorage (voir engine/leaderboard.js).
const unexpected = [...new Set(notFound)].filter((u) => !u.endsWith('/api/scores'));
if (unexpected.length) errors.push('404 inattendus :\n     ' + unexpected.join('\n     '));
if (!run.finite) errors.push('valeurs non finies (NaN) dans le monde');
if (!run.transitioned) errors.push("le joueur n'est jamais mort en 240 s simulées");

if (errors.length) {
  console.log('\n❌ ' + errors.join('\n❌ '));
  process.exit(1);
}
console.log(`\n✅ aucune exception · transition vers l'écran de fin OK · capture : ${SHOT}`);
