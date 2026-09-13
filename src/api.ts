import type {
  EnrichedMatch,
  Stream,
  Sport,
  Movie,
  Genre,
  MediaType,
  MatchStatus,
  StreamKind,
} from "./types";

// ─── Sports API (streamed.pk) ─────────────────────────────────────
const SPORTS_BASE = "https://streamed.pk/api";

// ─── Sports sources ───────────────────────────────────────────────
// Football comes ONLY from the paid 1xAPI (RapidAPI). streamed.pk and
// DaddyLive supply every other sport — any football they list is dropped.

// ─── DaddyLive events ───────────────────────────────────────────────
// Fetched via our own /api/daddy-events server route (see server.js) rather
// than https://daddylive.eu/api/events directly — daddylive.eu doesn't send
// CORS headers permitting cross-origin browser fetches, so a direct fetch
// failed silently on every load.
const API_TIMEOUT = 10_000;

// ─── TTL cache (60 s) ─────────────────────────────────────────────
// Prevents redundant fetches on back-navigation and rapid refreshes.
// Both sources share the same invalidation time because they're always
// fetched together and merged.
interface CacheEntry<T> { data: T; expiresAt: number; }
const _cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

function cacheSet<T>(key: string, data: T, ttlMs = 60_000): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─── Helpers ──────────────────────────────────────────────────────
function parseDaddyDate(dayStr: string, timeStr: string): number {
  if (!dayStr || !timeStr || timeStr.toLowerCase() === "live") return Date.now() - 1;
  try {
    let t = timeStr.trim();
    const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = parseInt(ampm[1]);
      const m = parseInt(ampm[2]);
      const period = ampm[3].toUpperCase();
      if (period === "PM" && h !== 12) h += 12;
      if (period === "AM" && h === 12) h = 0;
      t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const tsUtc = new Date(`${dayStr}T${t}:00Z`).getTime();
    if (!isNaN(tsUtc)) return tsUtc;
    const tsLocal = new Date(`${dayStr}T${t}:00`).getTime();
    return isNaN(tsLocal) ? Date.now() + 3600_000 : tsLocal;
  } catch {
    return Date.now() + 3600_000;
  }
}

async function fetchJson<T>(url: string, timeout = API_TIMEOUT): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function normTitle(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

// DaddyLive categories are free text ("Soccer", "Ice Hockey", "Formula 1"…).
// Map them onto streamed.pk's sport ids so the sidebar groups them together
// and football can be filtered out reliably.
export function normaliseSportCategory(raw: string): string {
  const c = raw.toLowerCase().trim();
  if (/american football|\bnfl\b|\bncaaf\b|\bcfl\b/.test(c)) return "american-football";
  if (/soccer|football|futbol|premier league|la liga|laliga|bundesliga|serie a|ligue 1|eredivisie|uefa|champions league|europa league|fifa|\bmls\b|\befl\b|fa cup|copa/.test(c))
    return "football";
  if (/basket|\bnba\b|\bwnba\b|euroleague|\bncaab\b/.test(c)) return "basketball";
  if (/hockey|\bnhl\b|\bkhl\b/.test(c)) return "hockey";
  if (/baseball|\bmlb\b/.test(c)) return "baseball";
  if (/motor|formula|\bf1\b|motogp|nascar|indycar|rally|racing/.test(c)) return "motor-sports";
  if (/boxing|\bmma\b|\bufc\b|wwe|wrestling|fight|kickboxing/.test(c)) return "fight";
  if (/tennis|\batp\b|\bwta\b/.test(c)) return "tennis";
  if (/rugby/.test(c)) return "rugby";
  if (/cricket|\bipl\b/.test(c)) return "cricket";
  if (/golf|\bpga\b/.test(c)) return "golf";
  if (/darts/.test(c)) return "darts";
  if (/snooker|billiard|pool/.test(c)) return "billiards";
  if (/\bafl\b|aussie rules|australian rules/.test(c)) return "afl";
  return c.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

const isFootball = (m: EnrichedMatch) => m.category === "football";

// ─── DaddyLive ────────────────────────────────────────────────────
export async function fetchDaddyEvents(): Promise<EnrichedMatch[]> {
  const cached = cacheGet<EnrichedMatch[]>("daddy");
  if (cached) return cached;

  try {
    const days = await fetchJson<
      Array<{
        day: string;
        categories: Record<
          string,
          Array<{
            time: string;
            event: string;
            channels: Array<{
              channel_name: string;
              channel_id: string;
              url: string;
            }>;
            source: string;
          }>
        >;
      }>
    >(`/api/daddy-events`);

    const matchMap = new Map<string, EnrichedMatch & { _daddyUrls: string[] }>();

    for (const day of days) {
      for (const [category, events] of Object.entries(day.categories)) {
        for (const ev of events) {
          const isLive = ev.time?.toLowerCase() === "live";
          const sportCategory = normaliseSportCategory(category);
          const colonIdx = ev.event.indexOf(":");
          const matchTitle =
            colonIdx > -1 ? ev.event.slice(colonIdx + 1).trim() : ev.event;
          const vsIdx = matchTitle.toLowerCase().indexOf(" vs ");
          const teams =
            vsIdx > -1
              ? {
                  home: { name: matchTitle.slice(0, vsIdx).trim(), badge: "" },
                  away: { name: matchTitle.slice(vsIdx + 4).trim(), badge: "" },
                }
              : undefined;

          const channelId = ev.channels[0]?.channel_id ?? "";
          const rawId = channelId ? `${channelId}_${matchTitle}` : ev.event;
          const id = `daddy_${rawId}`;

          const entry = {
            id,
            title: matchTitle,
            category: sportCategory,
            date: parseDaddyDate(day.day, ev.time ?? ""),
            popular: false,
            teams,
            sources: ev.channels.map((ch) => ({
              source: "daddy",
              id: ch.channel_id,
            })),
            status: (isLive ? "live" : "upcoming") as "live" | "upcoming",
            _daddyUrls: ev.channels.map((ch) => ch.url),
          };

          const existing = matchMap.get(id);
          if (!existing || (isLive && existing.status !== "live")) {
            matchMap.set(id, entry);
          }
        }
      }
    }
    const result = Array.from(matchMap.values()) as (EnrichedMatch & { _daddyUrls: string[] })[];
    cacheSet("daddy", result);
    return result;
  } catch {
    return [];
  }
}

// Wraps a third-party embed URL so it's fetched same-origin through
// /embed-proxy, which strips X-Frame-Options / CSP frame-ancestors headers.
// `parentSite` should be the domain that legitimately embeds this stream
// (e.g. "https://streamed.pk/" or "https://daddylive.eu/") — many stream
// hosts 404/block requests whose Referer isn't their known embedding
// parent, as basic anti-leech protection, so this matters even though the
// framing block is a separate issue.
export function proxiedEmbedUrl(url: string, parentSite?: string): string {
  const q = `url=${encodeURIComponent(url)}`;
  return parentSite
    ? `/embed-proxy?${q}&ref=${encodeURIComponent(parentSite)}`
    : `/embed-proxy?${q}`;
}

// getDaddyStreams extracts the embedded stream URLs from a DaddyLive match.
// _daddyUrls is preserved through storage because we JSON.stringify the full
// match object (including non-enumerable lookalike fields) when caching to
// localStorage/sessionStorage, and JSON.parse restores it on the other side.
export function getDaddyStreams(match: EnrichedMatch): Stream[] {
  const urls: string[] = (match as any)._daddyUrls ?? [];
  return urls.map((url, i) => ({
    id: `daddy_${i}`,
    streamNo: i + 1,
    language: "en",
    hd: true,
    embedUrl: url,
    source: "DaddyLive",
  }));
}

// ─── streamed.pk ──────────────────────────────────────────────────
function getMatchStatus(dateMs: number): "live" | "upcoming" | "finished" {
  const now = Date.now();
  const diff = dateMs - now;
  if (diff > 5 * 60 * 1000) return "upcoming";
  if (now - dateMs < 2.5 * 60 * 60 * 1000) return "live";
  return "finished";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseMatch(m: any): EnrichedMatch {
  const status =
    m.status === "inprogress"
      ? "live"
      : m.status === "finished"
        ? "finished"
        : getMatchStatus(m.date);
  return {
    id: String(m.id),
    title: m.title ?? "",
    category: (m.category ?? "").toLowerCase(),
    date: m.date,
    poster: m.poster,
    popular: m.popular ?? false,
    teams:
      m.teams?.home && m.teams?.away
        ? {
            home: { name: m.teams.home.name, badge: m.teams.home.badge ?? "" },
            away: { name: m.teams.away.name, badge: m.teams.away.badge ?? "" },
          }
        : undefined,
    sources: m.sources ?? [],
    status,
  };
}

export async function fetchSports(): Promise<Sport[]> {
  const cached = cacheGet<Sport[]>("sports");
  if (cached) return cached;
  try {
    const result = await fetchJson<Sport[]>(`${SPORTS_BASE}/sports`);
    cacheSet("sports", result, 120_000); // sports list changes rarely
    return result;
  } catch {
    return [];
  }
}

async function fetchStreamedMatches(): Promise<EnrichedMatch[]> {
  const cached = cacheGet<EnrichedMatch[]>("streamed");
  if (cached) return cached;

  const [live, popular] = await Promise.all([
    fetchJson<unknown>(`${SPORTS_BASE}/matches/all`).catch(() => []),
    fetchJson<unknown>(`${SPORTS_BASE}/matches/popular`).catch(() => []),
  ]);
  const seen = new Set<string>();
  const merged: EnrichedMatch[] = [];
  for (const raw of [
    ...(Array.isArray(live) ? live : []),
    ...(Array.isArray(popular) ? popular : []),
  ]) {
    const m = normaliseMatch(raw);
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  cacheSet("streamed", merged);
  return merged;
}

// ─── Football Live Streaming API (RapidAPI / 1xAPI) ───────────────
// Fetched via /api/football-live (server.js / api/football-live.js) so the
// RapidAPI key stays server-side. Each match carries its raw stream servers
// as `_fxServers` — same round-trip-through-storage trick as `_daddyUrls`.
interface FxServer {
  name?: string;
  url: string;
  header?: Record<string, string>;
  type?: string;
}

interface FxMatch {
  match_time: string | number;
  match_status?: string;
  home_team_name: string;
  home_team_logo?: string;
  homeTeamScore?: string | number;
  away_team_name: string;
  away_team_logo?: string;
  awayTeamScore?: string | number;
  league_name?: string;
  league_logo?: string;
  servers?: FxServer[];
}

const STREAM_PROXY_PATH = "/api/stream-proxy";

function fxStatus(raw: string | undefined, dateMs: number): MatchStatus {
  const s = (raw ?? "").toLowerCase().trim();
  if (s === "live") return "live";
  if (/^(ft|fin|finished|ended|end|full.?time)$/.test(s)) return "finished";
  // "vs" = not started. Treat long-past kickoffs as finished.
  return Date.now() - dateMs > 3 * 60 * 60 * 1000 ? "finished" : "upcoming";
}

// 1xAPI isn't football-only (NCAA American football, FIBA basketball…
// show up too), so derive the sidebar category from the league name.
function fxCategory(league = ""): string {
  const l = league.toLowerCase();
  if (/american football|\bnfl\b|\bcfl\b/.test(l)) return "american-football";
  if (/basket|\bnba\b|\bwnba\b|fiba|euroleague/.test(l)) return "basketball";
  if (/hockey|\bnhl\b|\bkhl\b/.test(l)) return "hockey";
  if (/baseball|\bmlb\b/.test(l)) return "baseball";
  if (/tennis|\batp\b|\bwta\b/.test(l)) return "tennis";
  if (/cricket|\bipl\b/.test(l)) return "cricket";
  if (/rugby/.test(l)) return "rugby";
  if (/\bufc\b|\bmma\b|boxing/.test(l)) return "fight";
  return "football";
}

function normaliseFxMatch(m: FxMatch): EnrichedMatch & { _fxServers: FxServer[] } {
  const t = Number(m.match_time);
  const date = !t ? Date.now() : t < 1e12 ? t * 1000 : t;
  const home = m.home_team_name ?? "";
  const away = m.away_team_name ?? "";
  const slug = (x: string) => normTitle(x).replace(/ /g, "-");
  const servers = m.servers ?? [];
  const hasScore =
    m.homeTeamScore != null && m.homeTeamScore !== "" &&
    m.awayTeamScore != null && m.awayTeamScore !== "";
  return {
    id: `fx_${Math.floor(date / 1000)}_${slug(home)}_${slug(away)}`,
    title: `${home} vs ${away}`,
    category: fxCategory(m.league_name),
    date,
    popular: servers.length >= 5,
    teams: {
      home: { name: home, badge: m.home_team_logo ?? "" },
      away: { name: away, badge: m.away_team_logo ?? "" },
    },
    sources: servers.map((_, i) => ({ source: "1xapi", id: String(i) })),
    status: fxStatus(m.match_status, date),
    league: m.league_name ? { name: m.league_name, logo: m.league_logo ?? "" } : undefined,
    score: hasScore
      ? { home: String(m.homeTeamScore), away: String(m.awayTeamScore) }
      : undefined,
    _fxServers: servers,
  };
}

export async function fetchFootballLive(): Promise<EnrichedMatch[]> {
  const cached = cacheGet<EnrichedMatch[]>("fx");
  if (cached) return cached;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT + 10_000);
  try {
    const res = await fetch("/api/football-live", { signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as {
      matches?: FxMatch[];
      error?: string;
      message?: string;
    };
    const quota = res.headers.get("x-quota-remaining");
    console.info(
      `[football-live] ${res.status} ${res.headers.get("x-cache") ?? ""} — ${data.matches?.length ?? 0} matches, quota left: ${quota ?? "?"}`,
    );
    if (!res.ok) {
      console.error("[football-live] error:", data.error, data.message ?? "");
      return [];
    }
    const seen = new Set<string>();
    const out: EnrichedMatch[] = [];
    for (const raw of data.matches ?? []) {
      const m = normaliseFxMatch(raw);
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    cacheSet("fx", out);
    return out;
  } catch (e) {
    console.error("[football-live] fetch failed:", e);
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

// Servers that carry the same feed in different qualities share a URL apart
// from a _lhd/_lsd (or _hd/_sd) suffix — group them so the player can offer
// the other quality.
function qualityGroupOf(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname.replace(/_(lhd|lsd|hd|sd)(?=\.[a-z0-9]+$)/i, "");
  } catch {
    return url;
  }
}

function parseFxServer(s: FxServer, i: number): Stream {
  // Extra options may follow a "|" — e.g. "…stream.mpd|drmScheme=clearkey&drmLicense=…"
  const pipe = s.url.indexOf("|");
  const rawUrl = pipe > -1 ? s.url.slice(0, pipe) : s.url;
  const extras = new URLSearchParams(pipe > -1 ? s.url.slice(pipe + 1) : "");

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.header ?? {})) headers[k.toLowerCase()] = String(v);
  for (const [k, v] of extras) {
    if (!/^drm/i.test(k)) headers[k.toLowerCase()] = v;
  }
  const scheme = extras.get("drmScheme");
  const license = extras.get("drmLicense");

  const type = (s.type ?? "direct").toLowerCase();
  let path = rawUrl.toLowerCase();
  try {
    path = new URL(rawUrl).pathname.toLowerCase();
  } catch {
    /* keep raw */
  }
  const kind: StreamKind =
    path.endsWith(".mpd") || type === "drm" ? "dash" : path.endsWith(".flv") ? "flv" : "hls";
  const name = s.name?.trim() || `Server ${i + 1}`;
  // Many servers come in pairs: …_lhd (HD) / …_lsd (SD). Surfacing the tier
  // lets viewers on slow connections pick the lighter stream.
  const tier = /(_lhd|_hd|[_-](720|1080)p?)(\.|$)/.test(path)
    ? "HD"
    : /(_lsd|_sd|[_-](360|480|540)p?)(\.|$)/.test(path)
      ? "SD"
      : "";

  return {
    id: `fx_${i}`,
    streamNo: i + 1,
    language: `${kind.toUpperCase()}${tier ? ` · ${tier}` : ""}${type !== "direct" ? ` · ${type}` : ""}`,
    hd: tier === "HD" || /\b(hd|fhd|720p?|1080p?)\b/i.test(name),
    embedUrl: rawUrl,
    source: "1xAPI",
    tier: tier || undefined,
    qualityGroup: qualityGroupOf(rawUrl),
    label: name,
    kind,
    headers,
    drm: scheme || license ? { scheme: scheme ?? "clearkey", license: license ?? "" } : undefined,
    // Relay when a Referer is required, or when an http:// stream would be
    // blocked as mixed content on an https page.
    proxy:
      type === "referer" ||
      "referer" in headers ||
      "origin" in headers ||
      (rawUrl.startsWith("http:") && window.location.protocol === "https:"),
  };
}

export function getFootballLiveStreams(match: EnrichedMatch): Stream[] {
  const servers: FxServer[] =
    (match as EnrichedMatch & { _fxServers?: FxServer[] })._fxServers ?? [];
  const seen = new Set<string>();
  const out: Stream[] = [];
  servers.forEach((srv, i) => {
    if (!srv?.url) return;
    const st = parseFxServer(srv, i);
    if (seen.has(st.embedUrl)) return;
    seen.add(st.embedUrl);
    out.push(st);
  });
  // Try the most reliable formats first: HLS (direct, then relayed), then
  // FLV (continuous stream, often geo/ISP-blocked), then DRM/DASH. Keeps the
  // auto-failover from spending its first attempts on the flakiest servers.
  const rank = (x: Stream) =>
    x.kind === "hls" ? (x.proxy ? 1 : 0) : x.kind === "flv" ? 2 : 3;
  return out
    .map((st, i) => ({ st, i }))
    .sort((a, b) => rank(a.st) - rank(b.st) || a.i - b.i)
    .map(({ st }, i) => ({ ...st, streamNo: i + 1 }));
}

export function isMediaStream(s: Stream | null | undefined): boolean {
  return !!s?.kind && s.kind !== "iframe";
}

// ─── Unreachable stream hosts ─────────────────────────────────────
// 1xAPI lists many servers per host (e.g. 6+ on one CDN per match). When a
// host is unreachable from this viewer's network (DNS/SSL/ISP block), every
// server on it fails the same way — remember it for a while so the Watch
// page skips them instead of timing out on each one.
const FAILED_HOSTS_KEY = "sz_failed_stream_hosts";
const FAILED_HOST_TTL_MS = 10 * 60 * 1000;

function streamHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function readFailedHosts(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(FAILED_HOSTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markStreamHostFailed(url: string): void {
  const host = streamHost(url);
  if (!host) return;
  const hosts = readFailedHosts();
  hosts[host] = Date.now();
  try {
    sessionStorage.setItem(FAILED_HOSTS_KEY, JSON.stringify(hosts));
  } catch {
    /* noop */
  }
}

export function isStreamHostFailed(url: string): boolean {
  const at = readFailedHosts()[streamHost(url)];
  return !!at && Date.now() - at < FAILED_HOST_TTL_MS;
}

// Absolute URL (shaka maps proxied → original URLs by exact string).
export function streamProxyUrl(url: string, headers?: Record<string, string>): string {
  const fwd: Record<string, string> = {};
  for (const k of ["user-agent", "referer", "origin"]) {
    if (headers?.[k]) fwd[k] = headers[k];
  }
  let h = "";
  if (Object.keys(fwd).length > 0) {
    let bin = "";
    new TextEncoder().encode(JSON.stringify(fwd)).forEach((b) => (bin += String.fromCharCode(b)));
    h = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return `${window.location.origin}${STREAM_PROXY_PATH}?url=${encodeURIComponent(url)}${h ? `&h=${h}` : ""}`;
}

// ─── fetchAllMatches ──────────────────────────────────────────────
// Football: 1xAPI only. Other sports: streamed.pk (richer data: badges,
// posters), then DaddyLive events streamed.pk doesn't have, then any rare
// non-football 1xAPI match — football from the free sources is discarded.
// All three are fetched in parallel; onFirstLoad(matches) fires as soon as
// the first source returns something so the grid renders immediately.
export async function fetchAllMatches(
  onFirstLoad?: (matches: EnrichedMatch[]) => void
): Promise<EnrichedMatch[]> {
  let firstLoadFired = false;
  function fireFirstLoad(matches: EnrichedMatch[]) {
    if (firstLoadFired || matches.length === 0) return;
    firstLoadFired = true;
    onFirstLoad?.(matches);
  }

  const [fxMatches, streamedOther, daddyOther] = await Promise.all([
    fetchFootballLive()
      .then((ms) => (fireFirstLoad(ms), ms))
      .catch(() => [] as EnrichedMatch[]),
    fetchStreamedMatches()
      .then((ms) => ms.filter((m) => !isFootball(m)))
      .then((ms) => (fireFirstLoad(ms), ms))
      .catch(() => [] as EnrichedMatch[]),
    fetchDaddyEvents()
      .then((ms) => ms.filter((m) => !isFootball(m)))
      .then((ms) => (fireFirstLoad(ms), ms))
      .catch(() => [] as EnrichedMatch[]),
  ]);

  const football = fxMatches.filter(isFootball);
  const others: EnrichedMatch[] = [];
  const seen = new Set<string>();
  for (const m of [...streamedOther, ...daddyOther, ...fxMatches.filter((x) => !isFootball(x))]) {
    const k = `${normTitle(m.title)}::${m.status}`;
    if (seen.has(k)) continue;
    seen.add(k);
    others.push(m);
  }
  return [...football, ...others];
}

export async function fetchStreams(
  source: string,
  id: string,
): Promise<Stream[]> {
  try {
    return await fetchJson<Stream[]>(
      `${SPORTS_BASE}/stream/${source}/${id}`,
      8_000,
    );
  } catch {
    return [];
  }
}

export function badgeUrl(badge: string) {
  if (!badge) return "";
  if (badge.startsWith("http")) return badge;
  return `https://streamed.pk/api/images/badge/${badge}.webp`;
}

// ─── Movies API (TMDB + embed sources) ────────────────────────────
const TMDB_KEY =
  import.meta.env.VITE_TMDB_KEY ?? "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

export function posterImg(path: string, size = "w342") {
  return path ? `${IMG_BASE}/${size}${path}` : "";
}
export function backdropImg(path: string, size = "w1280") {
  return path ? `${IMG_BASE}/${size}${path}` : "";
}

export function getEmbedSources(
  tmdbId: number,
  type: MediaType,
  season?: number,
  episode?: number,
): Stream[] {
  const isTV = type === "tv" && season !== undefined && episode !== undefined;

  const sources = [
    {
      name: "Embed.su",
      url: isTV
        ? `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://embed.su/embed/movie/${tmdbId}`,
    },
    {
      name: "VidSrc",
      url: isTV
        ? `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidsrc.cc/v2/embed/movie/${tmdbId}`,
    },
    {
      name: "Videasy",
      url: isTV
        ? `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}`
        : `https://player.videasy.net/movie/${tmdbId}`,
    },
    {
      name: "VidBinge",
      url: isTV
        ? `https://vidbinge.dev/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidbinge.dev/embed/movie/${tmdbId}`,
    },
    {
      name: "2Embed",
      url: isTV
        ? `https://www.2embed.skin/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.skin/embed/${tmdbId}`,
    },
    {
      name: "MoviesAPI",
      url: isTV
        ? `https://moviesapi.club/tv/${tmdbId}-${season}-${episode}`
        : `https://moviesapi.club/movie/${tmdbId}`,
    },
    {
      name: "AutoEmbed",
      url: isTV
        ? `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    },
    {
      name: "VidSrc.xyz",
      url: isTV
        ? `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}`,
    },
    {
      name: "NontonFlix",
      url: isTV
        ? `https://nontonflix.com/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://nontonflix.com/embed/movie/${tmdbId}`,
    },
    {
      name: "SuperEmbed",
      url: isTV
        ? `https://superembed.stream/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://superembed.stream/embed/movie?tmdb=${tmdbId}`,
    },
    {
      name: "EmbedSoap",
      url: isTV
        ? `https://www.embedsoap.net/embed/tv/?id=${tmdbId}&s=${season}&e=${episode}`
        : `https://www.embedsoap.net/embed/movie/?id=${tmdbId}`,
    },
    {
      name: "VidSrc.in",
      url: isTV
        ? `https://vidsrc.in/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.in/embed/movie?tmdb=${tmdbId}`,
    },
  ];

  return sources.map((s, i) => ({
    id: `${tmdbId}_${i}`,
    streamNo: i + 1,
    language: "en",
    hd: true,
    embedUrl: s.url,
    source: s.name,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseMovie(m: any, type: MediaType): Movie {
  return {
    id: m.id,
    tmdbId: m.id,
    title: m.title ?? m.name ?? "",
    overview: m.overview ?? "",
    poster: posterImg(m.poster_path),
    backdrop: backdropImg(m.backdrop_path),
    rating: Math.round((m.vote_average ?? 0) * 10) / 10,
    year: (m.release_date ?? m.first_air_date ?? "").slice(0, 4),
    genres: [],
    mediaType: type,
    popularity: m.popularity ?? 0,
  };
}

async function tmdbGet(path: string, params: Record<string, string> = {}) {
  const url = `${TMDB_BASE}${path}?api_key=${TMDB_KEY}&${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

// Paginated results are returned as a plain Movie[] with a `totalPages`
// property attached, so existing callers that only care about the array
// (e.g. `.slice(0, 6)`) keep working unchanged, while callers that need
// paging info (MovieHome) can read `results.totalPages`.
export type PagedMovies = Movie[] & { totalPages: number };

function toPaged(results: Movie[], data: any): PagedMovies {
  const paged = results as PagedMovies;
  paged.totalPages = Math.max(1, Math.min(data?.total_pages ?? 1, 500));
  return paged;
}

export async function fetchTrending(
  type: MediaType = "movie",
  page = 1,
): Promise<PagedMovies> {
  const data = await tmdbGet(`/trending/${type}/week`, { page: String(page) });
  return toPaged((data.results ?? []).map((m: any) => normaliseMovie(m, type)), data);
}

export async function fetchPopular(
  type: MediaType = "movie",
  page = 1,
): Promise<PagedMovies> {
  const data = await tmdbGet(`/${type}/popular`, { page: String(page) });
  return toPaged((data.results ?? []).map((m: any) => normaliseMovie(m, type)), data);
}

export async function fetchTopRated(
  type: MediaType = "movie",
  page = 1,
): Promise<PagedMovies> {
  const data = await tmdbGet(`/${type}/top_rated`, { page: String(page) });
  return toPaged((data.results ?? []).map((m: any) => normaliseMovie(m, type)), data);
}

export async function fetchNowPlaying(page = 1): Promise<PagedMovies> {
  const data = await tmdbGet("/movie/now_playing", { page: String(page) });
  return toPaged((data.results ?? []).map((m: any) => normaliseMovie(m, "movie")), data);
}

export async function fetchUpcomingMovies(page = 1): Promise<PagedMovies> {
  const data = await tmdbGet("/movie/upcoming", { page: String(page) });
  return toPaged((data.results ?? []).map((m: any) => normaliseMovie(m, "movie")), data);
}

export async function fetchByGenre(
  type: MediaType,
  genreId: number,
  page = 1,
): Promise<PagedMovies> {
  const data = await tmdbGet(`/discover/${type}`, {
    with_genres: String(genreId),
    page: String(page),
    sort_by: "popularity.desc",
  });
  return toPaged((data.results ?? []).map((m: any) => normaliseMovie(m, type)), data);
}

export async function searchMovies(query: string, page = 1): Promise<PagedMovies> {
  if (!query.trim()) {
    const empty = [] as unknown as PagedMovies;
    empty.totalPages = 1;
    return empty;
  }
  const [movies, tv] = await Promise.all([
    tmdbGet("/search/movie", { query, page: String(page) }),
    tmdbGet("/search/tv", { query, page: String(page) }),
  ]);
  const results = [
    ...(movies.results ?? []).map((m: any) => normaliseMovie(m, "movie")),
    ...(tv.results ?? []).map((m: any) => normaliseMovie(m, "tv")),
  ];
  results.sort((a, b) => b.popularity - a.popularity);
  const totalPages = Math.max(movies.total_pages ?? 1, tv.total_pages ?? 1);
  return toPaged(results, { total_pages: totalPages });
}

export async function fetchMovieDetails(tmdbId: number, type: MediaType) {
  const data = await tmdbGet(`/${type}/${tmdbId}`);
  const genres: Genre[] = data.genres ?? [];
  const seasons: { season_number: number; episode_count: number }[] =
    data.seasons ?? [];
  return {
    ...normaliseMovie(data, type),
    genres: genres.map((g) => g.name),
    tagline: data.tagline ?? "",
    runtime: data.runtime ?? data.episode_run_time?.[0] ?? null,
    seasons: seasons
      .filter((s) => s.season_number > 0)
      .map((s) => ({ season: s.season_number, episodes: s.episode_count })),
  };
}

export async function fetchGenres(type: MediaType): Promise<Genre[]> {
  const data = await tmdbGet(`/genre/${type}/list`);
  return data.genres ?? [];
}

export async function fetchSimilar(
  tmdbId: number,
  type: MediaType,
): Promise<Movie[]> {
  const data = await tmdbGet(`/${type}/${tmdbId}/similar`);
  return (data.results ?? [])
    .slice(0, 12)
    .map((m: any) => normaliseMovie(m, type));
}
