import { useEffect, useRef } from 'react';

/**
 * PopupAd — legacy duplicate of AdPopup, kept for compatibility.
 * Prefer AdPopup in new code.
 */

const POPUP_KEY = 'sz_popup_last';
const INTERVAL_MS = 20 * 60 * 1000;

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

export default function PopupAd() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (isLocalhost()) return;
    if (!shouldShowPopup()) return;

    injected.current = true;
    markPopupShown();

    const script = document.createElement('script');
    script.src = 'https://pl30098045.effectivecpmnetwork.com/fc/41/1b/fc411baca5757b1efcca0bec6e2446f1.js';
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    document.body.appendChild(script);
  }, []);

  return null;
}
