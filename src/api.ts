import type {
  EnrichedMatch,
  Stream,
  Sport,
  Movie,
  Genre,
  MediaType,
} from "./types";

// ─── Sports API (streamed.pk) ─────────────────────────────────────
const SPORTS_BASE = "https://streamed.pk/api";

// ─── DaddyLive API ────────────────────────────────────────────────
const DADDY_BASE = "https://daddylive.eu";
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
    >(`${DADDY_BASE}/api/events`);

    const matchMap = new Map<string, EnrichedMatch & { _daddyUrls: string[] }>();

    for (const day of days) {
      for (const [category, events] of Object.entries(day.categories)) {
        for (const ev of events) {
          const isLive = ev.time?.toLowerCase() === "live";
          const sportCategory = category.toLowerCase().trim();
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
          const id = `daddy_${encodeURIComponent(rawId)}`;

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

// ─── fetchAllMatches: race streamed.pk vs DaddyLive ───────────────
// Whichever API responds first becomes the "primary" and renders immediately.
// The slower one then merges in its unique events silently after.
// onFirstLoad(matches) fires as soon as the faster source wins.
export async function fetchAllMatches(
  onFirstLoad?: (matches: EnrichedMatch[]) => void
): Promise<EnrichedMatch[]> {
  let firstLoadFired = false;

  function fireFirstLoad(matches: EnrichedMatch[]) {
    if (firstLoadFired) return;
    firstLoadFired = true;
    onFirstLoad?.(matches);
  }

  const streamedPromise = fetchStreamedMatches()
    .then((matches) => {
      if (matches.length > 0) fireFirstLoad(matches);
      return { source: "streamed" as const, matches };
    })
    .catch(() => ({ source: "streamed" as const, matches: [] as EnrichedMatch[] }));

  const daddyPromise = fetchDaddyEvents()
    .then((matches) => {
      if (matches.length > 0) fireFirstLoad(matches);
      return { source: "daddy" as const, matches };
    })
    .catch(() => ({ source: "daddy" as const, matches: [] as EnrichedMatch[] }));

  const [streamedResult, daddyResult] = await Promise.all([streamedPromise, daddyPromise]);

  const streamedMatches = streamedResult.matches;
  const daddyMatches = daddyResult.matches;

  // Prefer streamed.pk entries (richer data: badges, posters).
  // DaddyLive fills in events not covered by streamed.pk.
  const streamedKeys = new Set(
    streamedMatches.map((m) => `${normTitle(m.title)}::${m.status}`)
  );
  const uniqueDaddy = daddyMatches.filter(
    (d) => !streamedKeys.has(`${normTitle(d.title)}::${d.status}`)
  );

  return [...streamedMatches, ...uniqueDaddy];
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

export async function fetchTrending(
  type: MediaType = "movie",
): Promise<Movie[]> {
  const data = await tmdbGet(`/trending/${type}/week`);
  return (data.results ?? []).map((m: any) => normaliseMovie(m, type));
}

export async function fetchPopular(
  type: MediaType = "movie",
): Promise<Movie[]> {
  const data = await tmdbGet(`/${type}/popular`);
  return (data.results ?? []).map((m: any) => normaliseMovie(m, type));
}

export async function fetchTopRated(
  type: MediaType = "movie",
): Promise<Movie[]> {
  const data = await tmdbGet(`/${type}/top_rated`);
  return (data.results ?? []).map((m: any) => normaliseMovie(m, type));
}

export async function fetchNowPlaying(): Promise<Movie[]> {
  const data = await tmdbGet("/movie/now_playing");
  return (data.results ?? []).map((m: any) => normaliseMovie(m, "movie"));
}

export async function fetchUpcomingMovies(): Promise<Movie[]> {
  const data = await tmdbGet("/movie/upcoming");
  return (data.results ?? []).map((m: any) => normaliseMovie(m, "movie"));
}

export async function fetchByGenre(
  type: MediaType,
  genreId: number,
  page = 1,
): Promise<Movie[]> {
  const data = await tmdbGet(`/discover/${type}`, {
    with_genres: String(genreId),
    page: String(page),
    sort_by: "popularity.desc",
  });
  return (data.results ?? []).map((m: any) => normaliseMovie(m, type));
}

export async function searchMovies(query: string): Promise<Movie[]> {
  if (!query.trim()) return [];
  const [movies, tv] = await Promise.all([
    tmdbGet("/search/movie", { query }),
    tmdbGet("/search/tv", { query }),
  ]);
  const results = [
    ...(movies.results ?? []).map((m: any) => normaliseMovie(m, "movie")),
    ...(tv.results ?? []).map((m: any) => normaliseMovie(m, "tv")),
  ];
  return results.sort((a, b) => b.popularity - a.popularity);
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
