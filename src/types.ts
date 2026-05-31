// ─── Shared ───────────────────────────────────────────────────────
export type AppMode = 'sports' | 'movies';

// ─── Sports ───────────────────────────────────────────────────────
export interface Sport { id: string; name: string; }

export interface Team { name: string; badge: string; }

export interface MatchSource { source: string; id: string; }

export type MatchStatus = 'live' | 'upcoming' | 'finished';

export interface EnrichedMatch {
  id: string;
  title: string;
  category: string;
  date: number;
  poster?: string;
  popular: boolean;
  teams?: { home?: Team; away?: Team; };
  sources: MatchSource[];
  status: MatchStatus;
}

export interface Stream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

// ─── Movies ───────────────────────────────────────────────────────
export type MediaType = 'movie' | 'tv';

export interface Movie {
  id: number;
  tmdbId: number;
  title: string;
  overview: string;
  poster: string;       // full URL
  backdrop: string;     // full URL
  rating: number;
  year: string;
  genres: string[];
  mediaType: MediaType;
  popularity: number;
}

export interface Genre { id: number; name: string; }

export interface TVSeason {
  season: number;
  episodes: number;
}

export type MovieCategory =
  | 'trending' | 'popular' | 'top_rated' | 'now_playing' | 'upcoming_movies'
  | 'on_air' | 'popular_tv' | 'top_rated_tv';
