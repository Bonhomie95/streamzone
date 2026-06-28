import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tv2, Menu, X, Zap, Film, Trophy } from 'lucide-react';
import type { Sport } from '../types';
import SocialBar from './SocialBar';

const SPORT_EMOJIS: Record<string, string> = {
  football: '⚽', basketball: '🏀', tennis: '🎾', hockey: '🏒',
  baseball: '⚾', mma: '🥊', boxing: '🥊', cricket: '🏏',
  rugby: '🏉', volleyball: '🏐', golf: '⛳', motorsport: '🏎',
  all: '🌐', default: '🏆',
};

interface HeaderProps {
  liveCount?: number;
  sports?: Sport[];
  selectedSport?: string;
  onSportSelect?: (id: string) => void;
  sportCounts?: Record<string, number>;
}

export default function Header({ liveCount = 0, sports = [], selectedSport = 'all', onSportSelect, sportCounts = {} }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isMovies = location.pathname.startsWith('/movies');

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  return (
    <>
      <SocialBar />
      <header className="app-header" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(8,10,15,0.96)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border)',
        height: 'var(--header-h)', display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12,
      }}>
        {/* Logo */}
        <button onClick={() => go('/')} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', padding: 0, flexShrink: 0,
        }}>
          <div style={{ background: 'var(--accent)', borderRadius: 7, padding: 5, display: 'flex' }}>
            <Tv2 size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.45rem', letterSpacing: '0.08em', color: 'var(--text)' }}>
            STREAM<span style={{ color: 'var(--accent)' }}>ZONE</span>
          </span>
        </button>

        {/* Mode tabs */}
        <div className="mode-tabs" style={{
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 3, marginLeft: 8,
        }}>
          {[
            { path: '/', label: 'Sports', icon: <Trophy size={13} /> },
            { path: '/movies', label: 'Movies', icon: <Film size={13} /> },
          ].map(tab => {
            const active = tab.path === '/' ? !isMovies : isMovies;
            return (
              <button key={tab.path} onClick={() => go(tab.path)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 7, border: 'none',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text2)',
                fontSize: '0.8rem', fontWeight: active ? 700 : 400,
                transition: 'all 0.15s',
              }}>
                {tab.icon}{tab.label}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Live badge */}
        {liveCount > 0 && !isMovies && (
          <div className="live-badge" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)',
            borderRadius: 20, padding: '3px 10px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.4s infinite' }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)' }}>{liveCount} LIVE</span>
          </div>
        )}

        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text3)', fontSize: '0.74rem' }}>
          <Zap size={11} color="var(--gold)" />
          Free · No Login
        </div>

        {/* Hamburger — mobile, sports only */}
        {!isMovies && sports.length > 0 && (
          <button className="mobile-only nav-menu-button" onClick={() => setMenuOpen(v => !v)} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 7, color: 'var(--text2)', display: 'flex',
          }}>
            {menuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        )}
      </header>

      {/* Mobile sport menu */}
      {menuOpen && (
        <div className="mobile-sport-menu" style={{
          position: 'fixed', top: 'var(--header-h)', left: 0, right: 0, bottom: 0,
          background: 'var(--bg2)', zIndex: 99, overflowY: 'auto',
          borderTop: '1px solid var(--border)', animation: 'fadeIn .15s ease',
        }}>
          {[{ id: 'all', name: 'All Sports' }, ...sports].map(sport => {
            const isActive = selectedSport === sport.id;
            const emoji = SPORT_EMOJIS[sport.id] || SPORT_EMOJIS.default;
            return (
              <button key={sport.id} onClick={() => { onSportSelect?.(sport.id); setMenuOpen(false); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 20px', border: 'none', textAlign: 'left',
                background: isActive ? 'rgba(230,57,70,0.07)' : 'transparent',
                borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                color: isActive ? 'var(--text)' : 'var(--text2)',
                fontSize: '0.94rem', fontWeight: isActive ? 600 : 400,
              }}>
                <span style={{ fontSize: '1.05rem' }}>{emoji}</span>
                <span style={{ flex: 1 }}>{sport.name}</span>
                {(sportCounts[sport.id] ?? 0) > 0 && (
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, borderRadius: 10, padding: '1px 8px',
                    background: isActive ? 'var(--accent)' : 'var(--border2)',
                    color: isActive ? '#fff' : 'var(--text3)',
                  }}>{sportCounts[sport.id]}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
