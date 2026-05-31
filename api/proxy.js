/**
 * Vercel Serverless Function — replaces server.js
 * Deployed automatically as /api/proxy by Vercel
 *
 * Key rotation is stateless here (serverless has no persistent memory),
 * so exhaustion state uses Vercel KV or falls back to trying both keys
 * in sequence on every request.
 */

const KEYS = [
  process.env.SPORTSRC_KEY_1,
  process.env.SPORTSRC_KEY_2,
].filter(Boolean);

const SPORTSRC_BASE = 'https://api.sportsrc.org/v2/';

async function tryFetch(url, key) {
  const res = await fetch(url, {
    headers: { 'X-API-KEY': key, Accept: 'application/json' },
  });
  return res;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = new URLSearchParams(req.query);
  const url = SPORTSRC_BASE + '?' + params.toString();

  for (const key of KEYS) {
    try {
      const upstream = await tryFetch(url, key);
      if (upstream.status === 429) continue; // try next key
      const data = await upstream.json();
      const maxAge = req.query.type === 'detail' ? 10 : 30;
      res.setHeader('Cache-Control', `public, s-maxage=${maxAge}`);
      return res.status(upstream.status).json(data);
    } catch (err) {
      console.error('[proxy] key error:', err.message);
    }
  }

  return res.status(429).json({ error: 'ALL_KEYS_EXHAUSTED_OR_FAILED' });
}
