import { Clock, Star, ChevronRight } from 'lucide-react';
import type { EnrichedMatch } from '../types';
import { badgeUrl } from '../api';

interface MatchCardProps {
  match: EnrichedMatch;
  onClick: () => void;
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Today ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export default function MatchCard({ match, onClick }: MatchCardProps) {
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const hasTeams = match.teams?.home && match.teams?.away;
  const homeBadge = match.teams?.home?.badge ? badgeUrl(match.teams.home.badge) : '';
  const awayBadge = match.teams?.away?.badge ? badgeUrl(match.teams.away.badge) : '';

  return (
    <div onClick={onClick} style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer',
      transition: 'all 0.2s', position: 'relative',
    }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = isLive ? 'rgba(230,57,70,0.5)' : 'var(--border2)';
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = isLive ? '0 8px 32px rgba(230,57,70,0.12)' : '0 8px 24px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--border)';
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ height: 3, background: isLive ? 'var(--accent)' : isFinished ? 'var(--border)' : 'var(--blue)' }} />

      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isLive ? (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.4)',
                borderRadius: 10, padding: '2px 7px',
                fontSize: '0.62rem', fontWeight: 700, color: 'var(--accent)',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                LIVE
              </span>
            ) : isFinished ? (
              <span style={{ background: 'var(--surface2)', borderRadius: 10, padding: '2px 7px', fontSize: '0.62rem', fontWeight: 600, color: 'var(--text3)' }}>FT</span>
            ) : (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(77,158,247,0.1)', border: '1px solid rgba(77,158,247,0.2)',
                borderRadius: 10, padding: '2px 7px', fontSize: '0.62rem', fontWeight: 600, color: 'var(--blue)'
              }}>
                <Clock size={9} />
                {formatDate(match.date)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {match.popular && <Star size={11} color="var(--gold)" fill="var(--gold)" />}
            <span style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{match.category}</span>
            <ChevronRight size={13} color="var(--text3)" />
          </div>
        </div>

        {hasTeams ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
              {homeBadge && (
                <img src={homeBadge} alt={match.teams!.home!.name}
                  width={36} height={36} style={{ objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span style={{ fontSize: '0.74rem', fontWeight: 600, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2 }}>
                {match.teams!.home!.name}
              </span>
            </div>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--text3)', letterSpacing: '0.1em', minWidth: 28, textAlign: 'center' }}>VS</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
              {awayBadge && (
                <img src={awayBadge} alt={match.teams!.away!.name}
                  width={36} height={36} style={{ objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span style={{ fontSize: '0.74rem', fontWeight: 600, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2 }}>
                {match.teams!.away!.name}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ padding: '6px 0' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{match.title}</div>
          </div>
        )}

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.67rem', color: 'var(--text3)' }}>{match.sources.length} source{match.sources.length !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: '0.67rem', color: isLive ? 'var(--green)' : 'var(--text3)', fontWeight: 600 }}>
            {isLive ? '▶ Watch Now' : isFinished ? 'Replay' : 'Upcoming'}
          </span>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
