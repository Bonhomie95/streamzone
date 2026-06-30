/**
 * TVStreamPanel — opens the stream directly in a new tab on mount.
 *
 * TV browsers sandbox cross-origin iframes, so we skip embedding entirely.
 * The moment streams are ready, the active one opens in a new tab automatically.
 * The panel stays visible so the user can switch to a different stream if needed.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { ExternalLink, Tv2, Check } from "lucide-react";
import type { Stream } from "../types";

interface TVStreamPanelProps {
  stream: Stream | null;
  streams: Stream[];
  onSwitch: (s: Stream) => void;
}

function openInNewTab(url: string) {
  window.open(url, "_blank");
}

export default function TVStreamPanel({
  stream,
  streams,
  onSwitch,
}: TVStreamPanelProps) {
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const autoOpenedRef = useRef<string | null>(null);

  // Auto-open the stream in a new tab as soon as it's available.
  // Guard with a ref so we only auto-open each unique URL once
  // (prevents re-opening when the parent re-renders).
  useEffect(() => {
    if (!stream) return;
    if (autoOpenedRef.current === stream.embedUrl) return;
    autoOpenedRef.current = stream.embedUrl;
    setLaunchedUrl(stream.embedUrl);
    openInNewTab(stream.embedUrl);
  }, [stream?.embedUrl]);

  const handleSwitch = useCallback(
    (s: Stream) => {
      onSwitch(s); // keep parent state in sync
      autoOpenedRef.current = s.embedUrl;
      setLaunchedUrl(s.embedUrl);
      openInNewTab(s.embedUrl);
    },
    [onSwitch],
  );

  // Keyboard / remote navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!stream || streams.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = streams.findIndex((s) => s.embedUrl === stream.embedUrl);
      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        const next = streams[(idx + 1) % streams.length];
        if (next) handleSwitch(next);
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        const prev = streams[(idx - 1 + streams.length) % streams.length];
        if (prev) handleSwitch(prev);
      } else if (e.key >= "1" && e.key <= "9") {
        const target = streams[parseInt(e.key) - 1];
        if (target) handleSwitch(target);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stream, streams, handleSwitch]);

  if (!stream) return null;

  const launched = launchedUrl === stream.embedUrl;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        width: "100%",
        aspectRatio: "16/9",
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 3vw, 40px)",
        boxSizing: "border-box",
      }}
    >
      {/* TV badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--text3)",
          fontSize: "0.78rem",
        }}
      >
        <Tv2 size={16} color="var(--blue)" />
        TV browser detected
      </div>

      {/* Status */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: "clamp(1rem, 2.5vw, 1.6rem)",
            letterSpacing: "0.06em",
            color: "var(--text)",
            marginBottom: 6,
          }}
        >
          {stream.source}
          {stream.hd && (
            <span
              style={{
                marginLeft: 10,
                fontSize: "0.6rem",
                background: "var(--gold)",
                color: "#000",
                borderRadius: 4,
                padding: "2px 7px",
                fontWeight: 800,
                verticalAlign: "middle",
              }}
            >
              HD
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: launched ? "var(--green)" : "var(--text3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {launched ? (
            <><Check size={14} /> Opened in new tab</>
          ) : (
            "Opening stream…"
          )}
        </div>
      </div>

      {/* Re-open / manual launch button */}
      <button
        onClick={() => {
          setLaunchedUrl(stream.embedUrl);
          openInNewTab(stream.embedUrl);
        }}
        autoFocus
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "14px 28px",
          fontSize: "0.95rem",
          fontWeight: 700,
          cursor: "pointer",
          outline: "none",
          minWidth: 200,
          justifyContent: "center",
        }}
        onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px rgba(230,57,70,0.5)")}
        onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
      >
        <ExternalLink size={18} />
        Open Stream
      </button>

      {/* Other streams */}
      {streams.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: 4,
          }}
        >
          {streams.map((s, i) => {
            const isActive = stream.embedUrl === s.embedUrl;
            return (
              <button
                key={i}
                onClick={() => handleSwitch(s)}
                style={{
                  minWidth: 80,
                  minHeight: 56,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid var(--border2)",
                  background: isActive ? "rgba(230,57,70,0.12)" : "var(--surface)",
                  color: isActive ? "var(--text)" : "var(--text2)",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  outline: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
                onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent)")}
                onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 5,
                    background: isActive ? "var(--accent)" : "var(--surface2)",
                    color: isActive ? "#fff" : "var(--text3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                {s.source}
                {s.hd && (
                  <span style={{ fontSize: "0.54rem", background: "var(--gold)", color: "#000", borderRadius: 3, padding: "1px 4px", fontWeight: 800 }}>
                    HD
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: "0.68rem", color: "var(--text3)", textAlign: "center" }}>
        ← → or 1–9 to switch streams
      </div>
    </div>
  );
}
