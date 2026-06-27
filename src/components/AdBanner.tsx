import { useEffect, useRef } from 'react';

type AdSize = 'leaderboard' | 'rectangle' | 'mobile' | 'native';

interface AdBannerProps {
  size?: AdSize;
  className?: string;
}

const LOAD_REMOTE_ADS_ON_LOCALHOST = false;

// ─── Ad configurations ────────────────────────────────────────────
// leaderboard → 728×90  (highperformanceformat.com)
// rectangle   → 300×250 (highperformanceformat.com)
// native      → effectivecpmnetwork native banner
const AD_CONFIG = {
  leaderboard: { key: 'a13d8637793eb5e5aa36538259c6cf41', width: 728,  height: 90  },
  rectangle:   { key: '8195f9139671b98d2c53ffa6266ee6fc', width: 300,  height: 250 },
  mobile:      { key: '8195f9139671b98d2c53ffa6266ee6fc', width: 300,  height: 250 },
} as const;

const NATIVE_SCRIPT_SRC = 'https://pl30098044.effectivecpmnetwork.com/2516f1087def7e5df065eec5daac15b6/invoke.js';
const NATIVE_CONTAINER_ID = 'container-2516f1087def7e5df065eec5daac15b6';

function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function effectiveSize(size: AdSize, windowWidth: number): AdSize {
  if (size === 'leaderboard' && windowWidth < 730) return 'rectangle';
  return size;
}

// ─── Standard iframe banner injection ────────────────────────────
const injectedBannerSlots = new WeakSet<HTMLDivElement>();

function injectBanner(container: HTMLDivElement, cfg: { key: string; width: number; height: number }) {
  if (injectedBannerSlots.has(container)) return;
  injectedBannerSlots.add(container);
  container.innerHTML = '';

  const optionsScript = document.createElement('script');
  optionsScript.type = 'text/javascript';
  optionsScript.text = `atOptions = { 'key': '${cfg.key}', 'format': 'iframe', 'height': ${cfg.height}, 'width': ${cfg.width}, 'params': {} };`;

  const invokeScript = document.createElement('script');
  invokeScript.type = 'text/javascript';
  invokeScript.src = `https://www.highperformanceformat.com/${cfg.key}/invoke.js`;
  invokeScript.async = true;

  container.appendChild(optionsScript);
  container.appendChild(invokeScript);
}

// ─── Native banner component ──────────────────────────────────────
function NativeBannerAd() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST) return;
    if (document.getElementById(NATIVE_CONTAINER_ID)) return; // already in DOM

    injected.current = true;

    const script = document.createElement('script');
    script.src = NATIVE_SCRIPT_SRC;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    document.body.appendChild(script);
  }, []);

  if (isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST) {
    return (
      <div style={{
        width: '100%', minHeight: 120,
        background: 'repeating-linear-gradient(45deg, var(--surface) 0px, var(--surface) 10px, var(--surface2) 10px, var(--surface2) 20px)',
        border: '1px dashed var(--border2)', borderRadius: 'var(--radius-sm)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.08em' }}>
          LOCAL AD SLOT · NATIVE
        </span>
      </div>
    );
  }

  return <div id={NATIVE_CONTAINER_ID} style={{ width: '100%' }} />;
}

// ─── Main export ─────────────────────────────────────────────────
export default function AdBanner({ size = 'leaderboard', className }: AdBannerProps) {
  const resolved = effectiveSize(size, window.innerWidth);

  if (resolved === 'native') {
    return <NativeBannerAd />;
  }

  const cfg = AD_CONFIG[resolved as keyof typeof AD_CONFIG];
  const showLocalPlaceholder = isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST;

  return (
    <div
      ref={node => {
        if (!node || showLocalPlaceholder) return;
        injectBanner(node as HTMLDivElement, cfg);
      }}
      className={className}
      style={{
        width: '100%',
        maxWidth: cfg.width,
        minHeight: cfg.height,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...(showLocalPlaceholder ? {
          background: 'repeating-linear-gradient(45deg, var(--surface) 0px, var(--surface) 10px, var(--surface2) 10px, var(--surface2) 20px)',
          border: '1px dashed var(--border2)',
          borderRadius: 'var(--radius-sm)',
        } : {}),
      }}
    >
      {showLocalPlaceholder && (
        <span style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.08em' }}>
          LOCAL AD SLOT · {cfg.width}×{cfg.height}
        </span>
      )}
    </div>
  );
}
