import { useState, useEffect, useRef, useCallback } from "react";
import type { MediaType } from "../types";

const RESUME_OFFSET = 10;
const SAVE_INTERVAL = 5_000;
const STORAGE_PREFIX = "sz_progress_";
const MAX_ENTRIES = 50;

export interface ProgressEntry {
  elapsed: number;
  source: string;
  savedAt: number;
  season?: number;
  episode?: number;
  title?: string;
  poster?: string;
  mediaType: MediaType;
  tmdbId: number;
}

function storageKey(
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number,
) {
  return season !== undefined
    ? `${STORAGE_PREFIX}${type}_${tmdbId}_s${season}e${episode}`
    : `${STORAGE_PREFIX}${type}_${tmdbId}`;
}

export function saveProgress(entry: ProgressEntry) {
  try {
    localStorage.setItem(
      storageKey(entry.mediaType, entry.tmdbId, entry.season, entry.episode),
      JSON.stringify(entry),
    );
    pruneOldEntries();
  } catch {
    /* storage full */
  }
}

export function loadProgress(
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number,
): ProgressEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(type, tmdbId, season, episode));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearProgress(
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number,
) {
  localStorage.removeItem(storageKey(type, tmdbId, season, episode));
}

export function getAllProgress(): ProgressEntry[] {
  const entries: ProgressEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) entries.push(JSON.parse(raw));
      }
    }
  } catch {
    /* noop */
  }
  return entries.sort((a, b) => b.savedAt - a.savedAt);
}

function pruneOldEntries() {
  const all = getAllProgress();
  if (all.length <= MAX_ENTRIES) return;
  all
    .slice(MAX_ENTRIES)
    .forEach((e) => clearProgress(e.mediaType, e.tmdbId, e.season, e.episode));
}

export function withTimestamp(url: string, seconds: number): string {
  if (seconds < 30) return url;
  const resumeAt = Math.max(0, seconds - RESUME_OFFSET);
  try {
    const u = new URL(url);
    u.searchParams.set("t", `${Math.floor(resumeAt)}s`);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}t=${Math.floor(resumeAt)}s`;
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

interface UseWatchProgressOptions {
  tmdbId: number;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  isPlaying: boolean;
  sourceName: string;
  title?: string;
  poster?: string;
}

export function useWatchProgress({
  tmdbId,
  mediaType,
  season,
  episode,
  isPlaying,
  sourceName,
  title,
  poster,
}: UseWatchProgressOptions) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const elapsedRef = useRef(0);

  useEffect(() => {
    const saved = loadProgress(mediaType, tmdbId, season, episode);
    const start = saved?.elapsed ?? 0;
    setElapsed(start);
    elapsedRef.current = start;
  }, [tmdbId, mediaType, season, episode]);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!isPlaying) return;
    intervalRef.current = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1_000);
    return () => clearInterval(intervalRef.current);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => {
      if (elapsedRef.current > 10) {
        saveProgress({
          elapsed: elapsedRef.current,
          source: sourceName,
          savedAt: Date.now(),
          season,
          episode,
          title,
          poster,
          mediaType,
          tmdbId,
        });
      }
    }, SAVE_INTERVAL);
    return () => clearInterval(t);
  }, [
    isPlaying,
    sourceName,
    season,
    episode,
    tmdbId,
    mediaType,
    title,
    poster,
  ]);

  useEffect(() => {
    const handler = () => {
      if (elapsedRef.current > 10) {
        saveProgress({
          elapsed: elapsedRef.current,
          source: sourceName,
          savedAt: Date.now(),
          season,
          episode,
          title,
          poster,
          mediaType,
          tmdbId,
        });
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sourceName, season, episode, tmdbId, mediaType, title, poster]);

  const savedProgress = loadProgress(mediaType, tmdbId, season, episode);

  const clear = useCallback(() => {
    clearProgress(mediaType, tmdbId, season, episode);
    setElapsed(0);
    elapsedRef.current = 0;
  }, [mediaType, tmdbId, season, episode]);

  return { elapsed, savedProgress, clear };
}
