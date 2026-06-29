import { useState, useEffect } from 'react';
import { X, Smartphone } from 'lucide-react';

type Platform = 'ios' | 'android';

const DISMISSED_KEY = 'sz_a2hs_dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isDismissed(): boolean {
  try { return !!localStorage.getItem(DISMISSED_KEY); } catch { return false; }
}

function detectPlatform(): Platform | null {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return null;
}

const IOS_STEPS = [
  { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
  { icon: '📲', text: 'Scroll down and tap "Add to Home Screen"' },
  { icon: '✅', text: 'Tap "Add" in the top-right corner' },
];

const ANDROID_STEPS = [
  { icon: '⋮', text: 'Tap the ⋮ menu in the top-right of Chrome' },
  { icon: '📲', text: 'Tap "Add to Home screen"' },
  { icon: '✅', text: 'Tap "Add" to confirm' },
];

function Steps({ steps }: { steps: typeof IOS_STEPS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700,
          }}>
            {i + 1}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 3 }}>
            <span style={{ fontSize: '1rem' }}>{s.icon}</span>
            <span style={{ fontSize: '0.83rem', color: 'var(--text2)', lineHeight: 1.4 }}>{s.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AddToHomeScreen() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Platform>(() => detectPlatform() ?? 'android');

  useEffect(() => {
    // Hide entirely if already installed as PWA or user dismissed
    if (isStandalone() || isDismissed()) return;
    setVisible(true);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
    setVisible(false);
    setOpen(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Single slim strip */}
      <div style={{
        width: '100%',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '5px 16px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 20, padding: '4px 12px',
            color: 'var(--text2)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Smartphone size={12} />
          Add to Home Screen
        </button>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', color: 'var(--text3)',
            cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center',
            fontSize: '0.68rem',
          }}
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 12px 12px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, width: '100%', maxWidth: 480, padding: '20px 20px 28px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/logo.png" alt="StreamZone" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Add to Home Screen</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Access StreamZone like a native app</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 4, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--bg)', borderRadius: 10, padding: 4 }}>
              {(['android', 'ios'] as Platform[]).map(p => (
                <button
                  key={p}
                  onClick={() => setTab(p)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
                    background: tab === p ? 'var(--surface2)' : 'transparent',
                    color: tab === p ? 'var(--text)' : 'var(--text3)',
                    fontWeight: tab === p ? 700 : 500,
                    fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {p === 'android' ? '🤖 Android' : '🍎 iPhone / iPad'}
                </button>
              ))}
            </div>

            {tab === 'android' ? (
              <>
                <Steps steps={ANDROID_STEPS} />
                <div style={{ marginTop: 14, padding: '9px 12px', background: 'rgba(77,158,247,0.08)', border: '1px solid rgba(77,158,247,0.2)', borderRadius: 10, fontSize: '0.74rem', color: 'var(--text3)' }}>
                  Works in Chrome and Edge. In Firefox tap ⋮ → "Install".
                </div>
              </>
            ) : (
              <>
                <Steps steps={IOS_STEPS} />
                <div style={{ marginTop: 14, padding: '9px 12px', background: 'rgba(77,158,247,0.08)', border: '1px solid rgba(77,158,247,0.2)', borderRadius: 10, fontSize: '0.74rem', color: 'var(--text3)' }}>
                  Requires Safari. If you're on Chrome for iPhone, open the URL in Safari first.
                </div>
              </>
            )}

            <button
              onClick={dismiss}
              style={{
                marginTop: 16, width: '100%', padding: '8px', border: 'none',
                background: 'transparent', color: 'var(--text3)', fontSize: '0.75rem',
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Don't show this again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
