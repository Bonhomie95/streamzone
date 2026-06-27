import { useState } from 'react';
import { Clock, Star, Play, Bell } from 'lucide-react';
import type { EnrichedMatch } from '../types';
import ViewerBadge from './ViewerBadge';
import { formatViewCount } from '../hooks/useViewCount';
import { badgeUrl } from '../api';

interface MatchCardProps {
  match: EnrichedMatch;
  onClick: () => void;
  viewCount?: number | null;
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Today ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export default function MatchCard({ match, onClick, viewCount }: MatchCardProps) {
  const [hovered, setHovered] = useState(false);
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const hasTeams = match.teams?.home && match.teams?.away;
  const homeBadge = match.teams?.home?.badge ? badgeUrl(match.teams.home.badge) : '';
  const awayBadge = match.teams?.away?.badge ? badgeUrl(match.teams.away.badge) : '';

  // Build the watch URL so we can support open-in-new-tab natively
  const watchUrl = `/watch/${encodeURIComponent(match.id)}`;

  function handleClick(e: React.MouseEvent) {
    // Upcoming matches have no live stream — block navigation
    if (!isLive && !isFinished) {
      e.preventDefault();
      return;
    }
    // Let middle-click, Ctrl+click, Cmd+click open natively in a new tab
    if (e.button === 1 || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    onClick();
  }

  return (
    <a
      href={watchUrl}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: 'none', color: 'inherit',
        background: 'var(--surface)',
        border: `1px solid ${hovered ? (isLive ? 'rgba(230,57,70,0.5)' : 'var(--border2)') : 'var(--border)'}`,
        borderRadius: 'var(--radius)', overflow: 'hidden', cursor: (!isLive && !isFinished) ? 'default' : 'pointer',
        transition: 'all 0.2s', position: 'relative',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? (isLive ? '0 8px 32px rgba(230,57,70,0.12)' : '0 8px 24px rgba(0,0,0,0.3)') : 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Status stripe */}
      <div style={{ height: 3, flexShrink: 0, background: isLive ? 'var(--accent)' : isFinished ? 'var(--border)' : 'var(--blue)' }} />

      <div style={{ padding: 'clamp(10px, 1.2vw, 18px) clamp(12px, 1.4vw, 20px)', display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1vw, 14px)', flex: 1 }}>

        {/* Top row: status badge + category */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {isLive ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.4)',
                borderRadius: 10, padding: 'clamp(2px, 0.3vw, 4px) clamp(6px, 0.8vw, 10px)',
                fontSize: 'clamp(0.6rem, 0.75vw, 0.78rem)', fontWeight: 700, color: 'var(--accent)',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                LIVE
              </span>
            ) : isFinished ? (
              <span style={{ background: 'var(--surface2)', borderRadius: 10, padding: 'clamp(2px, 0.3vw, 4px) clamp(6px, 0.8vw, 10px)', fontSize: 'clamp(0.6rem, 0.75vw, 0.78rem)', fontWeight: 600, color: 'var(--text3)' }}>FT</span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(77,158,247,0.1)', border: '1px solid rgba(77,158,247,0.2)',
                borderRadius: 10, padding: 'clamp(2px, 0.3vw, 4px) clamp(6px, 0.8vw, 10px)',
                fontSize: 'clamp(0.6rem, 0.75vw, 0.78rem)', fontWeight: 600, color: 'var(--blue)',
              }}>
                <Clock size={9} />
                {formatDate(match.date)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {match.popular && <Star size={11} color="var(--gold)" fill="var(--gold)" />}
            <span style={{ fontSize: 'clamp(0.6rem, 0.75vw, 0.78rem)', color: 'var(--text3)', textTransform: 'capitalize' }}>{match.category}</span>
          </div>
        </div>

        {/* Teams or title */}
        {hasTeams ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 0.8vw, 12px)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
              {homeBadge && (
                <img src={homeBadge} alt={match.teams!.home!.name}
                  style={{ width: 'clamp(28px, 3vw, 48px)', height: 'clamp(28px, 3vw, 48px)', objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span style={{ fontSize: 'clamp(0.68rem, 0.82vw, 0.92rem)', fontWeight: 600, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2 }}>
                {match.teams!.home!.name}
              </span>
            </div>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(0.85rem, 1vw, 1.2rem)', color: 'var(--text3)', letterSpacing: '0.1em', minWidth: 24, textAlign: 'center' }}>VS</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
              {awayBadge && (
                <img src={awayBadge} alt={match.teams!.away!.name}
                  style={{ width: 'clamp(28px, 3vw, 48px)', height: 'clamp(28px, 3vw, 48px)', objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span style={{ fontSize: 'clamp(0.68rem, 0.82vw, 0.92rem)', fontWeight: 600, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2 }}>
                {match.teams!.away!.name}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 'clamp(0.82rem, 1vw, 1.1rem)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{match.title}</div>
          </div>
        )}

        {/* Footer: sources + viewers + action button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
          <span style={{ fontSize: 'clamp(0.6rem, 0.72vw, 0.78rem)', color: 'var(--text3)' }}>
            {match.sources.length} src
          </span>

          {/* Viewer count — live matches only */}
          {isLive && (
            viewCount == null
              ? <ViewerBadge id={match.id} active={true} />
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'clamp(0.6rem, 0.72vw, 0.78rem)', color: 'var(--accent)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.4s infinite' }} />
                  {formatViewCount(viewCount)} watching
                </span>
          )}
          {!isLive && <span />}

          {/* Action button — Watch (live only), Replay (finished), or disabled upcoming */}
          {isLive ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 'clamp(4px, 0.5vw, 7px)',
              background: 'var(--accent)',
              border: '1px solid transparent',
              borderRadius: 20,
              padding: 'clamp(4px, 0.5vw, 7px) clamp(8px, 1vw, 14px)',
              color: '#fff',
              fontSize: 'clamp(0.62rem, 0.78vw, 0.82rem)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              <Play fill="currentColor" color="currentColor" style={{ width: 'clamp(9px, 1vw, 13px)', height: 'clamp(9px, 1vw, 13px)', marginLeft: 1 }} />
              Watch
            </div>
          ) : isFinished ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 'clamp(4px, 0.5vw, 7px)',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 'clamp(4px, 0.5vw, 7px) clamp(8px, 1vw, 14px)',
              color: 'var(--text3)',
              fontSize: 'clamp(0.62rem, 0.78vw, 0.82rem)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              <Play fill="currentColor" color="currentColor" style={{ width: 'clamp(9px, 1vw, 13px)', height: 'clamp(9px, 1vw, 13px)', marginLeft: 1 }} />
              Replay
            </div>
          ) : (
            // Upcoming — not watchable yet, show a non-clickable reminder badge
            <div
              onClick={e => e.preventDefault()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'clamp(4px, 0.5vw, 7px)',
                background: 'rgba(77,158,247,0.08)',
                border: '1px solid rgba(77,158,247,0.2)',
                borderRadius: 20,
                padding: 'clamp(4px, 0.5vw, 7px) clamp(8px, 1vw, 14px)',
                color: 'var(--blue)',
                fontSize: 'clamp(0.62rem, 0.78vw, 0.82rem)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                opacity: 0.7,
                pointerEvents: 'none',
              }}>
              <Bell style={{ width: 'clamp(9px, 1vw, 13px)', height: 'clamp(9px, 1vw, 13px)' }} />
              Not Live Yet
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </a>
  );
}
