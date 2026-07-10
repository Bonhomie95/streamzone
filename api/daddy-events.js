/**
 * Vercel Serverless Function — /api/daddy-events
 * Ported 1:1 from server.js's /api/daddy-events route so Railway and
 * Vercel behave identically. See server.js for the full explanation of
 * why this proxy exists (CORS on daddylive.eu).
 *
 * Cache is per-instance (module scope), same in-spirit as server.js's
 * in-memory cache — it just resets more often here since Vercel instances
 * are shorter-lived / can be multiple in parallel.
 */
import { isRateLimited } from "./_lib/rateLimit.js";

let _daddyEventsCache = null;
let _daddyEventsCachedAt = 0;
const DADDY_EVENTS_TTL = 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (isRateLimited(req, 30)) {
    return res
      .status(429)
      .json({ error: "TOO_MANY_REQUESTS", retryAfterSeconds: 60 });
  }

  if (_daddyEventsCache && Date.now() - _daddyEventsCachedAt < DADDY_EVENTS_TTL) {
    res.setHeader("Content-Type", "application/json");
    return res.send(_daddyEventsCache);
  }

  try {
    const upstream = await fetch("https://daddylive.eu/api/events", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.warn(`[daddy-events] upstream ${upstream.status}`);
      res.setHeader("Content-Type", "application/json");
      return res.status(upstream.status).send(text);
    }
    _daddyEventsCache = text;
    _daddyEventsCachedAt = Date.now();
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    console.error("[daddy-events] fetch error:", err.message);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: err.message });
  }
}
