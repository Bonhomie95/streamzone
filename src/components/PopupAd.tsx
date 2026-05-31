import { useEffect, useRef } from 'react';

/**
 * PopupAd — injects the effectivecpmnetwork pop script once per 15 minutes.
 * Mount this ONLY on home pages (sports home + movie home).
 * Do NOT mount on watch pages — the stream embeds already have their own ads.
 *
 * The script fires a pop/popunder automatically — no visible component rendered.
 */

const POPUP_KEY = 'sz_popup_last';
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

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

export default function PopupAd() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (!shouldShowPopup()) return;

    injected.current = true;
    markPopupShown();

    const script = document.createElement('script');
    script.src = 'https://pl29600593.effectivecpmnetwork.com/e6/9b/20/e69b208f6c66a101b4555236597e684c.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Don't remove — once fired the pop has already opened
    };
  }, []);

  return null; // renders nothing
}
