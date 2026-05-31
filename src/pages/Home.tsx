import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import SportsSidebar from '../components/SportsSidebar';
import StatusTabs from '../components/StatusTabs';
import MatchGrid from '../components/MatchGrid';
import AdBanner from '../components/AdBanner';
import { fetchSports, fetchAllMatches, fetchMatchesBySport } from '../api';
import type { Sport, EnrichedMatch } from '../types';
import type { StatusFilter } from '../components/StatusTabs';

export default function Home() {
  const navigate = useNavigate();
  const [sports, setSports] = useState<Sport[]>([]);
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [selectedSport, setSelectedSport] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const [sportsData] = await Promise.all([fetchSports(), loadMatches('all')]);
    setSports(sportsData);
  }

  async function loadMatches(sport: string) {
    setLoading(true);
    try {
      const data = sport === 'all' ? await fetchAllMatches() : await fetchMatchesBySport(sport);
      setMatches(data);
    } catch { /* noop */ }
    setLoading(false);
  }

  async function handleSportSelect(sport: string) {
    setSelectedSport(sport);
    setStatusFilter('all');
    setSearchQuery('');
    await loadMatches(sport);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadMatches(selectedSport);
    setRefreshing(false);
  }

  function handleMatchClick(match: EnrichedMatch) {
    sessionStorage.setItem(`match_${match.id}`, JSON.stringify(match));
    navigate(`/watch/${match.id}`);
  }

  const filteredMatches = useMemo(() => {
    let result = matches;
    if (statusFilter !== 'all') result = result.filter(m => m.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.teams?.home?.name.toLowerCase().includes(q) ||
        m.teams?.away?.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [matches, statusFilter, searchQuery]);

  const statusCounts = useMemo(() => ({
    live: matches.filter(m => m.status === 'live').length,
    upcoming: matches.filter(m => m.status === 'upcoming').length,
    finished: matches.filter(m => m.status === 'finished').length,
  }), [matches]);

  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = { all: matches.length };
    matches.forEach(m => { counts[m.category] = (counts[m.category] || 0) + 1; });
    return counts;
  }, [matches]);

  const currentSportName = selectedSport === 'all'
    ? 'All Sports'
    : sports.find(s => s.id === selectedSport)?.name || selectedSport;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        liveCount={statusCounts.live}
        sports={sports}
        selectedSport={selectedSport}
        onSportSelect={handleSportSelect}
        sportCounts={sportCounts}
      />

      <div style={{ padding: '10px 20px 0', display: 'flex', justifyContent: 'center' }}>
        <AdBanner size="leaderboard" />
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        <SportsSidebar sports={sports} selected={selectedSport} onSelect={handleSportSelect} counts={sportCounts} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', letterSpacing: '0.06em', lineHeight: 1 }}>{currentSportName}</h1>
              <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>{filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search teams..."
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px 7px 28px', color: 'var(--text)', fontSize: '0.8rem', outline: 'none', width: 170 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              </div>
              <button onClick={handleRefresh} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}>
                <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.6s linear infinite' : 'none' }} />
                <span className="desktop-only">Refresh</span>
              </button>
            </div>
          </div>
          <StatusTabs active={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
          <MatchGrid matches={filteredMatches} onMatchClick={handleMatchClick} loading={loading} />
          {!loading && filteredMatches.length > 4 && (
            <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'center' }}>
              <AdBanner size="rectangle" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
