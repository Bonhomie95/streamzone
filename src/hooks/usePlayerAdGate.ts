import { useState } from "react";

// ─── Player click ads ─────────────────────────────────────────────
// Separate from the site-wide popunder (AdPopup → "sz_popup_last").
// Every stream link has its own gate: the first PLAYER_AD_CLICKS clicks on
// the player each open an ad link in a new tab, then THAT stream unlocks for
// PLAYER_AD_COOLDOWN_MS. Other servers — even for the same match — keep their
// own 2 clicks. Unlocks live in localStorage, so coming back to a stream
// inside its window doesn't show ads again.
//
// Set VITE_PLAYER_AD_URLS — one Direct Link / Smartlink URL, or two
// comma-separated (click 1 opens the first, click 2 the second). Empty = off.
export const PLAYER_AD_URLS = String(import.meta.env.VITE_PLAYER_AD_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const PLAYER_AD_CLICKS = 2;
const PLAYER_AD_COOLDOWN_MS = 30 * 60 * 1000;
const STORE_KEY = "sz_player_ads"; // { [streamKey]: unlockedAt }

// Fallback when localStorage is unavailable (private mode, TV browsers).
let memoryStore: Record<string, number> = {};

// A stream is identified by host + path: 1xAPI URLs carry short-lived tokens
// in the query string (txSecret, auth_key) that change on every API refresh.
function streamAdKey(sessionKey: string): string {
  try {
    const u = new URL(sessionKey);
    return u.host + u.pathname;
  } catch {
    return sessionKey;
  }
}

function readStore(): Record<string, number> {
  try {
    return { ...memoryStore, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") };
  } catch {
    return { ...memoryStore };
  }
}

function isCoolingDown(key: string): boolean {
  return Date.now() - (readStore()[key] ?? 0) < PLAYER_AD_COOLDOWN_MS;
}

function markAdsShown(key: string) {
  const now = Date.now();
  const store = readStore();
  store[key] = now;
  // Drop expired unlocks so the map doesn't grow forever.
  for (const [k, at] of Object.entries(store)) {
    if (now - at >= PLAYER_AD_COOLDOWN_MS) delete store[k];
  }
  memoryStore = store;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* noop */
  }
}

export interface PlayerAdGate {
  locked: boolean;
  clicksLeft: number;
  handleClick: () => void;
}

// sessionKey = the stream URL being played. A viewer who unlocked a stream
// keeps watching it uninterrupted even after the 30 minutes pass — the gate
// only returns when they open it again after its window has expired.
export function usePlayerAdGate(sessionKey: string): PlayerAdGate {
  const key = streamAdKey(sessionKey);
  // Click progress belongs to one stream; switching streams mid-way starts
  // the new stream from 0 clicks.
  const [progress, setProgress] = useState({ key: "", clicks: 0 });
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null);

  const clicks = progress.key === key ? progress.clicks : 0;
  const locked =
    PLAYER_AD_URLS.length > 0 &&
    !!sessionKey &&
    unlockedKey !== key &&
    !isCoolingDown(key);

  const handleClick = () => {
    const url = PLAYER_AD_URLS[clicks % PLAYER_AD_URLS.length];
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    const next = clicks + 1;
    if (next >= PLAYER_AD_CLICKS) {
      markAdsShown(key);
      setProgress({ key, clicks: 0 });
      setUnlockedKey(key);
    } else {
      setProgress({ key, clicks: next });
    }
  };

  return { locked, clicksLeft: PLAYER_AD_CLICKS - clicks, handleClick };
}
