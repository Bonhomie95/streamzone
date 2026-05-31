import { useEffect, useRef } from 'react';

/**
 * AdBanner — Plug-and-play ad slot component.
 *
 * HOW TO ACTIVATE ADS:
 * ─────────────────────────────────────────────
 * Option A — Adsterra (Recommended for sports/streaming sites, no traffic minimum)
 *   1. Sign up at https://publishers.adsterra.com
 *   2. Add your site, choose "Display Banner" format
 *   3. Get your script tag and replace the placeholder below
 *   4. Set AD_PROVIDER = 'adsterra' and paste your key in ADSTERRA_KEY
 *
 * Option B — PopAds (Great CPM for streaming niches, instant approval)
 *   1. Sign up at https://www.popads.net/publishers.html
 *   2. Add site, get publisher code
 *   3. Set AD_PROVIDER = 'popads' and paste code in POPADS_CODE
 *
 * Option C — Google AdSense (if approved — sports aggregators often get rejected)
 *   1. Sign up at https://adsense.google.com
 *   2. Set AD_PROVIDER = 'adsense', fill CLIENT and SLOT IDs
 *
 * ⚠️  Note: DO NOT use AdSense on a site that aggregates third-party streams.
 *     Google will likely reject or ban the account. Adsterra or PopAds are safer bets.
 * ─────────────────────────────────────────────
 */

const AD_PROVIDER: 'placeholder' | 'adsterra' | 'adsense' | 'popads' = 'placeholder';

// Fill these in when you have your ad account:
const ADSENSE_CLIENT = 'ca-pub-XXXXXXXXXXXXXXXX';
const ADSENSE_SLOT = '1234567890';
const ADSTERRA_KEY = 'YOUR_ADSTERRA_BANNER_KEY';
const POPADS_CODE = 'YOUR_POPADS_PUBLISHER_CODE';

interface AdBannerProps {
  size?: 'leaderboard' | 'rectangle' | 'mobile';
  className?: string;
}

export default function AdBanner({ size = 'leaderboard', className }: AdBannerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const dimensions = {
    leaderboard: { width: 728, height: 90 },
    rectangle: { width: 300, height: 250 },
    mobile: { width: 320, height: 50 },
  }[size];

  useEffect(() => {
    if (!ref.current) return;

    if (AD_PROVIDER === 'adsense') {
      // inject AdSense <ins> tag
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
      ins.setAttribute('data-ad-slot', ADSENSE_SLOT);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      ref.current.appendChild(ins);
      try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch { /* */ }
    }

    if (AD_PROVIDER === 'adsterra') {
      const script = document.createElement('script');
      script.async = true;
      script.src = `//www.effectivecpmads.com/${ADSTERRA_KEY}.js`;
      ref.current.appendChild(script);
    }

    if (AD_PROVIDER === 'popads') {
      const script = document.createElement('script');
      script.text = `var popns=popns||[];popns.push(["${POPADS_CODE}"]);`;
      ref.current.appendChild(script);
    }
  }, []);

  if (AD_PROVIDER === 'placeholder') {
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
          AD SLOT · {dimensions.width}×{dimensions.height}
        </span>
      </div>
    );
  }

  return <div ref={ref} className={className} style={{ width: '100%', maxWidth: dimensions.width, margin: '0 auto' }} />;
}
