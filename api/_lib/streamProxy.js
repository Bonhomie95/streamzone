/**
 * Stream relay for HLS / DASH / FLV media URLs.
 * Used by server.js (/api/stream-proxy) and api/stream-proxy.js (Vercel).
 *
 * Browsers can't set Referer/User-Agent and many stream CDNs don't send CORS
 * headers, so the player falls back to fetching through here.
 *
 *   /api/stream-proxy?url=<encoded media url>&h=<base64url JSON headers>
 *
 * HLS playlists are rewritten so every variant/segment/key URI also goes
 * through the relay (with the same headers). Everything else is piped.
 *
 * NOTE: this relays video bytes, so it uses real bandwidth — on shared
 * hosting or Vercel keep an eye on usage.
 */
import { Readable } from "node:stream";

export const STREAM_PROXY_PATH = "/api/stream-proxy";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FORWARD_REQ_HEADERS = ["user-agent", "referer", "origin"];
const PASS_RES_HEADERS = [
  "content-type",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
];

// Basic SSRF guard — don't let the relay reach the host's own network.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  )
    return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (h.includes(":")) {
    return h === "::" || h === "::1" || /^(fc|fd|fe80)/.test(h);
  }
  return false;
}

function decodeProxyHeaders(h) {
  if (!h) return {};
  try {
    const obj = JSON.parse(Buffer.from(String(h), "base64url").toString("utf8"));
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      const key = k.toLowerCase();
      if (FORWARD_REQ_HEADERS.includes(key) && typeof v === "string") out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function proxify(absUrl, h) {
  return `${STREAM_PROXY_PATH}?url=${encodeURIComponent(absUrl)}${h ? `&h=${encodeURIComponent(h)}` : ""}`;
}

export function rewritePlaylist(text, baseUrl, h) {
  const toProxy = (ref) => {
    try {
      return proxify(new URL(ref, baseUrl).toString(), h);
    } catch {
      return ref;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${toProxy(u)}"`);
      }
      return toProxy(t);
    })
    .join("\n");
}

// Works with both Express and Vercel (plain Node req/res API + req.query).
export async function handleStreamProxy(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const sendJson = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  let target;
  try {
    target = new URL(String(req.query?.url ?? ""));
  } catch {
    return sendJson(400, { error: "INVALID_URL" });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return sendJson(400, { error: "URL_NOT_ALLOWED" });
  }

  const h = req.query?.h ? String(req.query.h) : "";
  const headers = { "user-agent": DEFAULT_UA, accept: "*/*", ...decodeProxyHeaders(h) };
  if (req.headers.range) headers.range = req.headers.range;

  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), 15_000);
  res.on("close", () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(target, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(connectTimer);
    if (!res.headersSent) sendJson(502, { error: "UPSTREAM_ERROR", message: err.message });
    return;
  }
  clearTimeout(connectTimer);

  const ct = upstream.headers.get("content-type") ?? "";
  const finalUrl = upstream.url || target.toString();
  let finalPath = "";
  try {
    finalPath = new URL(finalUrl).pathname;
  } catch {
    /* noop */
  }
  const maybePlaylist =
    /mpegurl/i.test(ct) || /\.m3u8?$/i.test(finalPath) || /^text\//i.test(ct);

  if (upstream.ok && maybePlaylist) {
    const text = await upstream.text();
    res.statusCode = 200;
    if (text.trimStart().startsWith("#EXTM3U")) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      return res.end(rewritePlaylist(text, finalUrl, h));
    }
    if (ct) res.setHeader("Content-Type", ct);
    return res.end(text);
  }

  res.statusCode = upstream.status;
  for (const name of PASS_RES_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) res.setHeader(name, v);
  }
  // fetch() transparently decompresses, so the upstream length is only
  // accurate when there was no content-encoding.
  const len = upstream.headers.get("content-length");
  if (len && !upstream.headers.get("content-encoding")) res.setHeader("Content-Length", len);
  res.setHeader("Cache-Control", upstream.ok ? "public, max-age=30" : "no-store");

  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body)
    .on("error", () => res.destroy())
    .pipe(res);
}
