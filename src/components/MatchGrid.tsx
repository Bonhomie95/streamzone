import { useState, useEffect } from 'react';
import type { EnrichedMatch } from '../types';
import { fetchBulkViewCounts } from '../hooks/useViewCount';
import MatchCard from './MatchCard';

interface MatchGridProps {
  matches: EnrichedMatch[];
  onMatchClick: (m: EnrichedMatch) => void;
  loading: boolean;
}

// Responsive card min width: wider screens get bigger cards
function getCardMinWidth(): string {
  const w = window.innerWidth;
  if (w >= 3840) return '420px';
  if (w >= 2560) return '340px';
  if (w >= 1600) return '280px';
  return '240px';
}

export default function MatchGrid({ matches, onMatchClick, loading }: MatchGridProps) {
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const minWidth = getCardMinWidth();

  useEffect(() => {
    if (matches.length === 0) return;
    fetchBulkViewCounts(matches.map(m => m.id)).then(setViewCounts);
  }, [matches.map(m => m.id).join(',')]);

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))`,
    gap: 'clamp(10px, 1.2vw, 20px)',
    padding: 'clamp(12px, 1.5vw, 28px) clamp(14px, 2vw, 36px)',
  };

  if (loading) {
    return (
      <div style={gridStyle}>
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
    <div style={gridStyle}>
      {matches.map(m => (
        <MatchCard key={m.id} match={m} onClick={() => onMatchClick(m)} viewCount={viewCounts[m.id] ?? null} />
      ))}
    </div>
  );
}
