import { Radio, Clock, CheckCircle } from 'lucide-react';

export type StatusFilter = 'all' | 'live' | 'upcoming' | 'finished';

interface StatusTabsProps {
  active: StatusFilter;
  onChange: (s: StatusFilter) => void;
  counts: { live: number; upcoming: number; finished: number; };
}

export default function StatusTabs({ active, onChange, counts }: StatusTabsProps) {
  const tabs: { id: StatusFilter; label: string; icon: React.ReactNode; color: string; count: number }[] = [
    { id: 'all', label: 'All', icon: null, color: 'var(--text2)', count: counts.live + counts.upcoming + counts.finished },
    { id: 'live', label: 'Live', icon: <Radio size={13} />, color: 'var(--accent)', count: counts.live },
    { id: 'upcoming', label: 'Upcoming', icon: <Clock size={13} />, color: 'var(--blue)', count: counts.upcoming },
    { id: 'finished', label: 'Finished', icon: <CheckCircle size={13} />, color: 'var(--text3)', count: counts.finished },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, padding: '16px 20px 0', flexWrap: 'wrap' }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 20,
            border: isActive ? `1px solid ${tab.color}` : '1px solid var(--border)',
            background: isActive ? `${tab.color}18` : 'transparent',
            color: isActive ? tab.color : 'var(--text2)',
            fontSize: '0.82rem', fontWeight: isActive ? 600 : 400,
            transition: 'all 0.15s',
          }}>
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: isActive ? tab.color : 'var(--border2)',
                color: isActive ? '#fff' : 'var(--text3)',
                borderRadius: 10, padding: '1px 6px',
                fontSize: '0.7rem', fontWeight: 700
              }}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
