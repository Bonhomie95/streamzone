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

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*", methods: ["GET"] }));

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
