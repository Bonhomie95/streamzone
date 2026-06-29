import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, X, Zap, Film, Trophy, Heart } from "lucide-react";
import type { Sport } from "../types";

const TELEGRAM_URL = "https://t.me/+_ARxFsS80QAwMDc0";

const SPORT_EMOJIS: Record<string, string> = {
  football: "⚽", basketball: "🏀", tennis: "🎾", hockey: "🏒",
  baseball: "⚾", mma: "🥊", boxing: "🥊", cricket: "🏏",
  rugby: "🏉", volleyball: "🏐", golf: "⛳", motorsport: "🏎",
  all: "🌐", default: "🏆",
};

interface HeaderProps {
  liveCount?: number;
  sports?: Sport[];
  selectedSport?: string;
  onSportSelect?: (id: string) => void;
  sportCounts?: Record<string, number>;
  favouriteCount?: number;
}

export default function Header({
  liveCount = 0,
  sports = [],
  selectedSport = "all",
  onSportSelect,
  sportCounts = {},
  favouriteCount = 0,
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isMovies = location.pathname.startsWith("/movies");

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  return (
    <>
      {/* Combined social + branding slim strip */}
      <div style={{
        width: "100%",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "4px 16px",
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "0.68rem", color: "var(--text3)" }}>
          Follow us for updates:
        </span>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(38,168,221,0.1)", border: "1px solid rgba(38,168,221,0.25)",
            borderRadius: 20, padding: "2px 10px",
            color: "#26a8dd", fontSize: "0.68rem", fontWeight: 600,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          Telegram
        </a>
      </div>

      <header
        className="app-header"
        style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(8,10,15,0.96)", backdropFilter: "blur(24px)",
          borderBottom: "1px solid var(--border)",
          height: "var(--header-h)",
          display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
        }}
      >
        {/* Logo */}
        <button
          onClick={() => go("/")}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, flexShrink: 0 }}
        >
          <img src="/logo.png" alt="StreamZone" style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 8 }} />
          <span style={{ fontFamily: "Bebas Neue", fontSize: "1.45rem", letterSpacing: "0.08em", color: "var(--text)" }}>
            STREAM<span style={{ color: "var(--accent)" }}>ZONE</span>
          </span>
        </button>

        {/* Mode tabs */}
        <div className="mode-tabs" style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, marginLeft: 8 }}>
          {[
            { path: "/", label: "Sports", icon: <Trophy size={13} /> },
            { path: "/movies", label: "Movies", icon: <Film size={13} /> },
          ].map((tab) => {
            const active = tab.path === "/" ? !isMovies : isMovies;
            return (
              <button
                key={tab.path}
                onClick={() => go(tab.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
                  borderRadius: 7, border: "none",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--text2)",
                  fontSize: "0.8rem", fontWeight: active ? 700 : 400, transition: "all 0.15s",
                }}
              >
                {tab.icon}{tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Live badge */}
        {liveCount > 0 && !isMovies && (
          <div className="live-badge" style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(230,57,70,0.1)", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 20, padding: "3px 10px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse 1.4s infinite" }} />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)" }}>{liveCount} LIVE</span>
          </div>
        )}

        <div className="desktop-only" style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text3)", fontSize: "0.74rem" }}>
          <Zap size={11} color="var(--gold)" />
          Free · No Login
        </div>

        {/* Hamburger — mobile, sports only */}
        {!isMovies && sports.length > 0 && (
          <button
            className="mobile-only nav-menu-button"
            onClick={() => setMenuOpen((v) => !v)}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 7, color: "var(--text2)", display: "flex" }}
          >
            {menuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        )}
      </header>

      {/* Mobile sport menu — mirrors sidebar including My Favourites */}
      {menuOpen && (
        <div
          className="mobile-sport-menu"
          style={{
            position: "fixed", top: "var(--header-h)", left: 0, right: 0, bottom: 0,
            background: "var(--bg2)", zIndex: 99, overflowY: "auto",
            borderTop: "1px solid var(--border)", animation: "fadeIn .15s ease",
          }}
        >
          {/* My Favourites entry */}
          {(() => {
            const isActive = selectedSport === "__favourites__";
            return (
              <button
                onClick={() => { onSportSelect?.("__favourites__"); setMenuOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "13px 20px", border: "none", textAlign: "left",
                  background: isActive ? "rgba(230,57,70,0.07)" : "transparent",
                  borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`,
                  color: isActive ? "var(--text)" : "var(--text2)",
                  fontSize: "0.94rem", fontWeight: isActive ? 600 : 400,
                }}
              >
                <Heart size={16} fill={isActive ? "var(--accent)" : "none"} color={isActive ? "var(--accent)" : "var(--text3)"} />
                <span style={{ flex: 1 }}>My Favourites</span>
                {favouriteCount > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, borderRadius: 10, padding: "1px 8px", background: isActive ? "var(--accent)" : "var(--border2)", color: isActive ? "#fff" : "var(--text3)" }}>
                    {favouriteCount}
                  </span>
                )}
              </button>
            );
          })()}

          <div style={{ height: "0.5px", background: "var(--border)", margin: "2px 20px" }} />

          {[{ id: "all", name: "All Sports" }, ...sports].map((sport) => {
            const isActive = selectedSport === sport.id;
            const emoji = SPORT_EMOJIS[sport.id] || SPORT_EMOJIS.default;
            return (
              <button
                key={sport.id}
                onClick={() => { onSportSelect?.(sport.id); setMenuOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "13px 20px", border: "none", textAlign: "left",
                  background: isActive ? "rgba(230,57,70,0.07)" : "transparent",
                  borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`,
                  color: isActive ? "var(--text)" : "var(--text2)",
                  fontSize: "0.94rem", fontWeight: isActive ? 600 : 400,
                }}
              >
                <span style={{ fontSize: "1.05rem", width: 20, textAlign: "center" }}>{emoji}</span>
                <span style={{ flex: 1 }}>{sport.name}</span>
                {(sportCounts[sport.id] ?? 0) > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, borderRadius: 10, padding: "1px 8px", background: isActive ? "var(--accent)" : "var(--border2)", color: isActive ? "#fff" : "var(--text3)" }}>
                    {sportCounts[sport.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
