/**
 * ViewerBadge — prominent "X,XXX watching now" badge shown above the player.
 * Shows 10,000+ immediately (before API responds) then updates with real count.
 * Pulses the dot to signal it's live data.
 */

import { useEffect, useState } from 'react';
import { useViewCount, formatViewCount } from '../hooks/useViewCount';

interface ViewerBadgeProps {
  id: string | number;
  active?: boolean;    // only increment when stream is actually playing
  large?: boolean;     // larger size for watch pages vs card size
}

export default function ViewerBadge({ id, active = true, large = false }: ViewerBadgeProps) {
  const count = useViewCount(id, active);
  const [displayed, setDisplayed] = useState<number>(10_000);

  // As soon as we get a real count from server, use it
  useEffect(() => {
    if (count !== null) setDisplayed(count);
  }, [count]);

  if (large) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'rgba(230,57,70,0.1)',
        border: '1px solid rgba(230,57,70,0.3)',
        borderRadius: 24, padding: '6px 14px',
      }}>
        {/* Pulsing live dot */}
        <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'var(--accent)', animation: 'pulse 1.4s infinite',
          }} />
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'var(--accent)',
          }} />
        </span>
        <span style={{
          fontFamily: 'Bebas Neue', fontSize: '1rem', letterSpacing: '0.06em',
          color: 'var(--text)',
        }}>
          {formatViewCount(displayed)}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500 }}>
          watching now
        </span>
      </div>
    );
  }

  // Small version for cards
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.67rem', color: 'var(--text3)',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: active ? 'var(--accent)' : 'var(--text3)',
        display: 'inline-block',
        animation: active ? 'pulse 1.4s infinite' : 'none',
      }} />
      {formatViewCount(displayed)}
    </span>
  );
}
