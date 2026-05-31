import { useState, useEffect } from 'react';
import { X, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import type { EnrichedMatch, Stream } from '../types';
import { fetchStreams, badgeUrl } from '../api';

interface StreamModalProps {
  match: EnrichedMatch;
  onClose: () => void;
}

export default function StreamModal({ match, onClose }: StreamModalProps) {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    loadStreams();
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function loadStreams() {
    setLoading(true);
    try {
      const allStreams: Stream[] = [];
      for (const src of match.sources) {
        try {
          const s = await fetchStreams(src.source, src.id);
          allStreams.push(...s);
        } catch { /* skip failed source */ }
      }
      setStreams(allStreams);
      if (allStreams.length > 0) setActiveStream(allStreams[0]);
    } catch { /* noop */ }
    setLoading(false);
  }

  const hasTeams = match.teams?.home && match.teams?.away;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 900,
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border2)',
        overflow: 'hidden', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {hasTeams ? (
              <>
                <img src={badgeUrl(match.teams!.home!.badge)} width={28} height={28}
                  style={{ objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{match.teams!.home!.name}</span>
                <span style={{ color: 'var(--text3)', fontSize: '0.8rem' }}>vs</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{match.teams!.away!.name}</span>
                <img src={badgeUrl(match.teams!.away!.badge)} width={28} height={28}
                  style={{ objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </>
            ) : (
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{match.title}</span>
            )}
            {match.status === 'live' && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.4)',
                borderRadius: 10, padding: '2px 8px',
                fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)'
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                LIVE
              </span>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 6, color: 'var(--text2)', display: 'flex',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Stream Player */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 360, color: 'var(--text2)' }}>
              <div style={{
                width: 40, height: 40, border: '3px solid var(--border2)',
                borderTop: '3px solid var(--accent)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <span style={{ fontSize: '0.85rem' }}>Loading streams...</span>
            </div>
          ) : streams.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 360, color: 'var(--text3)' }}>
              <WifiOff size={40} strokeWidth={1.5} />
              <span style={{ fontSize: '0.9rem' }}>No streams available for this match</span>
            </div>
          ) : activeStream ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* iframe */}
              <div style={{ position: 'relative', background: '#000', minHeight: 400 }}>
                {iframeBlocked ? (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 16, background: 'var(--bg)',
                  }}>
                    <WifiOff size={48} strokeWidth={1.2} color="var(--text3)" />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 6 }}>Embed blocked by source</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 20 }}>
                        This stream prevents embedding. Open it directly in a new tab.
                      </div>
                      <a href={activeStream.embedUrl} target="_blank" rel="noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'var(--accent)', color: '#fff',
                        borderRadius: 8, padding: '10px 20px',
                        fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none',
                      }}>
                        <ExternalLink size={14} />
                        Open Stream in New Tab
                      </a>
                    </div>
                  </div>
                ) : (
                  <>
                    <iframe
                      key={activeStream.embedUrl}
                      src={activeStream.embedUrl}
                      style={{ width: '100%', height: 460, border: 'none', display: 'block' }}
                      allowFullScreen
                      allow="autoplay; fullscreen"
                      onError={() => setIframeBlocked(true)}
                    />
                    <div style={{
                      position: 'absolute', bottom: 12, right: 12,
                      display: 'flex', gap: 8,
                    }}>
                      <a href={activeStream.embedUrl} target="_blank" rel="noreferrer" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border2)',
                        borderRadius: 8, padding: '6px 12px',
                        fontSize: '0.75rem', color: 'var(--text2)', textDecoration: 'none',
                      }}>
                        <ExternalLink size={12} />
                        Open in tab
                      </a>
                    </div>
                  </>
                )}
              </div>

              {/* Source selector */}
              <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Wifi size={13} color="var(--text3)" />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Stream Sources
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {streams.map((s, i) => (
                    <button key={i} onClick={() => { setActiveStream(s); setIframeBlocked(false); }} style={{
                      padding: '5px 12px', borderRadius: 6, border: '1px solid',
                      borderColor: activeStream?.embedUrl === s.embedUrl ? 'var(--accent)' : 'var(--border)',
                      background: activeStream?.embedUrl === s.embedUrl ? 'rgba(230,57,70,0.1)' : 'var(--surface)',
                      color: activeStream?.embedUrl === s.embedUrl ? 'var(--accent)' : 'var(--text2)',
                      fontSize: '0.78rem', fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {s.hd && <span style={{ fontSize: '0.6rem', background: 'var(--gold)', color: '#000', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>HD</span>}
                      {s.source} #{s.streamNo}
                      {s.language && s.language !== 'unknown' && (
                        <span style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>· {s.language}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
