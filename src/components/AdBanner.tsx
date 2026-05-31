type AdSize = 'leaderboard' | 'rectangle' | 'mobile';

interface AdBannerProps {
  size?: AdSize;
  className?: string;
}

const LOAD_REMOTE_ADS_ON_LOCALHOST = false;

const AD_CONFIG: Record<AdSize, { key: string; width: number; height: number }> = {
  leaderboard: {
    key: '76bc25ee44f48e946e8ef02a1ab6124d',
    width: 728,
    height: 90,
  },
  rectangle: {
    key: '76bc25ee44f48e946e8ef02a1ab6124d',
    width: 728,
    height: 90,
  },
  mobile: {
    key: '1802d1371e71660e95ec2e93cb88b585',
    width: 320,
    height: 50,
  },
};

const injectedSlots = new WeakSet<HTMLDivElement>();

function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function effectiveSize(size: AdSize): AdSize {
  if (size === 'leaderboard' && window.innerWidth < 730) return 'mobile';
  return size;
}

function injectAd(container: HTMLDivElement, cfg: { key: string; width: number; height: number }) {
  if (injectedSlots.has(container)) return;
  injectedSlots.add(container);
  container.innerHTML = '';

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

  const invokeScript = document.createElement('script');
  invokeScript.type = 'text/javascript';
  invokeScript.src = `https://www.highperformanceformat.com/${cfg.key}/invoke.js`;
  invokeScript.async = true;

  container.appendChild(optionsScript);
  container.appendChild(invokeScript);
}

export default function AdBanner({ size = 'leaderboard', className }: AdBannerProps) {
  const cfg = AD_CONFIG[effectiveSize(size)];
  const showLocalPlaceholder = isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST;

  return (
    <div
      ref={node => {
        if (!node || showLocalPlaceholder) return;
        injectAd(node, cfg);
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
          LOCAL AD SLOT · {cfg.width}x{cfg.height}
        </span>
      )}
    </div>
  );
}
