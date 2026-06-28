// useFavourites — persist favourite sport categories + team names to localStorage
import { useState, useEffect, useCallback } from "react";

const SPORTS_KEY = "sz_fav_sports";
const TEAMS_KEY = "sz_fav_teams";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ── Sport category favourites ────────────────────────────────────
export function useFavouriteSports() {
  const [favs, setFavs] = useState<string[]>(() => load(SPORTS_KEY, []));

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SPORTS_KEY) setFavs(load(SPORTS_KEY, []));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((sportId: string) => {
    setFavs((prev) => {
      const next = prev.includes(sportId)
        ? prev.filter((s) => s !== sportId)
        : [...prev, sportId];
      save(SPORTS_KEY, next);
      return next;
    });
  }, []);

  const isFav = useCallback(
    (sportId: string) => favs.includes(sportId),
    [favs]
  );

  return { favs, toggle, isFav };
}

// ── Team name favourites (used for match-level hearts) ───────────
export function useFavouriteTeams() {
  const [favs, setFavs] = useState<string[]>(() => load(TEAMS_KEY, []));

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === TEAMS_KEY) setFavs(load(TEAMS_KEY, []));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((teamName: string) => {
    setFavs((prev) => {
      const key = teamName.toLowerCase().trim();
      const next = prev.includes(key)
        ? prev.filter((t) => t !== key)
        : [...prev, key];
      save(TEAMS_KEY, next);
      return next;
    });
  }, []);

  const isFav = useCallback(
    (teamName: string) => favs.includes(teamName.toLowerCase().trim()),
    [favs]
  );

  return { favs, toggle, isFav };
}

// ── Preferred sport detection ────────────────────────────────────
// Tracks click counts per sport category; returns the top one for auto-select.
const PREF_KEY = "sz_sport_clicks";

export function recordSportClick(sportId: string) {
  const counts: Record<string, number> = load(PREF_KEY, {});
  counts[sportId] = (counts[sportId] ?? 0) + 1;
  save(PREF_KEY, counts);
}

export function getPreferredSport(): string | null {
  const counts: Record<string, number> = load(PREF_KEY, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
