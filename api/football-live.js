/**
 * Vercel Serverless Function — /api/football-live
 * Mirrors server.js's /api/football-live route. All logic lives in
 * ./_lib/footballLive.js (RapidAPI key stays server-side, responses cached
 * because the free plan is 50 requests/day).
 *
 * Query params passed through: page, status (live|vs), date (DDMMYYYY),
 * type (direct|drm|referer), league. Use ?path=leagues for /leagues.
 */
import { isRateLimited } from "./_lib/rateLimit.js";
import { handleFootballLive } from "./_lib/footballLive.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (isRateLimited(req, 30)) {
    return res
      .status(429)
      .json({ error: "TOO_MANY_REQUESTS", retryAfterSeconds: 60 });
  }

  return handleFootballLive(req, res);
}
