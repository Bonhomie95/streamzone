/**
 * Shared RapidAPI "Football Live Streaming API" (1xAPI) client.
 * Used by server.js (/api/football-live) and api/football-live.js (Vercel).
 *
 * The free plan is 50 requests/day (hard limit), so:
 *  - responses are cached for FOOTBALL_LIVE_CACHE_MIN minutes (default 30)
 *  - concurrent cache misses share one upstream request
 *  - if upstream fails (quota exhausted, outage), the last good response is
 *    served instead ("STALE")
 *
 * With no `page` param, /matches is aggregated across FOOTBALL_LIVE_PAGES
 * pages (default 1, 20 matches each). Each page costs one request.
 */
const HOST = "football-live-streaming-api.p.rapidapi.com";
const ALLOWED_PARAMS = ["page", "status", "date", "type", "league"];

const cache = new Map(); // cacheKey -> { body, at }
const inflight = new Map(); // cacheKey -> Promise<result>
let lastRemaining = null;

const ttlMs = () => (Number(process.env.FOOTBALL_LIVE_CACHE_MIN) || 30) * 60_000;
const maxPages = () =>
  Math.min(Math.max(Number(process.env.FOOTBALL_LIVE_PAGES) || 1, 1), 10);

async function callUpstream(path, params, key) {
  const qs = params.toString();
  const res = await fetch(`https://${HOST}/${path}${qs ? `?${qs}` : ""}`, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
    signal: AbortSignal.timeout(10_000),
  });
  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  if (remaining != null) lastRemaining = remaining;
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: "BAD_UPSTREAM_RESPONSE", message: text.slice(0, 300) };
  }
  console.log(
    `[football-live] ← ${res.status} /${path}${qs ? `?${qs}` : ""} (quota left today: ${remaining ?? "?"})`,
  );
  return { status: res.status, body };
}

async function fetchFresh(path, params, pages, key) {
  if (pages === 1) return callUpstream(path, params, key);

  const matches = [];
  let pagination;
  for (let page = 1; page <= pages; page++) {
    const p = new URLSearchParams(params);
    p.set("page", String(page));
    const r = await callUpstream(path, p, key);
    if (r.status !== 200) {
      if (page === 1) return r;
      break; // keep what we have from earlier pages
    }
    matches.push(...(r.body.matches ?? []));
    pagination = r.body.pagination;
    if (!pagination?.hasNext) break;
  }
  return { status: 200, body: { matches, pagination } };
}

export async function getFootballLive(query = {}) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    return {
      status: 500,
      body: {
        error: "RAPIDAPI_KEY_NOT_SET",
        message: "Add RAPIDAPI_KEY to .env and restart the server",
      },
    };
  }

  const path = query.path === "leagues" ? "leagues" : "matches";
  const params = new URLSearchParams();
  for (const p of ALLOWED_PARAMS) {
    if (query[p]) params.set(p, String(query[p]));
  }
  const pages = path === "matches" && !params.has("page") ? maxPages() : 1;
  const cacheKey = `${path}?${params}&pages=${pages}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs()) {
    return { status: 200, body: hit.body, cache: "HIT", remaining: lastRemaining };
  }

  if (!inflight.has(cacheKey)) {
    inflight.set(
      cacheKey,
      fetchFresh(path, params, pages, key).finally(() => inflight.delete(cacheKey)),
    );
  }

  try {
    const result = await inflight.get(cacheKey);
    if (result.status === 200) {
      cache.set(cacheKey, { body: result.body, at: Date.now() });
      return { ...result, cache: "MISS", remaining: lastRemaining };
    }
    if (hit) return { status: 200, body: hit.body, cache: "STALE", remaining: lastRemaining };
    return { ...result, remaining: lastRemaining };
  } catch (err) {
    console.error("[football-live] fetch error:", err.message);
    if (hit) return { status: 200, body: hit.body, cache: "STALE", remaining: lastRemaining };
    return { status: 502, body: { error: "UPSTREAM_ERROR", message: err.message } };
  }
}

// Works with both Express and Vercel (plain Node ServerResponse API).
export async function handleFootballLive(req, res) {
  const r = await getFootballLive(req.query ?? {});
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (r.remaining != null) res.setHeader("X-Quota-Remaining", String(r.remaining));
  if (r.cache) res.setHeader("X-Cache", r.cache);
  res.setHeader(
    "Cache-Control",
    r.status === 200
      ? `public, max-age=60, s-maxage=${Math.round(ttlMs() / 1000)}`
      : "no-store",
  );
  res.setHeader("Content-Type", "application/json");
  res.statusCode = r.status;
  res.end(JSON.stringify(r.body));
}
