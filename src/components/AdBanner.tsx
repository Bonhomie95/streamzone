import { useEffect, useMemo, useRef, useState } from 'react';

type BannerProvider = 'adsterra' | 'adsense';
type BannerSize = 'leaderboard' | 'rectangle' | 'mobile';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_CLIENT = 'ca-pub-XXXXXXXXXXXXXXXX';
const ADSENSE_SLOT = '1234567890';
const LOAD_REMOTE_ADS_ON_LOCALHOST = false;

const BANNER_ADS: Array<{
  provider: BannerProvider;
  key: string;
  width: number;
  height: number;
  enabled: boolean;
}> = [
  {
    provider: 'adsterra',
    key: '1802d1371e71660e95ec2e93cb88b585',
    width: 320,
    height: 50,
    enabled: true,
  },
  {
    provider: 'adsterra',
    key: '76bc25ee44f48e946e8ef02a1ab6124d',
    width: 728,
    height: 90,
    enabled: true,
  },
];

interface AdBannerProps {
  size?: BannerSize;
  className?: string;
}

export default function AdBanner({ size = 'leaderboard', className }: AdBannerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const ad = useMemo(() => {
    const enabledAds = BANNER_ADS.filter(item => item.enabled);
    if (enabledAds.length === 0) return null;

    if (size === 'mobile' || viewportWidth < 560) {
      return enabledAds.find(item => item.width === 320) ?? enabledAds[0];
    }

    return enabledAds.find(item => item.width === 728) ?? enabledAds[0];
  }, [size, viewportWidth]);

  const dimensions = ad ?? { width: size === 'mobile' ? 320 : 728, height: size === 'mobile' ? 50 : 90 };

  useEffect(() => {
    if (!ref.current || !ad) return;

    const slot = ref.current;
    slot.innerHTML = '';

    if (ad.provider === 'adsense') {
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
      ins.setAttribute('data-ad-slot', ADSENSE_SLOT);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch { /* */ }
    }

    if (ad.provider === 'adsterra') {
      const optionsScript = document.createElement('script');
      optionsScript.text = `
        atOptions = {
          'key' : '${ad.key}',
          'format' : 'iframe',
          'height' : ${ad.height},
          'width' : ${ad.width},
          'params' : {}
        };
      `;

      const invokeScript = document.createElement('script');
      invokeScript.async = false;
      invokeScript.src = `https://www.highperformanceformat.com/${ad.key}/invoke.js`;

      slot.appendChild(optionsScript);
      slot.appendChild(invokeScript);
    }

    return () => {
      slot.innerHTML = '';
    };
  }, [ad]);

  if (!ad || (isLocalhost && !LOAD_REMOTE_ADS_ON_LOCALHOST)) {
    return (
      <div className={className} style={{
        width: '100%', maxWidth: dimensions.width,
        height: dimensions.height,
        background: 'repeating-linear-gradient(45deg, var(--surface) 0px, var(--surface) 10px, var(--surface2) 10px, var(--surface2) 20px)',
        border: '1px dashed var(--border2)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, margin: '0 auto',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.08em' }}>
          {isLocalhost ? 'LOCAL AD SLOT' : 'AD SLOT'} · {dimensions.width}×{dimensions.height}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: '100%',
        maxWidth: dimensions.width,
        minHeight: dimensions.height,
        margin: '0 auto',
        overflow: 'hidden',
      }}
    />
  );
}
