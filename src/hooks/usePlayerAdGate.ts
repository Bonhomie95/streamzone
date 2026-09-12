import { useCallback, useState } from "react";

// ─── Player click ads ─────────────────────────────────────────────
// Separate from the site-wide popunder (AdPopup → "sz_popup_last"), with its
// own cooldown key. The first PLAYER_AD_CLICKS clicks on a player each open
// an ad link in a new tab; after that the player unlocks for
// PLAYER_AD_COOLDOWN_MS. The cooldown lives in localStorage, so switching
// streams, matches or movies inside the window never shows ads again.
//
// Set VITE_PLAYER_AD_URLS in .env — one Direct Link / Smartlink URL, or two
// comma-separated (click 1 opens the first, click 2 the second). Empty = off.
export const PLAYER_AD_URLS = String(import.meta.env.VITE_PLAYER_AD_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const PLAYER_AD_CLICKS = 2;
const PLAYER_AD_COOLDOWN_MS = 30 * 60 * 1000;
const LAST_KEY = "sz_player_ad_last";

// Fallback when localStorage is unavailable (private mode, TV browsers).
let memoryLast = 0;

function isCoolingDown(): boolean {
  let last = memoryLast;
  try {
    last = Math.max(last, Number(localStorage.getItem(LAST_KEY)) || 0);
  } catch {
    /* noop */
  }
  return Date.now() - last < PLAYER_AD_COOLDOWN_MS;
}

function markAdsShown() {
  memoryLast = Date.now();
  try {
    localStorage.setItem(LAST_KEY, String(memoryLast));
  } catch {
    /* noop */
  }
}

export interface PlayerAdGate {
  locked: boolean;
  clicksLeft: number;
  handleClick: () => void;
}

// sessionKey = the thing being played (stream URL). A viewer who unlocked a
// stream keeps watching it uninterrupted even after the 30 minutes pass —
// the gate only comes back on the next stream they open after the cooldown.
export function usePlayerAdGate(sessionKey: string): PlayerAdGate {
  const [clicks, setClicks] = useState(0);
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null);

  const locked =
    PLAYER_AD_URLS.length > 0 && unlockedKey !== sessionKey && !isCoolingDown();

  const handleClick = useCallback(() => {
    const url = PLAYER_AD_URLS[clicks % PLAYER_AD_URLS.length];
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    const next = clicks + 1;
    if (next >= PLAYER_AD_CLICKS) {
      markAdsShown();
      setClicks(0);
      setUnlockedKey(sessionKey);
    } else {
      setClicks(next);
    }
  }, [clicks, sessionKey]);

  return { locked, clicksLeft: PLAYER_AD_CLICKS - clicks, handleClick };
}
