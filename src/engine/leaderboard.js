// leaderboard.js — client du classement. Tente l'API serverless (/api/scores) ;
// si indisponible (dev local, pas encore déployé), bascule sur un classement
// localStorage. Conserve toujours une copie locale en secours.

const LOCAL_KEY = 'prisma.local.scores.v1';
const TIMEOUT = 4000;

let online = null; // null = inconnu, true/false après un appel

function localAll() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}
function localSave(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    /* ignore */
  }
}
function localTop(n) {
  return localAll()
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
function localInsert(entry) {
  const list = localAll();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  localSave(list);
  return list.findIndex((e) => e === entry) + 1;
}

async function withTimeout(promise) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(id);
  }
}

export const Leaderboard = {
  isOnline() {
    return online === true;
  },

  async top(n = 10) {
    try {
      const data = await withTimeout((signal) => fetch(`/api/scores?limit=${n}`, { signal, cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())));
      online = true;
      return data.scores || [];
    } catch {
      online = false;
      return localTop(n);
    }
  },

  // entry: { name, score, biome, combo }
  async submit(entry) {
    localInsert({ name: entry.name, score: entry.score, biome: entry.biome }); // secours local
    try {
      const data = await withTimeout((signal) =>
        fetch('/api/scores', { signal, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }).then((r) => (r.ok ? r.json() : Promise.reject()))
      );
      online = true;
      return { rank: data.rank, scores: data.scores || [], online: true };
    } catch {
      online = false;
      return { rank: localTop(999).findIndex((e) => e.score <= entry.score) + 1 || localAll().length, scores: localTop(10), online: false };
    }
  },
};
