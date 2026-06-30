/**
 * TVStreamPanel — TV-browser stream launcher (no iframe).
 *
 * Smart TV browsers (Tizen, webOS, Fire TV Silk) auto-sandbox cross-origin
 * iframes when they encounter `allow` / Permissions-Policy attributes they
 * don't support, causing the embedded player to display "remove sandbox
 * attribute" and refuse to play.  The workaround is to skip the iframe
 * entirely and open the stream URL as a standalone page in a new tab, where
 * the TV browser plays it without any sandboxing.
 *
 * UX:
 *  • Shows a prominent "Watch Live" launcher for the active stream.
 *  • Lists all other streams as large D-pad-friendly buttons.
 *  • ← / → (or P / N) on the keyboard / remote switches the active stream.
 *  • 1–9 jumps directly to a numbered stream.
 *  • Clicking / pressing Enter on any button opens that stream in a new tab.
 */

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, Tv2 } from "lucide-react";
import type { Stream } from "../types";

interface TVStreamPanelProps {
  stream: Stream | null;
  streams: Stream[];
  onSwitch: (s: Stream) => void;
}

function openStream(url: string) {
  // `noopener` is intentionally omitted — some TV browsers need the opener
  // reference to handle window lifecycle correctly.
  window.open(url, "_blank");
}

export default function TVStreamPanel({
  stream,
  streams,
  onSwitch,
}: TVStreamPanelProps) {
  const [activeIdx, setActiveIdx] = useState<number>(0);

  // Keep activeIdx in sync when parent switches the stream
  useEffect(() => {
    if (!stream) return;
    const idx = streams.findIndex((s) => s.embedUrl === stream.embedUrl);
    if (idx !== -1) setActiveIdx(idx);
  }, [stream, streams]);

  const switchTo = useCallback(
    (idx: number) => {
      const s = streams[idx];
      if (!s) return;
      setActiveIdx(idx);
      onSwitch(s);
    },
    [streams, onSwitch],
  );

  // Keyboard / TV remote navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (streams.length === 0) return;

      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        switchTo((activeIdx + 1) % streams.length);
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        switchTo((activeIdx - 1 + streams.length) % streams.length);
      } else if (e.key === "Enter" && stream) {
        e.preventDefault();
        openStream(stream.embedUrl);
      } else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (streams[idx]) switchTo(idx);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [streams, activeIdx, stream, switchTo]);

  if (!stream) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "8px 0",
      }}
    >
      {/* ── TV notice banner ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(77,158,247,0.08)",
          border: "1px solid rgba(77,158,247,0.2)",
          borderRadius: 10,
          padding: "10px 16px",
          fontSize: "0.8rem",
          color: "var(--text2)",
        }}
      >
        <Tv2 size={16} color="var(--blue)" style={{ flexShrink: 0 }} />
        <span>
          TV browser detected — streams open directly for best compatibility.
          Press <strong>Enter</strong> or tap a button to launch.
        </span>
      </div>

      {/* ── Primary launch button ─────────────────────────────────── */}
      <button
        onClick={() => openStream(stream.embedUrl)}
        autoFocus
        style={{
          width: "100%",
          minHeight: 96,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          background: "var(--accent)",
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontSize: "1.1rem",
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.03em",
          outline: "none",
          transition: "opacity 0.15s",
        }}
        onFocus={(e) => (e.currentTarget.style.opacity = "0.85")}
        onBlur={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <ExternalLink size={22} />
        Watch Live — {stream.source}
        {stream.hd && (
          <span
            style={{
              fontSize: "0.65rem",
              background: "var(--gold)",
              color: "#000",
              borderRadius: 4,
              padding: "2px 7px",
              fontWeight: 800,
            }}
          >
            HD
          </span>
        )}
      </button>

      {/* ── Stream switcher ───────────────────────────────────────── */}
      {streams.length > 1 && (
        <div>
          <div
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text3)",
              marginBottom: 10,
            }}
          >
            {streams.length} streams — ← → to switch · Enter to open
          </div>

          {/* Horizontally scrollable row of stream buttons */}
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 6,
              scrollbarWidth: "none",
            }}
          >
            {streams.map((s, i) => {
              const isActive = stream.embedUrl === s.embedUrl;
              return (
                <button
                  key={i}
                  onClick={() => {
                    switchTo(i);
                    openStream(s.embedUrl);
                  }}
                  style={{
                    flexShrink: 0,
                    minWidth: 110,
                    minHeight: 72,
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid var(--border2)",
                    background: isActive
                      ? "rgba(230,57,70,0.15)"
                      : "var(--surface)",
                    color: isActive ? "var(--text)" : "var(--text2)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    outline: "none",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.boxShadow =
                      "0 0 0 3px var(--accent)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.boxShadow = "none")
                  }
                >
                  {/* Number badge */}
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      background: isActive
                        ? "var(--accent)"
                        : "var(--surface2)",
                      color: isActive ? "#fff" : "var(--text3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>

                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.source}
                  </span>

                  {s.hd && (
                    <span
                      style={{
                        fontSize: "0.56rem",
                        background: "var(--gold)",
                        color: "#000",
                        borderRadius: 3,
                        padding: "1px 5px",
                        fontWeight: 800,
                      }}
                    >
                      HD
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
