import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, ChevronDown, ChevronUp, ExternalLink,
  Wifi, WifiOff, Maximize2, Minimize2, Tv2, ChevronRight,
  AlertTriangle, CheckCircle, Loader, RefreshCw, Trophy, Film
} from 'lucide-react';
import { fetchMovieDetails, fetchSimilar, getEmbedSources } from '../api';
import ViewerBadge from '../components/ViewerBadge';
import { useWatchProgress, withTimestamp, formatDuration, loadProgress } from '../hooks/useWatchProgress';
import AdBanner from '../components/AdBanner';
import type { Movie, MediaType, Stream } from '../types';

type ProbeStatus = 'idle' | 'probing' | 'found' | 'all_failed';

// Probe a URL by fetching it with no-cors — if it resolves (even opaque) the domain is alive
// If DNS fails or connection refused, it throws
async function probeUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeout);
    return true; // opaque response = domain alive
  } catch {
    return false; // DNS fail / refused / timeout
  }
}

export default function MovieWatch() {
  const { type, tmdbId } = useParams<{ type: string; tmdbId: string }>();
  const navigate = useNavigate();
  const mediaType = (type ?? 'movie') as MediaType;
  const id = Number(tmdbId);

  const [movie, setMovie] = useState<(Movie & {
    tagline?: string;
    runtime?: number | null;
    seasons?: { season: number; episodes: number }[];
  }) | null>(null);
  const [similar, setSimilar] = useState<Movie[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>('idle');
  const [probeProgress, setProbeProgress] = useState<{ current: number; total: number; name: string }>({ current: 0, total: 0, name: '' });
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, 'ok' | 'dead' | 'unknown'>>({});
  const [loading, setLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [resumeElapsed, setResumeElapsed] = useState(0);

  const { elapsed, clear: clearProgress } = useWatchProgress({
    tmdbId: id,
    mediaType,
    season: mediaType === 'tv' ? selectedSeason : undefined,
    episode: mediaType === 'tv' ? selectedEpisode : undefined,
    isPlaying,
    sourceName: activeStream?.source ?? '',
    title: movie?.title,
    poster: movie?.poster,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    load();
  }, [tmdbId, type]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  async function load() {
    setLoading(true);
    setProbeStatus('idle');
    setSourceStatuses({});
    setIframeError(false);
    try {
      const [details, sim] = await Promise.all([
        fetchMovieDetails(id, mediaType),
        fetchSimilar(id, mediaType),
      ]);
      setMovie(details);
      setSimilar(sim);
      const srcs = getEmbedSources(id, mediaType);
      setStreams(srcs);
      setLoading(false);
      // Check for saved progress before probing
      const saved = loadProgress(mediaType, id);
      if (saved && saved.elapsed > 30) {
        setResumeElapsed(saved.elapsed);
        setShowResumeBanner(true);
      }
      // Start probing immediately after metadata loads
      await probeAndSet(srcs);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }

  const probeAndSet = useCallback(async (srcs: Stream[]) => {
    setProbeStatus('probing');
    setProbeProgress({ current: 0, total: srcs.length, name: srcs[0]?.source ?? '' });
    const statuses: Record<string, 'ok' | 'dead' | 'unknown'> = {};

    for (let i = 0; i < srcs.length; i++) {
      const s = srcs[i];
      setProbeProgress({ current: i + 1, total: srcs.length, name: s.source });
      const alive = await probeUrl(s.embedUrl);
      statuses[s.id] = alive ? 'ok' : 'dead';
      setSourceStatuses({ ...statuses });

      if (alive) {
        // Found a live one — set it and stop probing
        setActiveStream(s);
        setProbeStatus('found');
        setIsPlaying(true);
        // Continue probing the rest in background to update status indicators
        for (let j = i + 1; j < srcs.length; j++) {
          const rest = srcs[j];
          const r = await probeUrl(rest.embedUrl);
          statuses[rest.id] = r ? 'ok' : 'dead';
          setSourceStatuses({ ...statuses });
        }
        return;
      }
    }

    // All failed
    setProbeStatus('all_failed');
    setActiveStream(srcs[0] ?? null); // set first anyway, user can try manually
  }, []);

  async function switchToEpisode(season: number, episode: number) {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setIframeError(false);
    setActiveStream(null);
    setProbeStatus('idle');
    setSourceStatuses({});
    const srcs = getEmbedSources(id, mediaType, season, episode);
    setStreams(srcs);
    setShowEpisodes(false);
    await probeAndSet(srcs);
  }

  function switchStream(s: Stream) {
    setActiveStream(s);
    setIframeError(false);
    setIsPlaying(true);
  }

  async function toggleFullscreen() {
    const el = document.getElementById('movie-player');
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen();
    else await document.exitFullscreen();
  }

  async function retryProbe() {
    setIframeError(false);
    await probeAndSet(streams);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <WatchTopBar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--text2)' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--border2)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <span style={{ fontSize: '0.85rem' }}>Loading...</span>
      </div>
    </div>
  );

  if (!movie) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <WatchTopBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text3)' }}>
        <WifiOff size={40} strokeWidth={1.2} />
        <span>Content not found</span>
        <button onClick={() => navigate('/movies')} style={{ marginTop: 8, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: '0.85rem', fontWeight: 600 }}>
          Back to Movies
        </button>
      </div>
    </div>
  );

  const currentEmbedLabel = mediaType === 'tv' ? `S${selectedSeason} E${selectedEpisode}` : movie.title;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <WatchTopBar />

      {/* Ad */}
      <div style={{ padding: '8px 16px 0', display: 'flex', justifyContent: 'center' }}>
        <AdBanner size="leaderboard" />
      </div>

      <div style={{ maxWidth: 1400, width: '100%', margin: '0 auto', padding: '14px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Resume banner ── */}
        {showResumeBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px',
            animation: 'fadeIn .3s ease',
          }}>
            <span style={{ fontSize: '1rem' }}>▶️</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600 }}>
                Resume from {formatDuration(Math.max(0, resumeElapsed - 10))}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text3)', marginLeft: 8 }}>
                You were watching this earlier
              </span>
            </div>
            <button
              onClick={() => {
                if (activeStream) {
                  const resumeUrl = withTimestamp(activeStream.embedUrl, resumeElapsed);
                  setActiveStream({ ...activeStream, embedUrl: resumeUrl });
                }
                setShowResumeBanner(false);
              }}
              style={{
                background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)',
                borderRadius: 7, padding: '5px 12px', color: '#a78bfa',
                fontSize: '0.78rem', fontWeight: 600, flexShrink: 0,
              }}
            >Resume</button>
            <button
              onClick={() => { setShowResumeBanner(false); clearProgress(); }}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '0.78rem', flexShrink: 0, padding: '4px 6px' }}
            >Start over</button>
          </div>
        )}

        {/* ── Warning banner ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px',
        }}>
          <AlertTriangle size={16} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
            We automatically find a working stream for you. If playback fails or looks wrong,
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}> try another source</strong> from the list on the right — different sources have different availability by region.
          </p>
        </div>

        {/* ── Probe status bar ── */}
        {probeStatus === 'probing' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--blue-dim)', border: '1px solid rgba(77,158,247,0.2)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          }}>
            <Loader size={14} color="var(--blue)" style={{ animation: 'spin .8s linear infinite', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--blue)', fontWeight: 600 }}>
                Finding best stream… {probeProgress.current}/{probeProgress.total}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text3)', marginLeft: 8 }}>
                Checking {probeProgress.name}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ width: 100, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', background: 'var(--blue)', borderRadius: 2, width: `${(probeProgress.current / probeProgress.total) * 100}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {probeStatus === 'found' && activeStream && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(45,206,137,0.08)', border: '1px solid rgba(45,206,137,0.2)',
            borderRadius: 'var(--radius-sm)', padding: '8px 14px',
          }}>
            <CheckCircle size={14} color="var(--green)" />
            <span style={{ fontSize: '0.78rem', color: 'var(--green)', fontWeight: 600 }}>
              Live stream found · {activeStream.source}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
              · {Object.values(sourceStatuses).filter(v => v === 'ok').length} of {streams.length} sources working
            </span>
          </div>
        )}

        {probeStatus === 'all_failed' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.2)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          }}>
            <WifiOff size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600, flex: 1 }}>
              All sources returned errors. The content may not be available yet — try again later.
            </span>
            <button onClick={retryProbe} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1px solid rgba(230,57,70,0.3)',
              borderRadius: 6, padding: '4px 10px',
              color: 'var(--accent)', fontSize: '0.75rem', flexShrink: 0,
            }}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {/* ── Title + Meta ── */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {movie.poster && (
            <img src={movie.poster} alt={movie.title}
              style={{ width: 100, borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }}
              className="desktop-only" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(1.4rem,4vw,2.2rem)', letterSpacing: '0.04em', lineHeight: 1.1 }}>{movie.title}</h1>
            {movie.tagline && <p style={{ fontSize: '0.82rem', color: 'var(--accent)', fontStyle: 'italic', marginTop: 4 }}>{movie.tagline}</p>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              {movie.year && <span style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{movie.year}</span>}
              {movie.runtime && <span style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{movie.runtime}m</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 600 }}>
                <Star size={11} fill="var(--gold)" />{movie.rating}
              </span>
              {movie.mediaType === 'tv' && (
                <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 5, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 700 }}>TV SERIES</span>
              )}
              {movie.genres.map(g => (
                <span key={g} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 8px', fontSize: '0.68rem', color: 'var(--text2)' }}>{g}</span>
              ))}
            </div>
            {movie.overview && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6, marginTop: 10, maxWidth: 680 }}>{movie.overview}</p>
            )}
          </div>
        </div>

        {/* ── Viewer count ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ViewerBadge id={id} active={probeStatus === 'found'} large />
        </div>

        {/* ── TV Episode selector ── */}
        {mediaType === 'tv' && movie.seasons && movie.seasons.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <button onClick={() => setShowEpisodes(v => !v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: 'none', border: 'none', color: 'var(--text)', fontSize: '0.88rem', fontWeight: 600,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tv2 size={15} color="var(--accent)" />
                Now Watching: S{selectedSeason} · E{selectedEpisode}
              </span>
              {showEpisodes ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {showEpisodes && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {movie.seasons.map(s => (
                    <button key={s.season} onClick={() => setSelectedSeason(s.season)} style={{
                      padding: '5px 12px', borderRadius: 7, border: '1px solid',
                      borderColor: selectedSeason === s.season ? 'var(--accent)' : 'var(--border)',
                      background: selectedSeason === s.season ? 'var(--accent-dim)' : 'transparent',
                      color: selectedSeason === s.season ? 'var(--accent)' : 'var(--text2)',
                      fontSize: '0.78rem', fontWeight: 500,
                    }}>S{s.season}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Array.from({ length: movie.seasons.find(s => s.season === selectedSeason)?.episodes ?? 0 }, (_, i) => i + 1).map(ep => (
                    <button key={ep} onClick={() => switchToEpisode(selectedSeason, ep)} style={{
                      width: 38, height: 38, borderRadius: 7, border: '1px solid',
                      borderColor: selectedEpisode === ep ? 'var(--accent)' : 'var(--border)',
                      background: selectedEpisode === ep ? 'var(--accent-dim)' : 'var(--surface2)',
                      color: selectedEpisode === ep ? 'var(--accent)' : 'var(--text2)',
                      fontSize: '0.78rem', fontWeight: 500,
                    }}>{ep}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Player + Source sidebar ── */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Player */}
          <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div id="movie-player" style={{
              position: 'relative', background: '#000',
              borderRadius: isFullscreen ? 0 : 'var(--radius)',
              border: '1px solid var(--border)', aspectRatio: '16/9',
              overflow: 'hidden',
            }}>
              {/* Probing overlay */}
              {probeStatus === 'probing' && !activeStream && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'var(--bg2)', zIndex: 5 }}>
                  <div style={{ width: 40, height: 40, border: '3px solid var(--border2)', borderTop: '3px solid var(--blue)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Finding best stream…</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Checking {probeProgress.name}</div>
                  </div>
                </div>
              )}

              {iframeError ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg2)', padding: 24, textAlign: 'center' }}>
                  <WifiOff size={44} strokeWidth={1.2} color="var(--text3)" />
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 6 }}>Playback blocked</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 16 }}>This source refuses to embed. Pick another from the list.</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {streams.filter(s => s.id !== activeStream?.id && sourceStatuses[s.id] !== 'dead').slice(0, 3).map(s => (
                        <button key={s.id} onClick={() => switchStream(s)} style={{
                          padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border2)',
                          background: 'var(--surface)', color: 'var(--text2)', fontSize: '0.8rem',
                        }}>{s.source}</button>
                      ))}
                      {activeStream && (
                        <a href={activeStream.embedUrl} target="_blank" rel="noreferrer" style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                          borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                        }}><ExternalLink size={13} /> Open Direct</a>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeStream ? (
                <iframe
                  key={activeStream.embedUrl}
                  src={activeStream.embedUrl}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  allowFullScreen
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  onError={() => setIframeError(true)}
                />
              ) : null}

              {/* Fullscreen button */}
              {activeStream && !iframeError && probeStatus !== 'probing' && (
                <button onClick={toggleFullscreen} style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 7, padding: 6, color: '#fff', display: 'flex',
                  backdropFilter: 'blur(6px)',
                }}>
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              )}
            </div>

            {/* Active stream info bar */}
            {activeStream && probeStatus !== 'probing' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '8px 14px', flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wifi size={13} color="var(--green)" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{activeStream.source}</span>
                  <span style={{ fontSize: '0.65rem', background: 'var(--gold)', color: '#000', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>HD</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{currentEmbedLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {elapsed > 10 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
                      ⏱ {formatDuration(elapsed)}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

                    <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                      {streams.indexOf(activeStream) + 1} of {streams.length}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile source pills */}
            <div className="mobile-only movie-source-grid" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {streams.map(s => {
                const status = sourceStatuses[s.id];
                const isActive = activeStream?.id === s.id;
                return (
                  <button key={s.id} onClick={() => switchStream(s)} style={{
                    padding: '5px 12px', borderRadius: 6, border: '1px solid',
                    borderColor: isActive ? 'var(--accent)' : status === 'dead' ? 'var(--border)' : status === 'ok' ? 'rgba(45,206,137,0.4)' : 'var(--border)',
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    color: isActive ? 'var(--accent)' : status === 'dead' ? 'var(--text3)' : 'var(--text2)',
                    fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4,
                    opacity: status === 'dead' ? 0.5 : 1,
                  }}>
                    {status === 'ok' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />}
                    {status === 'dead' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text3)', display: 'inline-block' }} />}
                    {status === 'unknown' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border2)', display: 'inline-block' }} />}
                    {s.source}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source sidebar — desktop */}
          <div className="desktop-only" style={{ width: 260, flexShrink: 0 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div style={{ padding: '11px 14px 7px', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                Stream Sources
              </div>
              {streams.map((s, i) => {
                const isActive = activeStream?.id === s.id;
                const status = sourceStatuses[s.id] ?? 'unknown';
                const dotColor = status === 'ok' ? 'var(--green)' : status === 'dead' ? 'var(--accent)' : 'var(--text3)';
                const dotAnim = status === 'unknown' ? 'pulse 1.2s infinite' : 'none';
                return (
                  <button key={s.id} onClick={() => switchStream(s)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', border: 'none', textAlign: 'left',
                    background: isActive ? 'rgba(230,57,70,0.07)' : 'transparent',
                    borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    borderBottom: '1px solid var(--border)',
                    color: isActive ? 'var(--text)' : status === 'dead' ? 'var(--text3)' : 'var(--text2)',
                    cursor: 'pointer', opacity: status === 'dead' ? 0.55 : 1,
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: isActive ? 'var(--accent)' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: isActive ? '#fff' : 'var(--text3)', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{s.source}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
                        {status === 'ok' ? 'Live ·' : status === 'dead' ? 'Unavailable ·' : 'Checking ·'} HD
                      </div>
                    </div>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, animation: dotAnim }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'Bebas Neue', fontSize: '1.15rem', letterSpacing: '0.06em' }}>More Like This</h3>
              <ChevronRight size={16} color="var(--text3)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {similar.map(m => (
                <div key={m.id} onClick={() => navigate(`/movies/watch/${m.mediaType}/${m.tmdbId}`)} style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', transition: 'transform 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
                  <div style={{ aspectRatio: '2/3', background: 'var(--surface2)' }}>
                    {m.poster && <img src={m.poster} alt={m.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: 'var(--text)' }}>{m.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AdBanner size="rectangle" />
        </div>
      </div>
    </div>
  );
}

function WatchTopBar() {
  const navigate = useNavigate();
  return (
    <div className="watch-topbar" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px', height: 'var(--header-h)',
      background: 'rgba(8,10,15,0.96)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <button onClick={() => navigate('/movies')} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '6px 12px', color: 'var(--text2)', fontSize: '0.82rem', fontWeight: 500,
      }}>
        <ArrowLeft size={14} /> Back
      </button>
      <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0 }}>
        <div style={{ background: 'var(--accent)', borderRadius: 7, padding: 5, display: 'flex' }}>
          <Tv2 size={15} color="#fff" />
        </div>
        <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', letterSpacing: '0.08em', color: 'var(--text)' }}>
          STREAM<span style={{ color: 'var(--accent)' }}>ZONE</span>
        </span>
      </button>
      <WatchModeTabs active="movies" />
    </div>
  );
}

function WatchModeTabs({ active }: { active: 'sports' | 'movies' }) {
  const navigate = useNavigate();
  return (
    <div className="watch-mode-tabs" style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 3, marginLeft: 'auto',
    }}>
      {[
        { id: 'sports', path: '/', label: 'Sports', icon: <Trophy size={13} /> },
        { id: 'movies', path: '/movies', label: 'Movies', icon: <Film size={13} /> },
      ].map(tab => {
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => navigate(tab.path)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7, border: 'none',
            background: isActive ? 'var(--accent)' : 'transparent',
            color: isActive ? '#fff' : 'var(--text2)',
            fontSize: '0.8rem', fontWeight: isActive ? 700 : 400,
          }}>
            {tab.icon}{tab.label}
          </button>
        );
      })}
    </div>
  );
}
