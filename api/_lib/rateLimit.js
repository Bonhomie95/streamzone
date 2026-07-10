/**
 * Shared in-memory rate limiter — same approach as server.js's apiRateLimit.
 *
 * NOTE: on Vercel this resets per cold start (each serverless instance has
 * its own memory), so it's weaker than on Railway's single long-running
 * process. It's still a useful best-effort guard on warm instances, which
 * is why we keep the identical logic rather than dropping it.
 */
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

// Prune stale entries so memory doesn't grow across a long-lived warm instance
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitWindows) {
    if (now > val.resetAt) rateLimitWindows.delete(key);
  }
}, 5 * 60_000);

/**
 * Returns true if this request should be blocked (429'd) by the caller.
 * Vercel handlers don't have Express-style middleware chaining, so instead
 * of `apiRateLimit(30)(req, res, next)` this is called directly:
 *
 *   if (isRateLimited(req, 30)) return res.status(429).json({...});
 */
export function isRateLimited(req, maxPerMinute = 60) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ??
    req.socket?.remoteAddress ??
    "unknown";
  const key = `${ip}:${req.url?.split("?")[0] ?? "unknown"}`;
  return rateLimit(key, maxPerMinute);
}
