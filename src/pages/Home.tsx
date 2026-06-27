import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import SportsSidebar from '../components/SportsSidebar';
import StatusTabs from '../components/StatusTabs';
import MatchGrid from '../components/MatchGrid';
import AdBanner from '../components/AdBanner';
import AdPopup from '../components/AdPopup';
import { fetchSports, fetchAllMatches, fetchDaddyEvents } from '../api';
import type { Sport, EnrichedMatch } from '../types';
import type { StatusFilter } from '../components/StatusTabs';

export default function Home() {
  const navigate = useNavigate();
  // apiSports only used for display names — NOT for IDs or filtering
  const [apiSports, setApiSports] = useState<Sport[]>([]);
  const [allMatches, setAllMatches] = useState<EnrichedMatch[]>([]);
  const [selectedSport, setSelectedSport] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    fetchSports().then(setApiSports).catch(() => {});
    loadAllMatches();
  }, []);

  async function loadAllMatches() {
    const gen = ++fetchGenRef.current;
    setLoading(true);

    const [streamed, daddy] = await Promise.all([
      fetchAllMatches().catch(() => [] as EnrichedMatch[]),
      fetchDaddyEvents().catch(() => [] as EnrichedMatch[]),
    ]);

    if (gen !== fetchGenRef.current) return;

    // Deduplicate DaddyLive against streamed by title (both lowercased)
    const streamedTitles = new Set(streamed.map(m => m.title.toLowerCase()));
    const uniqueDaddy = daddy.filter(d => !streamedTitles.has(d.title.toLowerCase()));
    const merged = [...streamed, ...uniqueDaddy];

    setAllMatches(merged);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadAllMatches();
    setRefreshing(false);
  }

  function handleMatchClick(match: EnrichedMatch) {
    const key = `match_${match.id}`;
    const value = JSON.stringify(match);
    sessionStorage.setItem(key, value);
    try { localStorage.setItem(key, value); } catch { /* storage full */ }
    navigate(`/watch/${encodeURIComponent(match.id)}`);
  }

  function handleSportSelect(sportId: string) {
    setSelectedSport(sportId);  // sportId already comes from our own derived list, so it's already a clean category string
    setStatusFilter('all');
    setSearchQuery('');
  }

  // ─── Derive sports list from actual match categories ─────────────
  // This guarantees the sport IDs in the sidebar EXACTLY match m.category values.
  // We do NOT use the sports API for IDs — only for display names if available.
  const sportsFromMatches = useMemo<Sport[]>(() => {
    // Build a map from category string → count
    const countMap: Record<string, number> = {};
    for (const m of allMatches) {
      const cat = m.category; // already lowercased by normaliseMatch
      if (cat) countMap[cat] = (countMap[cat] || 0) + 1;
    }

    // Build Sport[] using the category string as id
    // Try to find a display name from the API sports list (match by id or loose substring)
    const apiNameMap: Record<string, string> = {};
    for (const s of apiSports) {
      apiNameMap[s.id.toLowerCase()] = s.name;
    }

    return Object.keys(countMap)
      .sort((a, b) => countMap[b] - countMap[a]) // sort by count desc
      .map(cat => ({
        id: cat,  // this IS the category string — no mismatch possible
        name: apiNameMap[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1)),
      }));
  }, [allMatches, apiSports]);

  // ─── All filtering is purely client-side ─────────────────────────
  const filteredMatches = useMemo(() => {
    let result = allMatches;

    if (selectedSport !== 'all') {
      result = result.filter(m => m.category === selectedSport);
    }

    if (statusFilter !== 'all') {
      result = result.filter(m => m.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.teams?.home?.name.toLowerCase().includes(q) ||
        m.teams?.away?.name.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allMatches, selectedSport, statusFilter, searchQuery]);

  // Status counts reflect only the currently selected sport
  const statusCounts = useMemo(() => {
    const base = selectedSport === 'all'
      ? allMatches
      : allMatches.filter(m => m.category === selectedSport);
    return {
      live:     base.filter(m => m.status === 'live').length,
      upcoming: base.filter(m => m.status === 'upcoming').length,
      finished: base.filter(m => m.status === 'finished').length,
    };
  }, [allMatches, selectedSport]);

  // Sidebar counts: how many matches per category
  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allMatches.length };
    for (const m of allMatches) {
      if (m.category) counts[m.category] = (counts[m.category] || 0) + 1;
    }
    return counts;
  }, [allMatches]);

  const currentSportName = selectedSport === 'all'
    ? 'All Sports'
    : sportsFromMatches.find(s => s.id === selectedSport)?.name ?? selectedSport;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AdPopup />
      <Header
        liveCount={statusCounts.live}
        sports={sportsFromMatches}
        selectedSport={selectedSport}
        onSportSelect={handleSportSelect}
        sportCounts={sportCounts}
      />

      <div style={{ padding: '10px 16px 0', display: 'flex', justifyContent: 'center' }}>
        <AdBanner size="leaderboard" />
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        <SportsSidebar
          sports={sportsFromMatches}
          selected={selectedSport}
          onSelect={handleSportSelect}
          counts={sportCounts}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="sports-home-mainbar" style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', letterSpacing: '0.06em', lineHeight: 1 }}>
                {currentSportName}
              </h1>
              <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>
                {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search teams..."
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px 7px 28px', color: 'var(--text)', fontSize: '0.8rem', outline: 'none', width: 150 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              </div>
              <button
                onClick={handleRefresh}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}
              >
                <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.6s linear infinite' : 'none' }} />
                <span className="desktop-only">Refresh</span>
              </button>
            </div>
          </div>

          <StatusTabs active={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
          <MatchGrid matches={filteredMatches} onMatchClick={handleMatchClick} loading={loading} />

          {!loading && filteredMatches.length > 4 && (
            <div style={{ padding: '0 16px 20px', display: 'flex', justifyContent: 'center' }}>
              <AdBanner size="rectangle" />
            </div>
          )}
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .sports-home-mainbar { align-items: stretch !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
