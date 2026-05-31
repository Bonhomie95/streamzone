import { useEffect, useRef } from 'react';

/**
 * AdBanner — renders real ad scripts from highperformanceformat.com
 *
 * Sizes:
 *   leaderboard → 728×90  (desktop top banner)
 *   rectangle   → 300×250 (mid-content)
 *   mobile      → 320×50  (mobile banner)
 *
 * On screens < 728px the leaderboard auto-downgrades to mobile size.
 */

interface AdBannerProps {
  size?: 'leaderboard' | 'rectangle' | 'mobile';
  className?: string;
}

// Ad config per size
const AD_CONFIG = {
  leaderboard: {
    key: '76bc25ee44f48e946e8ef02a1ab6124d',
    width: 728,
    height: 90,
  },
  rectangle: {
    // Using leaderboard key as fallback — swap for a 300x250 key if you get one
    key: '76bc25ee44f48e946e8ef02a1ab6124d',
    width: 300,
    height: 250,
  },
  mobile: {
    key: '1802d1371e71660e95ec2e93cb88b585',
    width: 320,
    height: 50,
  },
} as const;

export default function AdBanner({ size = 'leaderboard', className }: AdBannerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const injected = useRef(false);

  // On mobile, downgrade leaderboard → mobile size
  const effectiveSize = size === 'leaderboard' && typeof window !== 'undefined' && window.innerWidth < 730
    ? 'mobile'
    : size;

  const cfg = AD_CONFIG[effectiveSize];

  useEffect(() => {
    if (!ref.current || injected.current) return;
    injected.current = true;

    const container = ref.current;

    // Set atOptions inline script
    const optionsScript = document.createElement('script');
    optionsScript.type = 'text/javascript';
    optionsScript.text = `
      atOptions = {
        'key': '${cfg.key}',
        'format': 'iframe',
        'height': ${cfg.height},
        'width': ${cfg.width},
        'params': {}
      };
    `;
    container.appendChild(optionsScript);

    // Invoke script
    const invokeScript = document.createElement('script');
    invokeScript.type = 'text/javascript';
    invokeScript.src = `https://www.highperformanceformat.com/${cfg.key}/invoke.js`;
    invokeScript.async = true;
    container.appendChild(invokeScript);
  }, [cfg.key, cfg.width, cfg.height]);

  return (
    <div
      ref={ref}
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
      }}
    />
  );
}
