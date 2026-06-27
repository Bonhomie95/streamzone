import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Star, Play, TrendingUp, Flame, Award, Clock, Tv, SlidersHorizontal, ChevronDown } from 'lucide-react';
import Header from '../components/Header';
import AdBanner from '../components/AdBanner';
import AdPopup from '../components/AdPopup';
import {
  fetchTrending, fetchPopular, fetchTopRated, fetchNowPlaying,
  fetchUpcomingMovies, fetchByGenre, searchMovies, fetchGenres
} from '../api';
import type { Movie, Genre, MediaType } from '../types';

const CATEGORIES = [
  { id: 'trending',        label: 'Trending',      icon: <TrendingUp size={14}/>, fetch: () => fetchTrending('movie') },
  { id: 'popular',         label: 'Popular',       icon: <Flame size={14}/>,      fetch: () => fetchPopular('movie') },
  { id: 'top_rated',       label: 'Top Rated',     icon: <Award size={14}/>,      fetch: () => fetchTopRated('movie') },
  { id: 'now_playing',     label: 'In Cinemas',    icon: <Play size={14}/>,       fetch: fetchNowPlaying },
  { id: 'upcoming',        label: 'Upcoming',      icon: <Clock size={14}/>,      fetch: () => fetchUpcomingMovies() },
  { id: 'trending_tv',     label: 'Trending TV',   icon: <Tv size={14}/>,         fetch: () => fetchTrending('tv') },
  { id: 'popular_tv',      label: 'Popular TV',    icon: <Tv size={14}/>,         fetch: () => fetchPopular('tv') },
  { id: 'top_rated_tv',    label: 'Top Rated TV',  icon: <Award size={14}/>,      fetch: () => fetchTopRated('tv') },
];

export default function MovieHome() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('trending');
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [featured, setFeatured] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterRating, setFilterRating] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popularity');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heroIdx, setHeroIdx] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { loadCategory('trending'); loadFeatured(); loadGenres(); }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroIdx(i => (i + 1) % Math.min(featured.length || 1, 5)), 6000);
    return () => clearInterval(t);
  }, [featured.length]);

  async function loadFeatured() {
    const data = await fetchTrending('movie');
    setFeatured(data.slice(0, 5));
  }

  async function loadGenres() {
    const [mg, tg] = await Promise.all([fetchGenres('movie'), fetchGenres('tv')]);
    const merged = [...mg, ...tg.filter(g => !mg.find(m => m.id === g.id))];
    setGenres(merged);
  }

  async function loadCategory(catId: string) {
    setLoading(true);
    setSelectedGenre(null);
    setSearchQuery('');
    setSearchResults([]);
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat) {
      const data = await cat.fetch();
      setMovies(data);
      setMediaType(catId.endsWith('_tv') ? 'tv' : 'movie');
    }
    setLoading(false);
  }

  async function loadGenreMovies(genreId: number) {
    setLoading(true);
    setSelectedGenre(genreId);
    setActiveCategory('');
    const data = await fetchByGenre(mediaType, genreId);
    setMovies(data);
    setLoading(false);
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const results = await searchMovies(q);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  }

  const hero = featured[heroIdx];
  const displayMovies = (() => {
    let list = searchQuery ? searchResults : movies;
    if (filterType !== 'all') list = list.filter(m => m.mediaType === filterType);
    if (filterYear) list = list.filter(m => m.year === filterYear);
    if (filterRating) list = list.filter(m => m.rating >= parseFloat(filterRating));
    if (sortBy === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'year_desc') list = [...list].sort((a, b) => (b.year || '').localeCompare(a.year || ''));
    else if (sortBy === 'year_asc') list = [...list].sort((a, b) => (a.year || '').localeCompare(b.year || ''));
    else list = [...list].sort((a, b) => b.popularity - a.popularity);
    return list;
  })();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AdPopup />
      <Header />

      {/* Hero */}
      {hero && !searchQuery && (
        <div style={{ position: 'relative', height: 'clamp(280px, 45vw, 500px)', overflow: 'hidden', flexShrink: 0 }}>
          {featured.map((m, i) => (
            <div key={m.id} style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${m.backdrop})`,
              backgroundSize: 'cover', backgroundPosition: 'center top',
              opacity: i === heroIdx ? 1 : 0,
              transition: 'opacity 1s ease',
            }} />
          ))}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, rgba(8,10,15,0.92) 35%, rgba(8,10,15,0.3) 70%, transparent), linear-gradient(to top, var(--bg) 0%, transparent 40%)',
          }} />
          <div style={{ position: 'relative', zIndex: 2, padding: 'clamp(20px,4vw,48px)', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700 }}>TRENDING</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--gold)', fontSize: '0.78rem', fontWeight: 600 }}>
                <Star size={11} fill="var(--gold)" />{hero.rating}
              </span>
              {hero.year && <span style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>{hero.year}</span>}
            </div>
            <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 'clamp(1.6rem,5vw,3rem)', letterSpacing: '0.04em', lineHeight: 1, color: 'var(--text)' }}>{hero.title}</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{hero.overview}</p>
            <button onClick={() => navigate(`/movies/watch/${hero.mediaType}/${hero.tmdbId}`)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 9, padding: '10px 22px', fontSize: '0.88rem', fontWeight: 700,
              width: 'fit-content', marginTop: 4,
            }}>
              <Play size={15} fill="#fff" /> Watch Now
            </button>
          </div>
          {/* Hero dots */}
          <div style={{ position: 'absolute', bottom: 16, right: 20, display: 'flex', gap: 6, zIndex: 2 }}>
            {featured.map((_, i) => (
              <button key={i} onClick={() => setHeroIdx(i)} style={{
                width: i === heroIdx ? 20 : 6, height: 6, borderRadius: 3, border: 'none',
                background: i === heroIdx ? 'var(--accent)' : 'rgba(255,255,255,0.25)',
                transition: 'all 0.3s', padding: 0,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <AdBanner size="leaderboard" />
        <div style={{ position: 'relative', width: '100%', maxWidth: 520, marginTop: 14 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search movies & TV shows..."
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 36px 10px 36px', color: 'var(--text)',
              fontSize: '0.88rem', outline: 'none',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text3)', display: 'flex', padding: 2,
            }}><X size={14} /></button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ display: 'flex', flex: 1, gap: 0 }}>
        {/* Sidebar */}
        <aside className="desktop-only" style={{
          width: 'var(--sidebar-w)', flexShrink: 0,
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          overflowY: 'auto', height: `calc(100vh - var(--header-h))`,
          position: 'sticky', top: 'var(--header-h)', paddingBottom: 24,
        }}>
          <div style={{ padding: '14px 14px 6px', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Browse</div>
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id && !selectedGenre;
            return (
              <SidebarBtn key={cat.id} active={isActive} onClick={() => { setActiveCategory(cat.id); loadCategory(cat.id); }}>
                {cat.icon}{cat.label}
              </SidebarBtn>
            );
          })}
          <div style={{ padding: '14px 14px 6px', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 8 }}>Genres</div>
          {genres.map(g => (
            <SidebarBtn key={g.id} active={selectedGenre === g.id} onClick={() => loadGenreMovies(g.id)}>
              🎬 {g.name}
            </SidebarBtn>
          ))}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, minWidth: 0, padding: '16px 20px 24px' }}>
          {/* Mobile category scroll */}
          <div className="mobile-only" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => { setActiveCategory(cat.id); loadCategory(cat.id); }} style={{
                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                padding: '6px 12px', borderRadius: 20, border: '1px solid',
                borderColor: activeCategory === cat.id ? 'var(--accent)' : 'var(--border)',
                background: activeCategory === cat.id ? 'var(--accent-dim)' : 'transparent',
                color: activeCategory === cat.id ? 'var(--accent)' : 'var(--text2)',
                fontSize: '0.78rem', fontWeight: activeCategory === cat.id ? 600 : 400,
              }}>{cat.icon}{cat.label}</button>
            ))}
          </div>

          {/* Section title + filter toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: '1.25rem', letterSpacing: '0.06em' }}>
              {searchQuery ? `Results for "${searchQuery}"` : selectedGenre ? genres.find(g => g.id === selectedGenre)?.name : CATEGORIES.find(c => c.id === activeCategory)?.label ?? 'Browse'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{displayMovies.length} titles</span>
              <button onClick={() => setShowFilters(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: showFilters ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${showFilters ? 'rgba(230,57,70,0.4)' : 'var(--border)'}`,
                borderRadius: 8, padding: '5px 10px',
                color: showFilters ? 'var(--accent)' : 'var(--text2)', fontSize: '0.78rem', fontWeight: 500,
              }}>
                <SlidersHorizontal size={12} />
                Filters
                {(filterYear || filterRating || filterType !== 'all' || sortBy !== 'popularity') && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                )}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', animation: 'fadeIn .15s ease',
            }}>
              {/* Type */}
              <FilterSelect label="Type" value={filterType} onChange={setFilterType} options={[
                { value: 'all', label: 'All' },
                { value: 'movie', label: 'Movies' },
                { value: 'tv', label: 'TV Shows' },
              ]} />

              {/* Min Rating */}
              <FilterSelect label="Min Rating" value={filterRating} onChange={setFilterRating} options={[
                { value: '', label: 'Any' },
                { value: '9', label: '9+' },
                { value: '8', label: '8+' },
                { value: '7', label: '7+' },
                { value: '6', label: '6+' },
                { value: '5', label: '5+' },
              ]} />

              {/* Year */}
              <FilterSelect label="Year" value={filterYear} onChange={setFilterYear} options={[
                { value: '', label: 'Any' },
                ...Array.from({ length: 30 }, (_, i) => {
                  const y = String(new Date().getFullYear() - i);
                  return { value: y, label: y };
                }),
              ]} />

              {/* Sort */}
              <FilterSelect label="Sort by" value={sortBy} onChange={setSortBy} options={[
                { value: 'popularity', label: 'Popularity' },
                { value: 'rating', label: 'Rating' },
                { value: 'year_desc', label: 'Newest first' },
                { value: 'year_asc', label: 'Oldest first' },
              ]} />

              {/* Clear */}
              {(filterYear || filterRating || filterType !== 'all' || sortBy !== 'popularity') && (
                <button onClick={() => { setFilterYear(''); setFilterRating(''); setFilterType('all'); setSortBy('popularity'); }} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                  background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                  color: 'var(--text3)', fontSize: '0.75rem', alignSelf: 'flex-end', marginBottom: 2,
                }}>
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          {(loading || searching) ? (
            <MovieSkeleton />
          ) : displayMovies.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 0', fontSize: '0.9rem' }}>
              {searchQuery ? 'No results found' : 'Nothing here yet'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
              {displayMovies.map(m => (
                <MovieCard key={`${m.mediaType}-${m.id}`} movie={m} onClick={() => navigate(`/movies/watch/${m.mediaType}/${m.tmdbId}`)} />
              ))}
            </div>
          )}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
          <AdBanner size="rectangle" />
        </div>
        </main>
      </div>
    </div>
  );
}

function SidebarBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 14px', border: 'none', textAlign: 'left',
      background: active ? 'rgba(230,57,70,0.08)' : 'transparent',
      borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
      color: active ? 'var(--text)' : 'var(--text2)',
      fontSize: '0.84rem', fontWeight: active ? 600 : 400, cursor: 'pointer',
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >{children}</button>
  );
}

function MovieCard({ movie, onClick }: { movie: Movie; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      cursor: 'pointer', borderRadius: 'var(--radius)', overflow: 'hidden',
      background: 'var(--surface)', border: '1px solid var(--border)',
      transform: hovered ? 'translateY(-4px) scale(1.02)' : 'none',
      boxShadow: hovered ? '0 16px 40px rgba(0,0,0,0.5)' : 'none',
      transition: 'all 0.2s', position: 'relative',
    }}>
      <div style={{ aspectRatio: '2/3', position: 'relative', background: 'var(--surface2)' }}>
        {movie.poster ? (
          <img src={movie.poster} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '2rem' }}>🎬</div>
        )}
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={18} fill="#fff" color="#fff" />
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.75)', borderRadius: 6, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Star size={9} fill="var(--gold)" color="var(--gold)" />
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--gold)' }}>{movie.rating}</span>
        </div>
        {movie.mediaType === 'tv' && (
          <div style={{ position: 'absolute', top: 6, left: 6, background: 'var(--blue)', borderRadius: 5, padding: '2px 6px', fontSize: '0.58rem', fontWeight: 700, color: '#fff' }}>TV</div>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{movie.title}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text3)', marginTop: 3 }}>{movie.year}</div>
      </div>
    </div>
  );
}

function MovieSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', animationDelay: `${i * 0.05}s` }}>
          <div style={{ aspectRatio: '2/3', background: 'var(--surface2)', animation: 'shimmer 1.5s infinite', animationDelay: `${i * 0.07}s` }} />
          <div style={{ padding: '8px 10px' }}>
            <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 4, animation: 'shimmer 1.5s infinite', marginBottom: 6 }} />
            <div style={{ height: 8, width: '50%', background: 'var(--surface2)', borderRadius: 4, animation: 'shimmer 1.5s infinite' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '5px 24px 5px 10px',
            color: value ? 'var(--text)' : 'var(--text3)',
            fontSize: '0.78rem', outline: 'none', appearance: 'none',
            cursor: 'pointer', minWidth: 100,
          }}
        >
          {options.map(o => <option key={o.value} value={o.value} style={{ background: 'var(--bg2)' }}>{o.label}</option>)}
        </select>
        <ChevronDown size={11} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
