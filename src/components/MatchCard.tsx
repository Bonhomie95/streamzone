import { useState, useEffect, useRef } from 'react';
import { Clock, Star, Play, Bell, BellOff, Heart } from 'lucide-react';
import type { EnrichedMatch } from '../types';
import ViewerBadge from './ViewerBadge';
import { formatViewCount } from '../hooks/useViewCount';
import { badgeUrl } from '../api';
import { useMatchReminder } from '../hooks/useMatchReminder';
import { useFavouriteTeams } from '../hooks/useFavourites';
import { showToast } from './Toast';

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

function useCountdown(targetMs: number) {
  const [diff, setDiff] = useState(() => targetMs - Date.now());
  useEffect(() => {
    if (diff <= 0) return;
    const id = setInterval(() => {
      const remaining = targetMs - Date.now();
      setDiff(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return diff;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Starting soon';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 48) return `in ${Math.floor(h / 24)}d`;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${s}s`;
  return `in ${s}s`;
}

export default function MatchCard({ match, onClick, viewCount }: MatchCardProps) {
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isUpcoming = !isLive && !isFinished;
  const hasTeams = match.teams?.home && match.teams?.away;
  const homeBadge = match.teams?.home?.badge ? badgeUrl(match.teams.home.badge) : '';
  const awayBadge = match.teams?.away?.badge ? badgeUrl(match.teams.away.badge) : '';
  const countdown = useCountdown(isUpcoming ? match.date : 0);

  const { isSet: reminderSet, toggle: toggleReminder } = useMatchReminder(match);
  const { isFav, toggle: toggleFav } = useFavouriteTeams();

  const matchFaved =
    (match.teams?.home?.name && isFav(match.teams.home.name)) ||
    (match.teams?.away?.name && isFav(match.teams.away.name));

  const watchUrl = `/watch/${encodeURIComponent(match.id)}`;

  function handleClick(e: React.MouseEvent) {
    if (e.button === 1 || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    onClick();
  }

  function handleBell(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggleReminder().then(() => {
      showToast(
        reminderSet
          ? 'Reminder cancelled'
          : "Reminder set — keep StreamZone open to receive it, or install the app for background alerts",
        reminderSet ? 'info' : 'success'
      );
    });
  }

  function handleHeart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!hasTeams) return;
    const home = match.teams?.home?.name ?? '';
    const away = match.teams?.away?.name ?? '';
    if (home) toggleFav(home);
    if (away) toggleFav(away);
    const names = [home, away].filter(Boolean).join(' and ');
    showToast(
      matchFaved
        ? 'Removed from favourites'
        : `Following ${names} — their future matches appear in My Favourites`,
      matchFaved ? 'info' : 'success'
    );
  }

  // Show action overlay on hover (desktop) or always show faint on mobile
  const showOverlay = hovered;

  return (
    <a
      ref={cardRef}
      href={watchUrl}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: 'none', color: 'inherit',
        background: 'var(--surface)',
        border: `1px solid ${hovered ? (isLive ? 'rgba(230,57,70,0.5)' : 'var(--border2)') : matchFaved ? 'rgba(230,57,70,0.25)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer',
        transition: 'all 0.18s', position: 'relative',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.35)' : 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Status stripe */}
      <div style={{ height: 3, flexShrink: 0, background: isLive ? 'var(--accent)' : isFinished ? 'var(--border)' : 'var(--blue)' }} />

      <div style={{ padding: 'clamp(10px,1.2vw,16px) clamp(12px,1.4vw,18px)', display: 'flex', flexDirection: 'column', gap: 'clamp(8px,1vw,12px)', flex: 1 }}>

        {/* Top row: status badge + category */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          {/* Status */}
          <div>
            {isLive ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.4)',
                borderRadius: 10, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                LIVE
              </span>
            ) : isFinished ? (
              <span style={{ background: 'var(--surface2)', borderRadius: 10, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text3)' }}>FT</span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(77,158,247,0.1)', border: '1px solid rgba(77,158,247,0.2)',
                borderRadius: 10, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--blue)',
              }}>
                <Clock size={9} />
                {countdown > 0 ? formatCountdown(countdown) : formatDate(match.date)}
              </span>
            )}
          </div>
          {/* Category + popular */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {match.popular && <Star size={11} color="var(--gold)" fill="var(--gold)" />}
            <span style={{ fontSize: '0.68rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{match.category}</span>
          </div>
        </div>

        {/* Teams or title — this is the main content, given breathing room */}
        {hasTeams ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px,0.8vw,10px)', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              {homeBadge && (
                <img src={homeBadge} alt={match.teams!.home!.name}
                  style={{ width: 'clamp(28px,3vw,44px)', height: 'clamp(28px,3vw,44px)', objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span style={{ fontSize: 'clamp(0.7rem,0.85vw,0.9rem)', fontWeight: 600, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {match.teams!.home!.name}
              </span>
            </div>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(0.9rem,1.1vw,1.2rem)', color: 'var(--text3)', letterSpacing: '0.1em', flexShrink: 0 }}>VS</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              {awayBadge && (
                <img src={awayBadge} alt={match.teams!.away!.name}
                  style={{ width: 'clamp(28px,3vw,44px)', height: 'clamp(28px,3vw,44px)', objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span style={{ fontSize: 'clamp(0.7rem,0.85vw,0.9rem)', fontWeight: 600, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {match.teams!.away!.name}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'clamp(0.82rem,1vw,1.05rem)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{match.title}</div>
          </div>
        )}

        {/* Footer: viewer count + CTA only — stripped down */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
          <div style={{ minHeight: 18 }}>
            {isLive && (
              viewCount == null
                ? <ViewerBadge id={match.id} active={true} />
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: 'var(--accent)' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.4s infinite' }} />
                    {formatViewCount(viewCount)} watching
                  </span>
            )}
          </div>

          {/* CTA button */}
          {isLive ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--accent)', borderRadius: 20, padding: '5px 12px', color: '#fff', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
              <Play fill="currentColor" color="currentColor" size={10} />Watch
            </div>
          ) : isFinished ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', color: 'var(--text3)', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
              <Play fill="currentColor" color="currentColor" size={10} />Replay
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(77,158,247,0.12)', border: '1px solid rgba(77,158,247,0.3)', borderRadius: 20, padding: '5px 12px', color: 'var(--blue)', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
              <Play fill="currentColor" color="currentColor" size={10} />Watch
            </div>
          )}
        </div>
      </div>

      {/* Hover overlay: bell + heart — desktop only, appear on hover */}
      {showOverlay && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', gap: 4, zIndex: 2,
        }}>
          {isUpcoming && (
            <button
              onClick={handleBell}
              title={reminderSet ? 'Cancel reminder' : 'Remind me 15 min before'}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: reminderSet ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
                border: `1px solid ${reminderSet ? 'var(--accent)' : 'var(--border2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: reminderSet ? '#fff' : 'var(--text2)', cursor: 'pointer',
                backdropFilter: 'blur(4px)',
              }}
            >
              {reminderSet ? <Bell size={13} fill="#fff" /> : <BellOff size={13} />}
            </button>
          )}
          {hasTeams && (
            <button
              onClick={handleHeart}
              title={matchFaved ? 'Remove from favourites' : 'Follow these teams'}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: matchFaved ? 'rgba(230,57,70,0.15)' : 'rgba(0,0,0,0.6)',
                border: `1px solid ${matchFaved ? 'rgba(230,57,70,0.5)' : 'var(--border2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: matchFaved ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Heart size={13} fill={matchFaved ? 'var(--accent)' : 'none'} />
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </a>
  );
}
