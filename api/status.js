const KEYS = [
  process.env.SPORTSRC_KEY_1,
  process.env.SPORTSRC_KEY_2,
].filter(Boolean);

const SPORTSRC_BASE = 'https://api.sportsrc.org/v2/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const statuses = await Promise.all(KEYS.map(async (key, i) => {
    try {
      const r = await fetch(`${SPORTSRC_BASE}?type=account`, {
        headers: { 'X-API-KEY': key },
      });
      const data = await r.json();
      return {
        key: key.slice(0, 8) + '…',
        index: i,
        usage: data.usage ?? data.requests_today ?? '?',
        limit: data.limit ?? 1000,
        status: r.status,
      };
    } catch {
      return { key: key.slice(0, 8) + '…', index: i, usage: '?', limit: 1000, status: 0 };
    }
  }));

  return res.status(200).json({ keys: statuses, activeKeyIndex: 0 });
}
