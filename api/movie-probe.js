import { probeMovieEmbed } from "./_lib/movieProbe.js";

const rateLimitWindows = new Map();

function isRateLimited(ip, maxPerMinute = 60) {
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
    return res.status(429).json({ ok: false, error: "TOO_MANY_REQUESTS" });
  }

  const raw = req.query.url;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({ ok: false, error: "Missing url param" });
  }

  try {
    const result = await probeMovieEmbed(raw);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err?.message ?? "Probe failed",
    });
  }
}
