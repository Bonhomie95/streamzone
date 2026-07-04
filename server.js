import "dotenv/config";
import express from "express";
import cors from "cors";

// ─── Simple in-memory rate limiter ───────────────────────────────
// No extra package needed — tracks requests per IP per window.
// Limits: /api proxy = 60 req/min, /views = 120 req/min (cheaper).
const rateLimitWindows = new Map(); // key -> { count, resetAt }

function rateLimit(key, maxPerMinute) {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateLimitWindows.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitWindows.set(key, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }
  entry.count++;
  if (entry.count > maxPerMinute) return true; // limited
  return false;
}

// Prune stale entries every 5 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitWindows) {
    if (now > val.resetAt) rateLimitWindows.delete(key);
  }
}, 5 * 60_000);

function apiRateLimit(maxPerMinute = 60) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim()
              ?? req.socket?.remoteAddress
              ?? "unknown";
    const key = `${ip}:${req.path}`;
    if (rateLimit(key, maxPerMinute)) {
      return res.status(429).json({ error: "TOO_MANY_REQUESTS", retryAfterSeconds: 60 });
    }
    next();
  };
}

const app = express();
const PORT = process.env.PORT || 3001;

const KEYS = [process.env.SPORTSRC_KEY_1, process.env.SPORTSRC_KEY_2].filter(
  Boolean,
);

if (KEYS.length === 0) {
  console.error(
    "[proxy] ERROR: No API keys found. Check your .env file has SPORTSRC_KEY_1 and SPORTSRC_KEY_2",
  );
  process.exit(1);
}

console.log(
  `[proxy] Loaded ${KEYS.length} key(s): ${KEYS.map((k) => k.slice(0, 8) + "…").join(", ")}`,
);

const SPORTSRC_BASE = "https://api.sportsrc.org/v2/";
const exhaustedUntil = {};

function isExhausted(key) {
  const until = exhaustedUntil[key];
  if (!until) return false;
  return Date.now() < until;
}

function markExhausted(key) {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  exhaustedUntil[key] = midnight;
  console.warn(
    `[proxy] Key ${key.slice(0, 8)}… exhausted — rotating. Resets ${new Date(midnight).toISOString()}`,
  );
}

function getActiveKey() {
  return KEYS.find((k) => !isExhausted(k)) ?? null;
}

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
    methods: ["GET", "POST"],
  }),
);
app.use(express.json());

// ─── View Counter (Redis with in-memory fallback) ─────────────────
// Railway: add a Redis service, it auto-sets REDIS_URL env var
// Without Redis, counts are in-memory (reset on redeploy, still works)

// Each content ID gets a random baseline between 6000–50000 on first access,
// so counts look organic rather than all starting from the same number.
const memStore = {};    // { id: number }  — raw increment count
const baseStore = {};   // { id: number }  — per-ID random baseline

function getBase(id) {
  if (!baseStore[id]) {
    baseStore[id] = Math.floor(Math.random() * 44_000) + 6_000; // 6k–50k
  }
  return baseStore[id];
}

let redis = null;
try {
  if (process.env.REDIS_URL) {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    await redis.connect();
    console.log("[views] Redis connected");
  } else {
    console.log(
      "[views] No REDIS_URL — using in-memory store (counts reset on redeploy)",
    );
  }
} catch (e) {
  console.warn("[views] Redis failed, using in-memory fallback:", e.message);
  redis = null;
}

async function incrementView(id) {
  if (redis) {
    const val = await redis.incr(`sz:views:${id}`);
    // Store base in Redis too so it survives restarts
    let base = parseInt(await redis.get(`sz:base:${id}`));
    if (!base) {
      base = Math.floor(Math.random() * 44_000) + 6_000;
      await redis.set(`sz:base:${id}`, base);
    }
    return val + base;
  }
  memStore[id] = (memStore[id] || 0) + 1;
  return memStore[id] + getBase(id);
}

async function getView(id) {
  if (redis) {
    const [val, base] = await Promise.all([
      redis.get(`sz:views:${id}`),
      redis.get(`sz:base:${id}`),
    ]);
    const b = parseInt(base) || Math.floor(Math.random() * 44_000) + 6_000;
    if (!base) await redis.set(`sz:base:${id}`, b);
    return (parseInt(val) || 0) + b;
  }
  return (memStore[id] || 0) + getBase(id);
}

async function getBulkViews(ids) {
  if (redis && ids.length > 0) {
    const viewKeys = ids.map((id) => `sz:views:${id}`);
    const baseKeys = ids.map((id) => `sz:base:${id}`);
    const [vals, bases] = await Promise.all([
      redis.mget(...viewKeys),
      redis.mget(...baseKeys),
    ]);
    // Assign missing bases and persist them
    const pipeline = redis.pipeline();
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

// POST /views/:id — increment when user starts watching
app.post("/views/:id", apiRateLimit(30), async (req, res) => {
  try {
    const count = await incrementView(req.params.id);
    res.json({ id: req.params.id, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /views/:id — get current count
app.get("/views/:id", async (req, res) => {
  try {
    const count = await getView(req.params.id);
    res.json({ id: req.params.id, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /views?ids=id1,id2,id3 — bulk fetch for cards on home page
app.get("/views", async (req, res) => {
  try {
    const ids = (req.query.ids || "").split(",").filter(Boolean).slice(0, 50);
    const counts = await getBulkViews(ids);
    res.json(counts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug endpoint — call /api/debug?type=matches&sport=football to see raw upstream response
app.get("/api/debug", apiRateLimit(30), async (req, res) => {
  const key = getActiveKey();
  if (!key) return res.status(429).json({ error: "ALL_KEYS_EXHAUSTED" });

  const params = new URLSearchParams(req.query);
  const url = SPORTSRC_BASE + "?" + params.toString();
  console.log("[debug] Fetching:", url);

  try {
    const upstream = await fetch(url, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
    });
    const text = await upstream.text();
    console.log(
      "[debug] Status:",
      upstream.status,
      "| Body preview:",
      text.slice(0, 200),
    );
    res.set("Content-Type", "application/json");
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.get("/api", apiRateLimit(60), async (req, res) => {
  const key = getActiveKey();
  if (!key) {
    const midnight = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1,
      ),
    );
    return res
      .status(429)
      .json({ error: "ALL_KEYS_EXHAUSTED", resetsAt: midnight.toISOString() });
  }

  const params = new URLSearchParams(req.query);
  const url = SPORTSRC_BASE + "?" + params.toString();
  console.log(
    `[proxy] → ${url.replace(SPORTSRC_BASE, "")} (key: ${key.slice(0, 8)}…)`,
  );

  try {
    let upstream = await fetch(url, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
    });

    // Log raw response for debugging
    const text = await upstream.text();
    console.log(`[proxy] ← ${upstream.status} | ${text.slice(0, 120)}`);

    if (upstream.status === 429) {
      markExhausted(key);
      const nextKey = getActiveKey();
      if (!nextKey)
        return res.status(429).json({ error: "ALL_KEYS_EXHAUSTED" });
      const retry = await fetch(url, {
        headers: { "X-API-KEY": nextKey, Accept: "application/json" },
      });
      const retryText = await retry.text();
      res.set("Content-Type", "application/json");
      return res.status(retry.status).send(retryText);
    }

    const maxAge = req.query.type === "detail" ? 10 : 30;
    res.set("Cache-Control", `public, max-age=${maxAge}`);
    res.set("Content-Type", "application/json");
    return res.status(upstream.status).send(text);
  } catch (err) {
    console.error("[proxy] fetch error:", err.message);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: err.message });
  }
});

app.get("/api/status", async (req, res) => {
  const statuses = await Promise.all(
    KEYS.map(async (key) => {
      try {
        const r = await fetch(`${SPORTSRC_BASE}?type=account`, {
          headers: { "X-API-KEY": key },
        });
        const data = await r.json();
        return {
          key: key.slice(0, 8) + "…",
          exhausted: isExhausted(key),
          usage: data.usage ?? data.requests_today ?? "?",
          limit: data.limit ?? 1000,
        };
      } catch {
        return {
          key: key.slice(0, 8) + "…",
          exhausted: isExhausted(key),
          usage: "?",
          limit: 1000,
        };
      }
    }),
  );
  const activeKeyIndex = KEYS.findIndex((k) => !isExhausted(k));
  res.json({ keys: statuses, activeKeyIndex });
});

// ─── Embed Proxy ──────────────────────────────────────────────────
// Fetches third-party embed pages server-side and strips X-Frame-Options /
// CSP frame-ancestors headers. Required for Smart TV browsers (Tizen, webOS,
// Android TV) which enforce these headers and block iframes that desktop
// browsers would load silently.
// Sports source domains (DaddyLive mirrors especially) rotate frequently,
// so this validates the target is a well-formed http(s) URL rather than
// maintaining a fixed allowlist, and relies on the rate limiter to guard
// against abuse as an open relay.
app.get("/embed-proxy", apiRateLimit(20), async (req, res) => {
  const raw = req.query.url;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({ error: "Missing url param" });
  }

  let target;
  try {
    target = new URL(raw);
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      throw new Error("bad protocol");
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  // Referer of the site that legitimately embeds this stream (e.g.
  // https://streamed.pk/ or https://daddylive.eu/). Many stream hosts
  // 404/block requests whose Referer isn't their known embedding parent —
  // falls back to the target's own origin if the caller didn't supply one.
  let refererUrl = `${target.protocol}//${target.hostname}/`;
  const rawRef = req.query.ref;
  if (rawRef && typeof rawRef === "string") {
    try {
      const parsedRef = new URL(rawRef);
      if (parsedRef.protocol === "https:" || parsedRef.protocol === "http:") {
        refererUrl = parsedRef.toString();
      }
    } catch { /* keep default */ }
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: refererUrl,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    let body = await upstream.text();

    // The page's own relative URLs (JS bundles, CSS, its player's XHR/fetch
    // calls) must still resolve against the ORIGINAL domain, not ours —
    // otherwise every one of those requests 404s against our server and the
    // page's script never runs, leaving a blank iframe with no error.
    // Inject a <base> tag so relative paths keep working while the
    // top-level document itself is same-origin (dodging the framing block).
    const baseHref = `${target.protocol}//${target.host}/`;
    if (/<head[^>]*>/i.test(body)) {
      body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    } else {
      body = `<base href="${baseHref}">` + body;
    }

    // Strip headers that block TV browser iframes
    res.removeHeader("X-Frame-Options");
    res.set(
      "Content-Security-Policy",
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
    );
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    return res.status(upstream.status).send(body);
  } catch (err) {
    console.error("[embed-proxy] error:", err.message);
    return res
      .status(502)
      .json({ error: "Upstream fetch failed", message: err.message });
  }
});

// ─── Dynamic sitemap ──────────────────────────────────────────────
// Fetches live + upcoming matches from streamed.pk and builds a full sitemap.
// Cached for 10 minutes to avoid hammering the upstream API.
let _sitemapCache = null;
let _sitemapCachedAt = 0;
const SITEMAP_TTL = 10 * 60 * 1000;

app.get("/sitemap.xml", async (req, res) => {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=600");

  if (_sitemapCache && Date.now() - _sitemapCachedAt < SITEMAP_TTL) {
    return res.send(_sitemapCache);
  }

  const staticUrls = [
    { loc: "https://stream-zone.xyz/",       changefreq: "hourly",  priority: "1.0" },
    { loc: "https://stream-zone.xyz/movies", changefreq: "daily",   priority: "0.8" },
  ];

  let matchUrls = [];
  try {
    const r = await fetch("https://streamed.pk/api/matches/all", { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const matches = await r.json();
      matchUrls = (Array.isArray(matches) ? matches : [])
        .filter(m => m.status !== "finished")
        .slice(0, 200)
        .map(m => ({
          loc: `https://stream-zone.xyz/watch/${encodeURIComponent(m.id)}`,
          changefreq: m.status === "inprogress" ? "always" : "hourly",
          priority: m.status === "inprogress" ? "0.9" : "0.7",
          lastmod: new Date(m.date).toISOString().split("T")[0],
        }));
    }
  } catch {
    /* upstream down — serve static-only sitemap */
  }

  const allUrls = [...staticUrls, ...matchUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>`;

  _sitemapCache = xml;
  _sitemapCachedAt = Date.now();
  return res.send(xml);
});

// ─── Serve React frontend (Option C — all on Railway) ─────────────
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

// All non-API routes → React app (client-side routing)
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[StreamZone] running on port ${PORT}`);
});
