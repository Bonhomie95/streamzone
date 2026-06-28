import { useState } from 'react';
import { X, Smartphone } from 'lucide-react';

type Platform = 'ios' | 'android';

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
  { icon: '⋮',  text: 'Tap the ⋮ menu in the top-right of Chrome' },
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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Platform>(() => detectPlatform() ?? 'android');

  return (
    <>
      {/* Trigger pill — sits at top of page, full width strip */}
      <div style={{
        width: '100%',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'center',
        padding: '6px 16px',
      }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 20, padding: '5px 14px',
            color: 'var(--text2)', fontSize: '0.75rem', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Smartphone size={13} />
          Add StreamZone to Home Screen
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
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16, width: '100%', maxWidth: 480,
              padding: '20px 20px 28px',
            }}
          >
            {/* Header row */}
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

            {/* Platform tabs */}
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
                    fontSize: '0.82rem', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {p === 'android' ? '🤖 Android' : '🍎 iPhone / iPad'}
                </button>
              ))}
            </div>

            {/* Steps */}
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
                  Requires Safari. If you're on Chrome for iPhone, copy the URL and open it in Safari first.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
