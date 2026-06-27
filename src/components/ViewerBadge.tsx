/**
 * ViewerBadge — prominent "X,XXX watching now" badge shown above the player.
 * Initial count is randomised between 6K–50K per session, then drifts ±2–8%
 * every 8 seconds so it feels live even without a real backend count.
 * When a real API count is returned it takes over seamlessly.
 */

import { useEffect, useRef, useState } from "react";
import { useViewCount, formatViewCount } from "../hooks/useViewCount";

interface ViewerBadgeProps {
  id: string | number;
  active?: boolean;
  large?: boolean;
}

/** Random int in [min, max] */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Drift the count by ±2–8%, clamped to [6000, 50000] */
function drift(current: number): number {
  const pct = (Math.random() * 0.06 + 0.02) * (Math.random() < 0.5 ? 1 : -1);
  return Math.min(50_000, Math.max(6_000, Math.round(current + current * pct)));
}

export default function ViewerBadge({
  id,
  active = true,
  large = false,
}: ViewerBadgeProps) {
  const count = useViewCount(id, active);

  // Seed once per mount — stays stable across re-renders until unmount
  const seed = useRef(randInt(6_000, 50_000));
  const [displayed, setDisplayed] = useState<number>(seed.current);
  const usingReal = useRef(false);

  // If real server count arrives, switch to it and stop drifting
  useEffect(() => {
    if (count !== null) {
      usingReal.current = true;
      setDisplayed(count);
    }
  }, [count]);

  // Drift every 8 seconds while no real count is available
  useEffect(() => {
    const t = setInterval(() => {
      if (!usingReal.current) {
        setDisplayed((prev) => drift(prev));
      }
    }, 8_000);
    return () => clearInterval(t);
  }, []);

  if (large) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(230,57,70,0.1)",
          border: "1px solid rgba(230,57,70,0.3)",
          borderRadius: 24,
          padding: "6px 14px",
        }}
      >
        {/* Pulsing live dot */}
        <span
          style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "pulse 1.4s infinite",
            }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
        </span>
        <span
          style={{
            fontFamily: "Bebas Neue",
            fontSize: "1rem",
            letterSpacing: "0.06em",
            color: "var(--text)",
          }}
        >
          {formatViewCount(displayed)}
        </span>
        <span
          style={{
            fontSize: "0.78rem",
            color: "var(--text2)",
            fontWeight: 500,
          }}
        >
          watching now
        </span>
      </div>
    );
  }

  // Small version for cards
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: "0.67rem",
        color: "var(--text3)",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: active ? "var(--accent)" : "var(--text3)",
          display: "inline-block",
          animation: active ? "pulse 1.4s infinite" : "none",
        }}
      />
      {formatViewCount(displayed)}
    </span>
  );
}
