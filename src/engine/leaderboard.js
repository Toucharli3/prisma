// leaderboard.js — client du classement. Priorité : Supabase (en ligne, partagé,
// marche sur un site statique) -> /api/scores (si déployé sur Vercel) -> localStorage.
// Conserve toujours une copie locale de secours.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../leaderboard-config.js';

const LOCAL_KEY = 'prisma.local.scores.v2';
const TIMEOUT = 5000;
const SUPA = SUPABASE_URL && SUPABASE_ANON_KEY ? { url: SUPABASE_URL.replace(/\/$/, ''), key: SUPABASE_ANON_KEY } : null;

let online = null;

// --- Local (secours) ---
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
  return list.indexOf(entry) + 1;
}

function withTimeout(run) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT);
  return run(ctrl.signal).finally(() => clearTimeout(id));
}

function cleanName(n) {
  return ((typeof n === 'string' ? n : '') || 'Anonyme').slice(0, 16).trim() || 'Anonyme';
}
function cleanScore(s) {
  return Math.max(0, Math.min(99999999, Math.floor(Number(s) || 0)));
}

// --- Supabase (REST, clé anon publique) ---
const supaHeaders = () => ({ apikey: SUPA.key, Authorization: `Bearer ${SUPA.key}`, 'Content-Type': 'application/json' });

async function supaTop(n) {
  const data = await withTimeout((signal) =>
    fetch(`${SUPA.url}/rest/v1/scores?select=name,score,biome&order=score.desc&limit=${n}`, { signal, headers: supaHeaders() }).then((r) => (r.ok ? r.json() : Promise.reject()))
  );
  return data.map((d) => ({ name: d.name, score: d.score, biome: d.biome || 1 }));
}
async function supaRank(score) {
  const r = await withTimeout((signal) => fetch(`${SUPA.url}/rest/v1/scores?select=id&score=gt.${score}`, { signal, headers: { ...supaHeaders(), Prefer: 'count=exact', Range: '0-0' } }));
  const cr = r.headers.get('content-range');
  const total = cr ? parseInt(cr.split('/')[1]) : 0;
  return (isNaN(total) ? 0 : total) + 1;
}
async function supaSubmit(entry) {
  await withTimeout((signal) =>
    fetch(`${SUPA.url}/rest/v1/scores`, { signal, method: 'POST', headers: { ...supaHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ name: entry.name, score: entry.score, biome: entry.biome }) }).then((r) => (r.ok ? r : Promise.reject()))
  );
}

// --- /api (Vercel) ---
async function apiTop(n) {
  const data = await withTimeout((signal) => fetch(`/api/scores?limit=${n}`, { signal, cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())));
  return data.scores || [];
}
async function apiSubmit(entry) {
  const data = await withTimeout((signal) =>
    fetch('/api/scores', { signal, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }).then((r) => (r.ok ? r.json() : Promise.reject()))
  );
  return data;
}

export const Leaderboard = {
  isOnline() {
    return online === true;
  },

  async top(n = 10) {
    try {
      const scores = SUPA ? await supaTop(n) : await apiTop(n);
      online = true;
      return scores;
    } catch {
      online = false;
      return localTop(n);
    }
  },

  async submit(entry) {
    const e = { name: cleanName(entry.name), score: cleanScore(entry.score), biome: Math.max(1, parseInt(entry.biome) || 1) };
    // Score nul : rien à soumettre (l'API le refuse et ça polluerait le local).
    if (e.score <= 0) {
      const scores = await this.top(10);
      return { rank: null, scores, online: online === true };
    }
    const localRank = localInsert({ name: e.name, score: e.score, biome: e.biome }); // secours local (une seule fois)
    try {
      if (SUPA) {
        await supaSubmit(e);
        const [rank, scores] = await Promise.all([supaRank(e.score), supaTop(10)]);
        online = true;
        return { rank, scores, online: true };
      }
      const data = await apiSubmit(e);
      online = true;
      return { rank: data.rank, scores: data.scores || [], online: true };
    } catch {
      online = false;
      return { rank: localRank, scores: localTop(10), online: false };
    }
  },
};
