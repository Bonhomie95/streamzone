import { useState, useEffect, useMemo, useCallback } from "react";
import type { EnrichedMatch } from "../types";
import { fetchBulkViewCounts } from "../hooks/useViewCount";
import MatchCard from "./MatchCard";

interface MatchGridProps {
  matches: EnrichedMatch[];
  onMatchClick: (m: EnrichedMatch) => void;
  loading: boolean;
  activeSport?: string;
  onClearFilter?: () => void;
}

function calcMinWidth(w: number): string {
  if (w >= 3840) return "420px";
  if (w >= 2560) return "340px";
  if (w >= 1600) return "280px";
  return "240px";
}

export default function MatchGrid({ matches, onMatchClick, loading, activeSport, onClearFilter }: MatchGridProps) {
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [minWidth, setMinWidth] = useState(() => calcMinWidth(window.innerWidth));

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? window.innerWidth;
      setMinWidth(calcMinWidth(w));
    });
    obs.observe(document.body);
    return () => obs.disconnect();
  }, []);

  const liveIdString = useMemo(
    () => matches.filter((m) => m.status === "live").map((m) => m.id).join(","),
    [matches]
  );

  useEffect(() => {
    if (!liveIdString) { setViewCounts({}); return; }
    fetchBulkViewCounts(liveIdString.split(",")).then(setViewCounts);
  }, [liveIdString]);

  const handleClick = useCallback((m: EnrichedMatch) => onMatchClick(m), [onMatchClick]);

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))`,
    gap: "clamp(10px,1.2vw,20px)",
    padding: "clamp(12px,1.5vw,28px) clamp(14px,2vw,36px)",
  };

  if (loading) {
    return (
      <div style={gridStyle}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 155, borderRadius: "var(--radius)", background: "var(--surface)", animation: "shimmer 1.5s infinite", animationDelay: `${i * 0.07}s` }} />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  if (matches.length === 0) {
    const isFavsFilter = activeSport === "__favourites__";
    const isAllFilter = !activeSport || activeSport === "all";
    const sportName = (!isAllFilter && !isFavsFilter) ? (activeSport!.charAt(0).toUpperCase() + activeSport!.slice(1)) : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "64px 20px", color: "var(--text3)", textAlign: "center" }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          {isFavsFilter
            ? <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>
            : <><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></>}
        </svg>
        <div>
          <p style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
            {isFavsFilter
              ? "No favourited teams yet"
              : sportName
                ? `No ${sportName} matches right now`
                : "No matches found"}
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text3)", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>
            {isFavsFilter
              ? "Hover any match card and tap the heart icon to follow teams — their matches will appear here"
              : sportName
                ? `${sportName} streams will appear here when events go live`
                : "Try a different search or filter"}
          </p>
        </div>
        {(sportName || isFavsFilter) && onClearFilter && (
          <button
            onClick={onClearFilter}
            style={{ marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 18px", color: "var(--text2)", fontSize: "0.8rem", cursor: "pointer" }}
          >
            Browse all sports
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={gridStyle}>
      {matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          onClick={() => handleClick(m)}
          viewCount={m.status === "live" ? (viewCounts[m.id] ?? null) : undefined}
        />
      ))}
    </div>
  );
}
