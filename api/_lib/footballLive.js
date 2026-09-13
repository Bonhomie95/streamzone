/**
 * Shared RapidAPI "Football Live Streaming API" (1xAPI) client.
 * Used by server.js (/api/football-live) and api/football-live.js (Vercel).
 *
 * The API returns 20 matches per page, sorted by kickoff time. To show every
 * live match plus the upcoming schedule, the default (no filters) request
 * aggregates:
 *  - all pages of status=live
 *  - status=vs (upcoming) pages until kickoffs pass FOOTBALL_LIVE_UPCOMING_HOURS
 *    from now (default 6h)
 * Each page costs one request, capped at FOOTBALL_LIVE_MAX_PAGES per status
 * (default 15).
 *
 * Responses are cached for FOOTBALL_LIVE_CACHE_MIN minutes (default 30),
 * concurrent cache misses share one upstream fetch, and if upstream fails
 * (quota exhausted, outage) the last good response is served ("STALE").
 */
const HOST = "football-live-streaming-api.p.rapidapi.com";
const ALLOWED_PARAMS = ["page", "status", "date", "type", "league"];

const cache = new Map(); // cacheKey -> { body, at }
const inflight = new Map(); // cacheKey -> Promise<result>
let lastRemaining = null;

const ttlMs = () => (Number(process.env.FOOTBALL_LIVE_CACHE_MIN) || 30) * 60_000;
const maxPages = () =>
  Math.min(Math.max(Number(process.env.FOOTBALL_LIVE_MAX_PAGES) || 15, 1), 40);
const upcomingHours = () =>
  Math.min(Math.max(Number(process.env.FOOTBALL_LIVE_UPCOMING_HOURS) || 6, 0), 48);

// match_time is unix seconds (sometimes as a string)
const kickoffMs = (m) => {
  const t = Number(m?.match_time);
  return !t ? 0 : t < 1e12 ? t * 1000 : t;
};

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

// Walk pages 1..limit, stopping early when there's no next page or
// shouldStop(pageMatches) says we have enough.
async function fetchPages(path, baseParams, key, limit, shouldStop) {
  const matches = [];
  for (let page = 1; page <= limit; page++) {
    const p = new URLSearchParams(baseParams);
    p.set("page", String(page));
    const r = await callUpstream(path, p, key);
    if (r.status !== 200) {
      if (page === 1) return { error: r };
      break; // keep what earlier pages returned
    }
    const batch = r.body.matches ?? [];
    matches.push(...batch);
    if (!r.body.pagination?.hasNext || shouldStop?.(batch)) break;
  }
  return { matches };
}

async function fetchSchedule(key) {
  const horizon = Date.now() + upcomingHours() * 60 * 60 * 1000;
  const [live, upcoming] = await Promise.all([
    fetchPages("matches", new URLSearchParams({ status: "live" }), key, maxPages()),
    fetchPages("matches", new URLSearchParams({ status: "vs" }), key, maxPages(), (batch) =>
      batch.some((m) => kickoffMs(m) > horizon),
    ),
  ]);
  if (live.error && upcoming.error) return live.error;

  const matches = [
    ...(live.matches ?? []),
    ...(upcoming.matches ?? []).filter((m) => kickoffMs(m) <= horizon),
  ];
  return {
    status: 200,
    body: {
      matches,
      pagination: {
        total: matches.length,
        live: live.matches?.length ?? 0,
        upcoming: matches.length - (live.matches?.length ?? 0),
        upcomingHours: upcomingHours(),
      },
    },
  };
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
  // No filters → full schedule (live + upcoming window). Any explicit filter
  // → a single passthrough page.
  const schedule = path === "matches" && [...params.keys()].length === 0;
  const cacheKey = schedule
    ? `schedule:${upcomingHours()}h:${maxPages()}`
    : `${path}?${params}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs()) {
    return { status: 200, body: hit.body, cache: "HIT", remaining: lastRemaining };
  }

  if (!inflight.has(cacheKey)) {
    inflight.set(
      cacheKey,
      (schedule ? fetchSchedule(key) : callUpstream(path, params, key)).finally(() =>
        inflight.delete(cacheKey),
      ),
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
