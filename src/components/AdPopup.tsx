import { useEffect, useRef } from 'react';

/**
 * AdPopup — injects the effectivecpmnetwork popunder script once per 30 minutes.
 * Mount on home pages only (sports + movie home).
 * Do NOT mount on watch pages — stream embeds handle their own ads.
 */

const POPUP_KEY = 'sz_popup_last';
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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
