import { useState, useEffect, useMemo, useCallback } from "react";
import type { EnrichedMatch } from "../types";
import { fetchBulkViewCounts } from "../hooks/useViewCount";
import MatchCard from "./MatchCard";

interface MatchGridProps {
  matches: EnrichedMatch[];
  onMatchClick: (m: EnrichedMatch) => void;
  loading: boolean;
}

// Map viewport width to a card min-width string.
// Called once on mount and again on window resize via ResizeObserver —
// not on every render like the old bare function call was.
function calcMinWidth(w: number): string {
  if (w >= 3840) return "420px";
  if (w >= 2560) return "340px";
  if (w >= 1600) return "280px";
  return "240px";
}

export default function MatchGrid({
  matches,
  onMatchClick,
  loading,
}: MatchGridProps) {
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [minWidth, setMinWidth] = useState(() => calcMinWidth(window.innerWidth));

  // Update minWidth on resize using ResizeObserver on document.body
  // so we're not reading window.innerWidth on every render.
  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? window.innerWidth;
      setMinWidth(calcMinWidth(w));
    });
    obs.observe(document.body);
    return () => obs.disconnect();
  }, []);

  // Stable dep: only re-fetch when the set of live match IDs actually changes
  const liveIdString = useMemo(
    () =>
      matches
        .filter((m) => m.status === "live")
        .map((m) => m.id)
        .join(","),
    [matches],
  );

  useEffect(() => {
    if (!liveIdString) {
      setViewCounts({});
      return;
    }
    const ids = liveIdString.split(",");
    fetchBulkViewCounts(ids).then(setViewCounts);
  }, [liveIdString]);

  const handleClick = useCallback(
    (m: EnrichedMatch) => onMatchClick(m),
    [onMatchClick],
  );

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))`,
    gap: "clamp(10px, 1.2vw, 20px)",
    padding: "clamp(12px, 1.5vw, 28px) clamp(14px, 2vw, 36px)",
  };

  if (loading) {
    return (
      <div style={gridStyle}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 155,
              borderRadius: "var(--radius)",
              background: "var(--surface)",
              animation: "shimmer 1.5s infinite",
              animationDelay: `${i * 0.07}s`,
            }}
          />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "64px 20px",
          color: "var(--text3)",
        }}
      >
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8M12 8v8" />
        </svg>
        <span style={{ fontSize: "0.88rem" }}>No matches found</span>
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
          viewCount={
            m.status === "live" ? (viewCounts[m.id] ?? null) : undefined
          }
        />
      ))}
    </div>
  );
}
