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

// Parse DaddyLive day + time into a UTC timestamp.
// day.day = "2025-06-28", ev.time = "14:30" or "2:30 PM" or "Live".
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
    // Try UTC first, then local if UTC parse fails
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

    // Map keyed by id — collapses duplicates across days.
    // If the same event appears as both upcoming and live, live wins.
    const matchMap = new Map<string, EnrichedMatch & { _daddyUrls: string[] }>();

    for (const day of days) {
      for (const [category, events] of Object.entries(day.categories)) {
        for (const ev of events) {
          const isLive = ev.time?.toLowerCase() === "live";

          // Always use the API category key — structured, consistent per event group.
          const sportCategory = category.toLowerCase().trim();

          // Strip any "Sport : " prefix from the display title
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

          // Key = channel_id + title. channel_id alone repeats across days;
          // title alone can be generic ("Multiview"). Both together is unique.
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
    return Array.from(matchMap.values()) as (EnrichedMatch & { _daddyUrls: string[] })[];
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
  try {
    return await fetchJson<Sport[]>(`${SPORTS_BASE}/sports`);
  } catch {
    return [];
  }
}

export async function fetchAllMatches(): Promise<EnrichedMatch[]> {
  // /matches/all only returns live matches.
  // /matches/popular includes upcoming and finished events.
  // Fetch both in parallel and merge, deduplicating by id.
  const [live, popular] = await Promise.all([
    fetchJson<unknown>(`${SPORTS_BASE}/matches/all`).catch(() => []),
    fetchJson<unknown>(`${SPORTS_BASE}/matches/popular`).catch(() => []),
  ]);
  const seen = new Set<string>();
  const merged: EnrichedMatch[] = [];
  for (const raw of [...(Array.isArray(live) ? live : []), ...(Array.isArray(popular) ? popular : [])]) {
    const m = normaliseMatch(raw);
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  return merged;
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

// Embed sources — updated June 2026
// vidsrc.to, vidsrc.me, autoembed.co, vidlink.pro, 2embed.cc, multiembed.mov
// are all dead (DNS gone) or returning hard 403s as of this update.
// Sources below are ordered by TV-browser compatibility and uptime reliability.
export function getEmbedSources(
  tmdbId: number,
  type: MediaType,
  season?: number,
  episode?: number,
): Stream[] {
  const isTV = type === "tv" && season !== undefined && episode !== undefined;

  const sources = [
    // embed.su — clean player, no X-Frame-Options, works in TV WebViews
    {
      name: "Embed.su",
      url: isTV
        ? `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://embed.su/embed/movie/${tmdbId}`,
    },
    // vidsrc.cc — active fork of the original vidsrc network
    {
      name: "VidSrc",
      url: isTV
        ? `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidsrc.cc/v2/embed/movie/${tmdbId}`,
    },
    // player.videasy.net — newer provider, broad title coverage
    {
      name: "Videasy",
      url: isTV
        ? `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}`
        : `https://player.videasy.net/movie/${tmdbId}`,
    },
    // vidbinge.dev — reliable fallback, minimal ads
    {
      name: "VidBinge",
      url: isTV
        ? `https://vidbinge.dev/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidbinge.dev/embed/movie/${tmdbId}`,
    },
    // 2embed.skin — active replacement for dead 2embed.cc
    {
      name: "2Embed",
      url: isTV
        ? `https://www.2embed.skin/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.skin/embed/${tmdbId}`,
    },
    // moviesapi.club — good uptime, clean player
    {
      name: "MoviesAPI",
      url: isTV
        ? `https://moviesapi.club/tv/${tmdbId}-${season}-${episode}`
        : `https://moviesapi.club/movie/${tmdbId}`,
    },
    // autoembed.cc — rebranded/active version of autoembed
    {
      name: "AutoEmbed",
      url: isTV
        ? `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    },
    // vidsrc.xyz — newer node of the vidsrc network
    {
      name: "VidSrc.xyz",
      url: isTV
        ? `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}`,
    },
    // nontonflix — broad library, TMDB-based
    {
      name: "NontonFlix",
      url: isTV
        ? `https://nontonflix.com/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://nontonflix.com/embed/movie/${tmdbId}`,
    },
    // superembed.stream — active, good uptime
    {
      name: "SuperEmbed",
      url: isTV
        ? `https://superembed.stream/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://superembed.stream/embed/movie?tmdb=${tmdbId}`,
    },
    // embedsoap.net — clean embeddable player
    {
      name: "EmbedSoap",
      url: isTV
        ? `https://www.embedsoap.net/embed/tv/?id=${tmdbId}&s=${season}&e=${episode}`
        : `https://www.embedsoap.net/embed/movie/?id=${tmdbId}`,
    },
    // vidsrc.in — independent node, good for non-US titles
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
