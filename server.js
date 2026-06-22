import "dotenv/config";
import express from "express";
import cors from "cors";

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

const BASE_OFFSET = 10000; // social proof baseline
const memStore = {}; // in-memory fallback

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
    return val + BASE_OFFSET;
  }
  memStore[id] = (memStore[id] || 0) + 1;
  return memStore[id] + BASE_OFFSET;
}

async function getView(id) {
  if (redis) {
    const val = await redis.get(`sz:views:${id}`);
    return (parseInt(val) || 0) + BASE_OFFSET;
  }
  return (memStore[id] || 0) + BASE_OFFSET;
}

async function getBulkViews(ids) {
  if (redis && ids.length > 0) {
    const keys = ids.map((id) => `sz:views:${id}`);
    const vals = await redis.mget(...keys);
    return Object.fromEntries(
      ids.map((id, i) => [id, (parseInt(vals[i]) || 0) + BASE_OFFSET]),
    );
  }
  return Object.fromEntries(
    ids.map((id) => [id, (memStore[id] || 0) + BASE_OFFSET]),
  );
}

// POST /views/:id — increment when user starts watching
app.post("/views/:id", async (req, res) => {
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
app.get("/api/debug", async (req, res) => {
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

app.get("/api", async (req, res) => {
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
const EMBED_PROXY_ALLOWLIST = [
  "vidsrc.to",
  "vidsrc.me",
  "embed.su",
  "autoembed.co",
  "vidlink.pro",
  "2embed.cc",
  "multiembed.mov",
];

app.get("/embed-proxy", async (req, res) => {
  const raw = req.query.url;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({ error: "Missing url param" });
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const allowed = EMBED_PROXY_ALLOWLIST.some(
    (h) => target.hostname === h || target.hostname.endsWith("." + h),
  );
  if (!allowed) {
    return res.status(403).json({ error: "Domain not in allowlist" });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.google.com/",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const body = await upstream.text();

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
