import { useEffect, useRef } from 'react';

/**
 * AdPopup — injects the effectivecpmnetwork popunder script once per 30 minutes.
 * Mount on home pages only (sports + movie home).
 * Do NOT mount on watch pages — stream embeds handle their own ads.
 *
 * FIX: Added isLocalhost() guard so the script only fires on the live
 * domain. Previously it would attempt to inject on localhost too, and
 * Adsterra's domain-allowlist check would silently block it — making
 * it look broken on prod when the real issue was a stale last-shown
 * timestamp written during local dev.
 */

const POPUP_KEY = 'sz_popup_last';
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function shouldShowPopup(): boolean {
  try {
    const last = localStorage.getItem(POPUP_KEY);
    if (!last) return true;
    return Date.now() - Number(last) > INTERVAL_MS;
  } catch {
    return true;
  }
}

function markPopupShown() {
  try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch { /* noop */ }
}

export default function AdPopup() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (isLocalhost()) return; // Never fire on localhost — Adsterra domain-checks the request
    if (!shouldShowPopup()) return;

    injected.current = true;
    markPopupShown();

    const script = document.createElement('script');
    script.src = 'https://pl30098045.effectivecpmnetwork.com/fc/41/1b/fc411baca5757b1efcca0bec6e2446f1.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return null;
}
