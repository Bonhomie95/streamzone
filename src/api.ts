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

export async function fetchDaddyEvents(): Promise<EnrichedMatch[]> {
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

    const matches: EnrichedMatch[] = [];
    for (const day of days) {
      for (const [category, events] of Object.entries(day.categories)) {
        for (const ev of events) {
          const isLive = ev.time?.toLowerCase() === "live";
          // Parse "Sport : Team A vs Team B" title format
          const colonIdx = ev.event.indexOf(":");
          const sport =
            colonIdx > -1 ? ev.event.slice(0, colonIdx).trim() : category;
          const title =
            colonIdx > -1 ? ev.event.slice(colonIdx + 1).trim() : ev.event;
          const vsIdx = title.toLowerCase().indexOf(" vs ");
          const teams =
            vsIdx > -1
              ? {
                  home: { name: title.slice(0, vsIdx).trim(), badge: "" },
                  away: { name: title.slice(vsIdx + 4).trim(), badge: "" },
                }
              : undefined;

          // Use channel_id as unique key — encode slashes so they don't break /watch/:matchId routing
          const rawId = ev.channels[0]?.channel_id ?? ev.event;
          const id = `daddy_${encodeURIComponent(rawId)}`;

          matches.push({
            id,
            title: ev.event,
            category: sport.toLowerCase(),
            date: isLive ? Date.now() - 1 : Date.now() + 3600_000,
            popular: false,
            teams,
            sources: ev.channels.map((ch) => ({
              source: "daddy",
              id: ch.channel_id,
            })),
            status: isLive ? "live" : "upcoming",
            // Store embed URLs directly on the match for quick access
            _daddyUrls: ev.channels.map((ch) => ch.url),
          } as EnrichedMatch & { _daddyUrls: string[] });
        }
      }
    }
    return matches;
  } catch {
    return [];
  }
}

// Returns Stream[] for a daddy match — URLs already known, no extra fetch needed
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
    category: m.category ?? "",
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
  try {
    return await fetchJson<Sport[]>(`${SPORTS_BASE}/sports`);
  } catch {
    return [];
  }
}

export async function fetchAllMatches(): Promise<EnrichedMatch[]> {
  const data = await fetchJson<unknown>(`${SPORTS_BASE}/matches/all`);
  return (Array.isArray(data) ? data : []).map(normaliseMatch);
}

export async function fetchMatchesBySport(
  sportId: string,
): Promise<EnrichedMatch[]> {
  const data = await fetchJson<unknown>(`${SPORTS_BASE}/matches/${sportId}`);
  return (Array.isArray(data) ? data : []).map(normaliseMatch);
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

// ─── Movies API (TMDB + VidSrc) ───────────────────────────────────
// TMDB free key — replace with your own from themoviedb.org (free, instant)
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

// Route embed URLs through the server proxy to strip X-Frame-Options / CSP frame-ancestors.
// This is required for Smart TV browsers (Tizen, webOS, Android TV) which enforce framing
// headers strictly — desktop browsers silently ignore them for HTTPS iframes, TVs do not.
function proxyEmbed(url: string): string {
  return `/embed-proxy?url=${encodeURIComponent(url)}`;
}

// VidSrc embed URLs — tried in order as fallback sources
export function getEmbedSources(
  tmdbId: number,
  type: MediaType,
  season?: number,
  episode?: number,
): Stream[] {
  const isTV = type === "tv" && season !== undefined && episode !== undefined;

  // Sources ordered by reliability — if one fails in the UI, user picks the next
  // All confirmed working in browser iframes as of 2025 (block server-to-server but allow browser)
  const sources = [
    // vidsrc.to — most reliable, consistent uptime
    {
      name: "VidSrc",
      url: proxyEmbed(
        isTV
          ? `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`
          : `https://vidsrc.to/embed/movie/${tmdbId}`,
      ),
    },
    // vidsrc.me — solid backup
    {
      name: "VidSrc.me",
      url: proxyEmbed(
        isTV
          ? `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
          : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`,
      ),
    },
    // embed.su — clean player, no redirect spam
    {
      name: "Embed.su",
      url: isTV
        ? `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://embed.su/embed/movie/${tmdbId}`,
    },
    // autoembed.co (.co not .cc — .cc is dead)
    {
      name: "AutoEmbed",
      url: isTV
        ? `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episode}`
        : `https://autoembed.co/movie/tmdb/${tmdbId}`,
    },
    // vidlink.pro — good quality, sometimes geo-restricted
    {
      name: "VidLink",
      url: isTV
        ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
        : `https://vidlink.pro/movie/${tmdbId}`,
    },
    // 2embed.cc — widely used fallback
    {
      name: "2Embed",
      url: isTV
        ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${tmdbId}`,
    },
    // superembed / multiembed — last resort, has a popup ad but works
    {
      name: "SuperEmbed",
      url: isTV
        ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
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
