/**
 * Vercel Serverless Function — /api/stream-proxy
 * Mirrors server.js's /api/stream-proxy route. See ./_lib/streamProxy.js.
 *
 * NOTE: Vercel functions have a max duration, so continuous streams (FLV)
 * will cut out when it's reached; HLS/DASH segment requests are short and fine.
 */
import { isRateLimited } from "./_lib/rateLimit.js";
import { handleStreamProxy } from "./_lib/streamProxy.js";

export default async function handler(req, res) {
  // A single viewer pulls a playlist + segment every few seconds.
  if (isRateLimited(req, 900)) {
    return res
      .status(429)
      .json({ error: "TOO_MANY_REQUESTS", retryAfterSeconds: 60 });
  }
  return handleStreamProxy(req, res);
}
