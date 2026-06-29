// useFavourites — persist favourite sport categories + team names to localStorage.
// Uses a tiny in-process event emitter so ALL hook instances in the same tab
// re-render instantly when any one of them toggles a favourite.
// The window "storage" event handles cross-tab sync as before.

import { useState, useEffect, useCallback } from "react";

const SPORTS_KEY = "sz_fav_sports";
const TEAMS_KEY  = "sz_fav_teams";

// ── Shared in-memory state + listeners ──────────────────────────
// One source of truth per key so every hook instance sees the same array.
type Listener = () => void;
const _state: Record<string, unknown[]> = {};
const _listeners: Record<string, Set<Listener>> = {};

function getState<T>(key: string, fallback: T[]): T[] {
  if (_state[key] === undefined) {
    try {
      const raw = localStorage.getItem(key);
      _state[key] = raw ? JSON.parse(raw) : fallback;
    } catch {
      _state[key] = fallback;
    }
  }
  return _state[key] as T[];
}

function setState<T>(key: string, next: T[]) {
  _state[key] = next;
  try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  // Notify every hook instance subscribed to this key — same tab, instant
  _listeners[key]?.forEach((fn) => fn());
}

function subscribe(key: string, fn: Listener): () => void {
  if (!_listeners[key]) _listeners[key] = new Set();
  _listeners[key].add(fn);
  return () => _listeners[key].delete(fn);
}

function useSharedList<T>(key: string): [T[], (next: T[]) => void] {
  const [value, setValue] = useState<T[]>(() => getState<T>(key, []));

  useEffect(() => {
    // Re-sync if _state was updated before this component mounted
    setValue(getState<T>(key, []));

    // Same-tab updates from other hook instances
    const unsub = subscribe(key, () => setValue([...(getState<T>(key, []))]));

    // Cross-tab updates via storage event
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : [];
        _state[key] = next;
        setValue([...next]);
      } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const set = useCallback((next: T[]) => setState(key, next), [key]);
  return [value, set];
}

// ── Sport category favourites ────────────────────────────────────
export function useFavouriteSports() {
  const [favs, setFavs] = useSharedList<string>(SPORTS_KEY);

  const toggle = useCallback((sportId: string) => {
    const current = getState<string>(SPORTS_KEY, []);
    const next = current.includes(sportId)
      ? current.filter((s) => s !== sportId)
      : [...current, sportId];
    setFavs(next);
  }, [setFavs]);

  const isFav = useCallback(
    (sportId: string) => favs.includes(sportId),
    [favs]
  );

  return { favs, toggle, isFav };
}

// ── Team name favourites ─────────────────────────────────────────
// Key format: "teamname::category" — scoped so "United" in football
// and "United" in basketball are treated as separate favourites.
export function useFavouriteTeams() {
  const [favs, setFavs] = useSharedList<string>(TEAMS_KEY);

  const toggle = useCallback((teamName: string, category: string) => {
    const key = `${teamName.toLowerCase().trim()}::${category.toLowerCase().trim()}`;
    const current = getState<string>(TEAMS_KEY, []);
    const next = current.includes(key)
      ? current.filter((t) => t !== key)
      : [...current, key];
    setFavs(next);
  }, [setFavs]);

  const isFav = useCallback(
    (teamName: string, category: string) =>
      favs.includes(`${teamName.toLowerCase().trim()}::${category.toLowerCase().trim()}`),
    [favs]
  );

  return { favs, toggle, isFav };
}

// ── Preferred sport detection ────────────────────────────────────
const PREF_KEY = "sz_sport_clicks";

function loadCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordSportClick(sportId: string) {
  const counts = loadCounts();
  counts[sportId] = (counts[sportId] ?? 0) + 1;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(counts)); } catch {}
}

export function getPreferredSport(): string | null {
  const entries = Object.entries(loadCounts());
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
