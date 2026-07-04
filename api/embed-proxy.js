/**
 * Vercel Serverless Function — /api/embed-proxy
 *
 * Fetches third-party sports/movie embed pages server-side and strips
 * X-Frame-Options / CSP frame-ancestors headers before relaying the HTML
 * back to the browser. Smart TV browsers (Tizen, webOS, Fire TV/Silk,
 * Android TV) enforce these headers strictly and silently block the
 * iframe — desktop/mobile browsers are far more lenient, which is why
 * this only shows up on TVs.
 *
 * Sports source domains rotate frequently (DaddyLive mirrors especially),
 * so unlike a fixed allowlist this only validates that the target is a
 * well-formed https URL and relies on the rate limiter below to prevent
 * abuse as an open relay.
 */

const rateLimitWindows = new Map();

function isRateLimited(ip, maxPerMinute = 20) {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateLimitWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitWindows.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxPerMinute;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ??
    req.socket?.remoteAddress ??
    "unknown";
  if (isRateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "TOO_MANY_REQUESTS", retryAfterSeconds: 60 });
  }

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
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    let body = await upstream.text();

    // Relative URLs inside the page (JS/CSS/its own XHR calls) must still
    // resolve against the ORIGINAL domain or they 404 against our server,
    // leaving a blank iframe with no visible error. Inject <base> to fix
    // that while the top-level document stays same-origin.
    const baseHref = `${target.protocol}//${target.host}/`;
    if (/<head[^>]*>/i.test(body)) {
      body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    } else {
      body = `<base href="${baseHref}">` + body;
    }

    res.removeHeader("X-Frame-Options");
    res.setHeader(
      "Content-Security-Policy",
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(upstream.status).send(body);
  } catch (err) {
    console.error("[embed-proxy] error:", err.message);
    return res
      .status(502)
      .json({ error: "Upstream fetch failed", message: err.message });
  }
}
