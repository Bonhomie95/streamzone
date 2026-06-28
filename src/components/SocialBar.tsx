

const TELEGRAM_URL = 'https://t.me/+_ARxFsS80QAwMDc0';   // ← your Telegram channel
const X_URL        = 'https://x.com/streamzonelive';  // ← your X profile

// Inline SVG icons so there's no extra dependency
function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

export default function SocialBar() {
  return (
    <div style={{
      width: '100%',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: '5px 16px',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text3)', letterSpacing: '0.02em' }}>
        Follow us for updates:
      </span>

      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(38,168,221,0.1)',
          border: '1px solid rgba(38,168,221,0.25)',
          borderRadius: 20,
          padding: '3px 10px',
          color: '#26a8dd',
          fontSize: '0.7rem',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(38,168,221,0.2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(38,168,221,0.1)')}
      >
        <TelegramIcon />
        Telegram
      </a>

      {/* <a
        href={X_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: '3px 10px',
          color: 'var(--text2)',
          fontSize: '0.7rem',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
      >
        <XIcon />
        Follow on X
      </a> */}
    </div>
  );
}
