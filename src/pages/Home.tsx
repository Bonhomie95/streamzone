import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Heart } from 'lucide-react';
import Header from '../components/Header';
import SportsSidebar from '../components/SportsSidebar';
import StatusTabs from '../components/StatusTabs';
import MatchGrid from '../components/MatchGrid';
import AdBanner from '../components/AdBanner';
import AdPopup from '../components/AdPopup';
import AddToHomeScreen from '../components/AddToHomeScreen';
import { fetchSports, fetchAllMatches } from '../api';
import { useFavouriteTeams, getPreferredSport, recordSportClick } from '../hooks/useFavourites';
import type { Sport, EnrichedMatch } from '../types';
import type { StatusFilter } from '../components/StatusTabs';

type SidebarFilter = string | '__favourites__';

export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [apiSports, setApiSports] = useState<Sport[]>([]);
  const [allMatches, setAllMatches] = useState<EnrichedMatch[]>([]);

  // Sport filter lives in ?sport= URL param so Back navigation restores it
  const [selectedSport, setSelectedSport] = useState<SidebarFilter>(() => {
    return searchParams.get('sport') ?? getPreferredSport() ?? 'all';
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchGenRef = useRef(0);
  const { isFav: isTeamFav } = useFavouriteTeams();

  useEffect(() => {
    fetchSports().then(setApiSports).catch(() => {});
    loadAllMatches();
  }, []);

  async function loadAllMatches() {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    const merged = await fetchAllMatches((firstMatches) => {
      if (gen !== fetchGenRef.current) return;
      setAllMatches(firstMatches);
      setLoading(false);
      cacheMatchesForLater(firstMatches);
    });
    if (gen !== fetchGenRef.current) return;
    setAllMatches(merged);
    setLoading(false);
    cacheMatchesForLater(merged);
  }

  // The sports APIs only return currently live/upcoming matches — finished
  // ones drop off the list within a short window and can never be looked up
  // by id again upstream. To honour deep links to matches that have since
  // ended, we snapshot every match this browser has ever seen listed here
  // into localStorage, so Watch.tsx can still resolve it later. Only works
  // for matches this browser previously loaded on this page — a completely
  // fresh device/browser with no prior visit still can't recover a match
  // the upstream API has already dropped, since neither API exposes a
  // lookup-by-id endpoint for historical matches.
  function cacheMatchesForLater(matches: EnrichedMatch[]) {
    try {
      for (const m of matches) {
        localStorage.setItem(`match_${m.id}`, JSON.stringify(m));
      }
    } catch { /* storage full/unavailable, non-fatal */ }
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
    try { localStorage.setItem(key, value); } catch {}
    navigate(`/watch/${encodeURIComponent(match.id)}`);
  }

  function handleSportSelect(sportId: SidebarFilter) {
    setSelectedSport(sportId);
    setStatusFilter('all');
    setSearchQuery('');
    // Persist in URL so Back from Watch restores the filter
    if (sportId === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ sport: sportId });
    }
    if (sportId !== 'all' && sportId !== '__favourites__') {
      recordSportClick(sportId);
    }
  }

  function clearFilter() {
    handleSportSelect('all');
  }

  const sportsFromMatches = useMemo<Sport[]>(() => {
    const countMap: Record<string, number> = {};
    for (const m of allMatches) {
      const cat = m.category;
      if (cat) countMap[cat] = (countMap[cat] || 0) + 1;
    }
    const apiNameMap: Record<string, string> = {};
    for (const s of apiSports) apiNameMap[s.id.toLowerCase()] = s.name;
    return Object.keys(countMap)
      .sort((a, b) => countMap[b] - countMap[a])
      .map(cat => ({ id: cat, name: apiNameMap[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1)) }));
  }, [allMatches, apiSports]);

  const favouriteMatches = useMemo(() =>
    allMatches.filter(m =>
      (m.teams?.home?.name && isTeamFav(m.teams.home.name, m.category)) ||
      (m.teams?.away?.name && isTeamFav(m.teams.away.name, m.category))
    ),
    [allMatches, isTeamFav]
  );

  const filteredMatches = useMemo(() => {
    let result = allMatches;
    if (selectedSport === '__favourites__') result = favouriteMatches;
    else if (selectedSport !== 'all') result = result.filter(m => m.category === selectedSport);
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
  }, [allMatches, selectedSport, statusFilter, searchQuery, favouriteMatches]);

  const statusCounts = useMemo(() => {
    const base = selectedSport === '__favourites__' ? favouriteMatches
      : selectedSport === 'all' ? allMatches
      : allMatches.filter(m => m.category === selectedSport);
    return {
      live:     base.filter(m => m.status === 'live').length,
      upcoming: base.filter(m => m.status === 'upcoming').length,
      finished: base.filter(m => m.status === 'finished').length,
    };
  }, [allMatches, selectedSport, favouriteMatches]);

  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allMatches.length };
    for (const m of allMatches) {
      if (m.category) counts[m.category] = (counts[m.category] || 0) + 1;
    }
    return counts;
  }, [allMatches]);

  const currentSportName =
    selectedSport === '__favourites__' ? 'My Favourites'
    : selectedSport === 'all' ? 'All Sports'
    : sportsFromMatches.find(s => s.id === selectedSport)?.name ?? selectedSport;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AdPopup />
      <AddToHomeScreen />
      <Header
        liveCount={statusCounts.live}
        sports={sportsFromMatches}
        selectedSport={selectedSport}
        onSportSelect={handleSportSelect}
        sportCounts={sportCounts}
        favouriteCount={favouriteMatches.length}
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
          favouriteCount={favouriteMatches.length}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="sports-home-mainbar" style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', letterSpacing: '0.06em', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedSport === '__favourites__' && <Heart size={16} fill="var(--accent)" color="var(--accent)" />}
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
          <MatchGrid
            matches={filteredMatches}
            onMatchClick={handleMatchClick}
            loading={loading}
            activeSport={selectedSport}
            onClearFilter={clearFilter}
          />

          {!loading && filteredMatches.length > 4 && (
            <div style={{ padding: '0 16px 20px', display: 'flex', justifyContent: 'center' }}>
              <AdBanner size="rectangle" />
            </div>
          )}
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) { .sports-home-mainbar { align-items: stretch !important; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
