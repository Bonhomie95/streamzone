import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wifi, WifiOff, Maximize2, Minimize2,
  ExternalLink, Star, Clock, ChevronDown, ChevronUp, Tv2, Trophy, Film
} from 'lucide-react';
import { fetchStreams, fetchAllMatches, badgeUrl } from '../api';
import ViewerBadge from '../components/ViewerBadge';
import AdBanner from '../components/AdBanner';
import type { EnrichedMatch, Stream } from '../types';

function formatDate(ms: number) {
  return new Date(ms).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Watch() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [match, setMatch] = useState<EnrichedMatch | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStreamList, setShowStreamList] = useState(true);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load match
  useEffect(() => {
    async function load() {
      // Try session cache first
      const cached = sessionStorage.getItem(`match_${matchId}`);
      if (cached) {
        setMatch(JSON.parse(cached));
        setLoadingMatch(false);
        return;
      }
      // Fallback: fetch all and find
      try {
        const all = await fetchAllMatches();
        const found = all.find(m => m.id === matchId);
        if (found) setMatch(found);
      } catch { /* noop */ }
      setLoadingMatch(false);
    }
    load();
  }, [matchId]);

  // Load streams once match is available
  useEffect(() => {
    if (!match) return;
    loadStreams(match);
  }, [match]);

  async function loadStreams(m: EnrichedMatch) {
    setLoadingStreams(true);
    setStreams([]);
    setActiveStream(null);
    setIframeError(false);
    setIframeLoaded(false);
    const all: Stream[] = [];
    for (const src of m.sources) {
      try {
        const s = await fetchStreams(src.source, src.id);
        all.push(...s);
      } catch { /* skip */ }
    }
    setStreams(all);
    if (all.length > 0) setActiveStream(all[0]);
    setLoadingStreams(false);
  }


  function switchStream(s: Stream) {
    setActiveStream(s);
    setIframeError(false);
    setIframeLoaded(false);
  }

  function toggleFullscreen() {
    if (!playerWrapRef.current) return;
    if (!document.fullscreenElement) {
      playerWrapRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const hasTeams = match?.teams?.home && match?.teams?.away;
  const isLive = match?.status === 'live';

  if (loadingMatch) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar onBack={() => navigate('/')} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--text2)' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--border2)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: '0.85rem' }}>Loading match...</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar onBack={() => navigate('/')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text3)' }}>
          <WifiOff size={40} strokeWidth={1.2} />
          <span>Match not found</span>
          <button onClick={() => navigate('/')} style={{ marginTop: 8, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: '0.85rem', fontWeight: 600 }}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar onBack={() => navigate('/')} />

      {/* Top ad */}
      <div style={{ padding: '8px 16px 0', display: 'flex', justifyContent: 'center' }}>
        <AdBanner size="leaderboard" />
      </div>

      {/* Main layout: player area + stream sidebar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 'min(2400px, 96vw)', width: '100%', margin: '0 auto', padding: 'clamp(10px, 1.5vw, 28px) clamp(12px, 2vw, 36px) clamp(16px, 2.5vw, 48px)', gap: 'clamp(12px, 1.5vw, 24px)' }}>

        {/* Match title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {hasTeams ? (
            <>
              <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size={Math.min(56, Math.max(40, window.innerWidth / 50))} />
              <div style={{ textAlign: 'center', flex: 1, minWidth: 120 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(1.1rem, 3vw, 1.8rem)', letterSpacing: '0.06em', lineHeight: 1 }}>
                  {match.teams!.home!.name} <span style={{ color: 'var(--text3)' }}>vs</span> {match.teams!.away!.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <StatusBadge status={match.status} />
                  {match.popular && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: 'var(--gold)' }}><Star size={11} fill="var(--gold)" /> Popular</span>}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{match.category}</span>
                  {!isLive && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text3)' }}><Clock size={11} />{formatDate(match.date)}</span>}
                </div>
              </div>
              <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size={Math.min(56, Math.max(40, window.innerWidth / 50))} />
            </>
          ) : (
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(1.2rem, 4vw, 2rem)', letterSpacing: '0.05em' }}>{match.title}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <StatusBadge status={match.status} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{match.category}</span>
              </div>
            </div>
          )}
        </div>

        {/* Viewer count badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ViewerBadge id={matchId ?? ''} active={!!activeStream} large />
          {match.status === 'live' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(45,206,137,0.1)', border: '1px solid rgba(45,206,137,0.25)',
              borderRadius: 20, padding: '4px 12px',
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--green)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
              LIVE NOW
            </span>
          )}
        </div>

        {/* Two-column: player left, stream list right */}
        <div style={{ display: 'flex', gap: 'clamp(10px, 1.2vw, 24px)', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Player column — flex:1 so it fills ALL remaining width after sidebar */}
          <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1vw, 16px)' }}>

            {/* Player box */}
            <div
              ref={playerWrapRef}
              style={{
                position: 'relative',
                background: '#000',
                borderRadius: isFullscreen ? 0 : 'var(--radius)',
                overflow: 'hidden',
                border: isFullscreen ? 'none' : '1px solid var(--border)',
                width: '100%',
                aspectRatio: '16/9',
                /* Fallback height if aspectRatio fails to resolve (e.g. flex width not computed) */
                minHeight: 'clamp(200px, calc((100vw - clamp(240px, 20vw, 400px) - clamp(80px, 8vw, 160px)) * 9 / 16), 90vh)',
              }}
            >
              {loadingStreams ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'var(--bg2)', color: 'var(--text2)' }}>
                  <div style={{ width: 40, height: 40, border: '3px solid var(--border2)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  <span style={{ fontSize: '0.85rem' }}>Loading streams...</span>
                </div>
              ) : streams.length === 0 ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg2)', color: 'var(--text3)' }}>
                  <WifiOff size={44} strokeWidth={1.2} />
                  <span style={{ fontSize: '0.9rem' }}>No streams available</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Check back when the match goes live</span>
                </div>
              ) : iframeError ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg2)' }}>
                  <WifiOff size={44} strokeWidth={1.2} color="var(--text3)" />
                  <div style={{ textAlign: 'center', padding: '0 24px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 6 }}>Stream blocked by source</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 20 }}>
                      This source prevents embedding. Try another source from the list, or open directly.
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {streams.filter(s => s.embedUrl !== activeStream?.embedUrl).slice(0, 3).map((s, i) => (
                        <button key={i} onClick={() => switchStream(s)} style={{
                          background: 'var(--surface)', border: '1px solid var(--border2)',
                          borderRadius: 8, padding: '7px 14px', color: 'var(--text2)',
                          fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {s.hd && <span style={{ fontSize: '0.58rem', background: 'var(--gold)', color: '#000', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>HD</span>}
                          {s.source} #{s.streamNo}
                        </button>
                      ))}
                      {activeStream && (
                        <a href={activeStream.embedUrl} target="_blank" rel="noreferrer" style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'var(--accent)', color: '#fff',
                          borderRadius: 8, padding: '7px 14px',
                          fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none',
                        }}>
                          <ExternalLink size={13} />
                          Open Direct
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeStream ? (
                <>
                  <iframe
                    key={activeStream.embedUrl}
                    ref={iframeRef}
                    src={activeStream.embedUrl}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
                    allowFullScreen
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    onLoad={() => setIframeLoaded(true)}
                    onError={() => setIframeError(true)}
                  />
                  {/* Dark-screen fallback: shown after iframe loads but stream may be blocked */}
                  {iframeLoaded && (
                    <div style={{
                      position: 'absolute', bottom: 'clamp(10px, 2vw, 20px)', left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: 'clamp(8px, 1vw, 14px) clamp(12px, 1.5vw, 20px)',
                      display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 14px)',
                      zIndex: 3, whiteSpace: 'nowrap',
                    }}>
                      <span style={{ fontSize: 'clamp(0.72rem, 0.85vw, 0.9rem)', color: 'rgba(255,255,255,0.7)' }}>
                        Dark screen?
                      </span>
                      <a href={activeStream.embedUrl} target="_blank" rel="noreferrer" style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'var(--accent)', color: '#fff',
                        borderRadius: 6, padding: 'clamp(4px, 0.5vw, 7px) clamp(10px, 1.2vw, 16px)',
                        fontSize: 'clamp(0.72rem, 0.85vw, 0.9rem)', fontWeight: 700, textDecoration: 'none',
                      }}>
                        <ExternalLink size={13} />
                        Open in new tab
                      </a>
                      {streams.filter(s => s.embedUrl !== activeStream.embedUrl).length > 0 && (
                        <button onClick={() => switchStream(streams.find(s => s.embedUrl !== activeStream.embedUrl)!)} style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 6, padding: 'clamp(4px, 0.5vw, 7px) clamp(10px, 1.2vw, 16px)',
                          fontSize: 'clamp(0.72rem, 0.85vw, 0.9rem)', color: '#fff', fontWeight: 600,
                        }}>
                          Try Next Source
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : null}

              {/* Fullscreen + direct link overlay controls */}
              {!loadingStreams && streams.length > 0 && !iframeError && (
                <div style={{
                  position: 'absolute', bottom: 10, right: 10,
                  display: 'flex', gap: 6,
                }}>
                  <button onClick={toggleFullscreen} style={{
                    background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 7, padding: '6px', color: '#fff', display: 'flex',
                    backdropFilter: 'blur(6px)',
                  }} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                    {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              )}
            </div>

            {/* Active stream info bar */}
            {activeStream && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wifi size={13} color={isLive ? 'var(--green)' : 'var(--text3)'} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {activeStream.source} · Stream #{activeStream.streamNo}
                  </span>

                  {activeStream.hd && (
                    <span style={{ fontSize: '0.62rem', background: 'var(--gold)', color: '#000', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>HD</span>
                  )}
                  {activeStream.language && activeStream.language !== 'unknown' && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{activeStream.language}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                    {streams.indexOf(activeStream) + 1} of {streams.length}
                  </span>
                  <a href={activeStream.embedUrl} target="_blank" rel="noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 'clamp(0.72rem, 0.85vw, 0.85rem)',
                    color: 'var(--blue)', textDecoration: 'none', fontWeight: 600,
                    background: 'rgba(77,158,247,0.1)', border: '1px solid rgba(77,158,247,0.25)',
                    borderRadius: 6, padding: '4px 10px',
                  }}>
                    <ExternalLink size={12} />
                    Open Direct
                  </a>
                </div>
              </div>
            )}

            {/* Mobile: collapsible stream list below player */}
            <div className="show-below-md" style={{ display: 'none' }}>
              <button onClick={() => setShowStreamList(v => !v)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                color: 'var(--text2)', fontSize: '0.82rem', fontWeight: 500,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Tv2 size={14} color="var(--accent)" />
                  {streams.length} stream{streams.length !== 1 ? 's' : ''} available
                </span>
                {showStreamList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showStreamList && (
                <StreamSidebar streams={streams} activeStream={activeStream} onSwitch={switchStream} />
              )}
            </div>
          </div>

          {/* Right sidebar: stream list (desktop) */}
          <div className="hide-below-md" style={{ width: 'clamp(240px, 20vw, 400px)', flexShrink: 0 }}>
            <StreamSidebar streams={streams} activeStream={activeStream} onSwitch={switchStream} loading={loadingStreams} />
          </div>
        </div>

        {/* Bottom ad */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <AdBanner size="rectangle" />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @media (max-width: 768px) {
          .hide-below-md { display: none !important; }
          .show-below-md { display: block !important; }
        }
        @media (min-width: 769px) {
          .show-below-md { display: none !important; }
        }
        @media (min-width: 1600px) {
          .stream-btn-label { font-size: 0.95rem !important; }
          .stream-btn-sub { font-size: 0.82rem !important; }
        }
        @media (min-width: 2560px) {
          .stream-btn-label { font-size: 1.1rem !important; }
          .stream-btn-sub { font-size: 0.95rem !important; }
          .stream-num-badge { width: 36px !important; height: 36px !important; font-size: 0.9rem !important; }
        }
        @media (min-width: 3840px) {
          .stream-btn-label { font-size: 1.35rem !important; }
          .stream-btn-sub { font-size: 1.1rem !important; }
          .stream-num-badge { width: 44px !important; height: 44px !important; font-size: 1.1rem !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  const nav = useNavigate();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 18px)',
      padding: '0 clamp(12px, 2vw, 40px)', height: 'var(--header-h)',
      background: 'rgba(8,11,16,0.95)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
    }}>
      {/* Back */}
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '6px 12px',
        color: 'var(--text2)', fontSize: '0.82rem', fontWeight: 500, flexShrink: 0,
      }}>
        <ArrowLeft size={14} /> Back
      </button>

      {/* Logo */}
      <button onClick={() => nav('/')} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
      }}>
        <div style={{ background: 'var(--accent)', borderRadius: 7, padding: '5px', display: 'flex' }}>
          <Tv2 size={15} color="#fff" />
        </div>
        <span style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(1.2rem, 1.8vw, 2.2rem)', letterSpacing: '0.08em', color: 'var(--text)' }}>
          STREAM<span style={{ color: 'var(--accent)' }}>ZONE</span>
        </span>
      </button>

      {/* Sports / Movies tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 3,
      }}>
        <button onClick={() => nav('/')} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 11px', borderRadius: 7, border: 'none',
          background: 'var(--accent)', color: '#fff',
          fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
        }}>
          <Trophy size={12} /> Sports
        </button>
        <button onClick={() => nav('/movies')} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 11px', borderRadius: 7, border: 'none',
          background: 'transparent', color: 'var(--text2)',
          fontSize: '0.78rem', fontWeight: 400, cursor: 'pointer',
        }}>
          <Film size={12} /> Movies
        </button>
      </div>
    </div>
  );
}

function TeamBadge({ badge, name, size }: { badge: string; name: string; size: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 60 }}>
      <img src={badgeUrl(badge)} alt={name} width={size} height={size}
        style={{ objectFit: 'contain' }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 600, textAlign: 'center', color: 'var(--text2)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'live') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.4)',
      borderRadius: 10, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
      LIVE
    </span>
  );
  if (status === 'finished') return (
    <span style={{ background: 'var(--surface2)', borderRadius: 10, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text3)' }}>FINISHED</span>
  );
  return (
    <span style={{ background: 'rgba(77,158,247,0.1)', border: '1px solid rgba(77,158,247,0.2)', borderRadius: 10, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--blue)' }}>UPCOMING</span>
  );
}

function StreamSidebar({ streams, activeStream, onSwitch, loading }: {
  streams: Stream[];
  activeStream: Stream | null;
  onSwitch: (s: Stream) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Stream Sources
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 46, borderRadius: 8, background: 'var(--surface2)', marginBottom: 6, animation: 'shimmer 1.4s infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  if (streams.length === 0) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', color: 'var(--text3)' }}>
        <WifiOff size={28} strokeWidth={1.2} style={{ margin: '0 auto 8px' }} />
        <div style={{ fontSize: '0.82rem' }}>No streams yet</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
        {streams.length} Stream{streams.length !== 1 ? 's' : ''} Available
      </div>
      <div style={{ maxHeight: 'clamp(320px, 55vh, 700px)', overflowY: 'auto' }}>
        {streams.map((s, i) => {
          const isActive = activeStream?.embedUrl === s.embedUrl;
          return (
            <button key={i} onClick={() => onSwitch(s)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px', border: 'none', textAlign: 'left',
              background: isActive ? 'rgba(230,57,70,0.08)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              borderBottom: '1px solid var(--border)',
              color: isActive ? 'var(--text)' : 'var(--text2)',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: isActive ? 'var(--accent)' : 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 700, color: isActive ? '#fff' : 'var(--text3)',
                flexShrink: 0,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {s.source}
                  {s.hd && <span style={{ fontSize: '0.58rem', background: 'var(--gold)', color: '#000', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>HD</span>}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 1 }}>
                  Stream #{s.streamNo}{s.language && s.language !== 'unknown' ? ` · ${s.language}` : ''}
                </div>
              </div>
              {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, animation: 'pulse 1.2s infinite' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
