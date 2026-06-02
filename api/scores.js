// api/scores.js — fonction serverless Vercel : classement via Upstash Redis
// (sorted set). GET /api/scores?limit=N -> top N. POST {name,score,biome} -> ajoute
// + renvoie le rang. Si Upstash n'est pas configuré, renvoie 503 -> le client
// bascule sur un classement local.
//
// Variables d'environnement attendues (injectées par l'intégration Upstash de
// Vercel) : KV_REST_API_URL / KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL / _TOKEN).

import { Redis } from '@upstash/redis';

const KEY = 'prisma:scores:v1';
const SEP_CODE = 0x241f; // Unit Separator (sépare name/biome/ts dans le membre)
const SEP = String.fromCharCode(SEP_CODE);
const MAX_SCORE = 50000000;
const KEEP = 500; // ne garde que les meilleurs scores

function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Garde uniquement les caractères imprimables (>= 0x20), exclut DEL et le
// séparateur ; limite à 16 caractères. Pas de regex (évite les pièges d'encodage).
function sanitizeName(n) {
  const src = typeof n === 'string' ? n : '';
  let out = '';
  for (const ch of src) {
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c !== 0x7f && c !== SEP_CODE) out += ch;
    if (out.length >= 16) break;
  }
  out = out.trim();
  return out || 'Anonyme';
}

function clampScore(v) {
  const n = Math.floor(Number(v) || 0);
  return Math.max(0, Math.min(MAX_SCORE, n));
}

// zrange(...withScores) renvoie un tableau plat [member, score, member, score, ...].
function parseRange(raw) {
  const out = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const parts = String(raw[i]).split(SEP);
    out.push({ name: parts[0] || 'Anonyme', biome: parseInt(parts[1]) || 1, score: Number(raw[i + 1]) || 0 });
  }
  return out;
}

export default async function handler(req, res) {
  const redis = getRedis();
  if (!redis) {
    res.status(503).json({ error: 'leaderboard_not_configured' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const raw = await redis.zrange(KEY, 0, limit - 1, { rev: true, withScores: true });
      res.status(200).json({ scores: parseRange(raw) });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const name = sanitizeName(body.name);
      const score = clampScore(body.score);
      const biome = Math.max(1, Math.min(9999, parseInt(body.biome) || 1));
      if (score <= 0) {
        res.status(400).json({ error: 'invalid_score' });
        return;
      }
      const member = name + SEP + biome + SEP + Date.now() + SEP + Math.random().toString(36).slice(2, 7);
      await redis.zadd(KEY, { score, member });
      await redis.zremrangebyrank(KEY, 0, -(KEEP + 1)); // ne garde que le top KEEP
      const greater = await redis.zcount(KEY, '(' + score, '+inf');
      const top = await redis.zrange(KEY, 0, 9, { rev: true, withScores: true });
      res.status(200).json({ rank: greater + 1, scores: parseRange(top) });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
}
