/**
 * View counter logic — ported 1:1 from server.js's Redis-with-in-memory-
 * fallback implementation, so both Railway (server.js) and Vercel
 * (api/views/*.js) produce identical numbers when REDIS_URL is shared.
 *
 * Each content ID gets a random baseline between 6000–50000 on first
 * access, so counts look organic rather than all starting from zero.
 */
const memStore = {}; // { id: number } — raw increment count
const baseStore = {}; // { id: number } — per-ID random baseline

function getBase(id) {
  if (!baseStore[id]) {
    baseStore[id] = Math.floor(Math.random() * 44_000) + 6_000; // 6k–50k
  }
  return baseStore[id];
}

let redis = null;
let redisInitPromise = null;

// Lazily connect on first use — Vercel functions are request-scoped, so we
// don't want a top-level `await import(...)` blocking cold start when
// REDIS_URL isn't set (matches server.js's intent, adapted to serverless).
async function getRedis() {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  if (!redisInitPromise) {
    redisInitPromise = (async () => {
      try {
        const { default: Redis } = await import("ioredis");
        const client = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });
        await client.connect();
        console.log("[views] Redis connected");
        redis = client;
      } catch (e) {
        console.warn("[views] Redis failed, using in-memory fallback:", e.message);
        redis = null;
      }
    })();
  }
  await redisInitPromise;
  return redis;
}

export async function incrementView(id) {
  const r = await getRedis();
  if (r) {
    const val = await r.incr(`sz:views:${id}`);
    let base = parseInt(await r.get(`sz:base:${id}`));
    if (!base) {
      base = Math.floor(Math.random() * 44_000) + 6_000;
      await r.set(`sz:base:${id}`, base);
    }
    return val + base;
  }
  memStore[id] = (memStore[id] || 0) + 1;
  return memStore[id] + getBase(id);
}

export async function getView(id) {
  const r = await getRedis();
  if (r) {
    const [val, base] = await Promise.all([
      r.get(`sz:views:${id}`),
      r.get(`sz:base:${id}`),
    ]);
    const b = parseInt(base) || Math.floor(Math.random() * 44_000) + 6_000;
    if (!base) await r.set(`sz:base:${id}`, b);
    return (parseInt(val) || 0) + b;
  }
  return (memStore[id] || 0) + getBase(id);
}

export async function getBulkViews(ids) {
  const r = await getRedis();
  if (r && ids.length > 0) {
    const viewKeys = ids.map((id) => `sz:views:${id}`);
    const baseKeys = ids.map((id) => `sz:base:${id}`);
    const [vals, bases] = await Promise.all([
      r.mget(...viewKeys),
      r.mget(...baseKeys),
    ]);
    const pipeline = r.pipeline();
    const resolvedBases = bases.map((b, i) => {
      if (b) return parseInt(b);
      const newBase = Math.floor(Math.random() * 44_000) + 6_000;
      pipeline.set(baseKeys[i], newBase);
      return newBase;
    });
    await pipeline.exec();
    return Object.fromEntries(
      ids.map((id, i) => [id, (parseInt(vals[i]) || 0) + resolvedBases[i]]),
    );
  }
  return Object.fromEntries(
    ids.map((id) => [id, (memStore[id] || 0) + getBase(id)]),
  );
}
