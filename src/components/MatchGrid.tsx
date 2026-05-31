import type { EnrichedMatch } from '../types';
import MatchCard from './MatchCard';

interface MatchGridProps {
  matches: EnrichedMatch[];
  onMatchClick: (m: EnrichedMatch) => void;
  loading: boolean;
}

export default function MatchGrid({ matches, onMatchClick, loading }: MatchGridProps) {
  if (loading) {
    return (
      <div className="match-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 12, padding: '14px 20px',
      }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            height: 155, borderRadius: 'var(--radius)',
            background: 'var(--surface)',
            animation: 'shimmer 1.5s infinite',
            animationDelay: `${i * 0.07}s`,
          }} />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, padding: '64px 20px', color: 'var(--text3)',
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>
        </svg>
        <span style={{ fontSize: '0.88rem' }}>No matches found</span>
      </div>
    );
  }

  return (
    <div className="match-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: 12, padding: '14px 20px',
    }}>
      {matches.map(m => (
        <MatchCard key={m.id} match={m} onClick={() => onMatchClick(m)} />
      ))}
    </div>
  );
}
