/**
 * TVStreamPanel — renders an iframe player + D-pad-friendly stream switcher
 * specifically for Smart TV browsers (Tizen, webOS, Fire TV, etc.).
 *
 * Key differences from the desktop player:
 *  • No `allow` attribute on the iframe — TV engines auto-sandbox iframes when
 *    they see Permissions-Policy tokens they don't support, causing the
 *    "remove sandbox attribute" error.  Omitting it lets the browser use its
 *    own permissive defaults.
 *  • Large touch/remote-friendly stream buttons (min 64 px tall, high contrast).
 *  • Stream list is rendered below the player (no sidebar — TVs are landscape
 *    and sidebars eat too much horizontal space).
 *  • Keyboard navigation: ← / → or P / N to switch streams, 1–9 to jump.
 */

import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import type { Stream } from "../types";

interface TVStreamPanelProps {
  stream: Stream | null;
  streams: Stream[];
  onSwitch: (s: Stream) => void;
}

export default function TVStreamPanel({
  stream,
  streams,
  onSwitch,
}: TVStreamPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(0);

  // Reset error state whenever the active stream changes
  useEffect(() => {
    setIframeError(false);
  }, [stream?.embedUrl]);

  // Keep focusedIdx in sync with the active stream
  useEffect(() => {
    if (!stream) return;
    const idx = streams.findIndex((s) => s.embedUrl === stream.embedUrl);
    if (idx !== -1) setFocusedIdx(idx);
  }, [stream, streams]);

  // Keyboard / remote navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (streams.length === 0) return;

      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        const next = streams[(focusedIdx + 1) % streams.length];
        if (next) { onSwitch(next); setFocusedIdx((focusedIdx + 1) % streams.length); }
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        const prev = streams[(focusedIdx - 1 + streams.length) % streams.length];
        if (prev) { onSwitch(prev); setFocusedIdx((focusedIdx - 1 + streams.length) % streams.length); }
      } else if (e.key >= "1" && e.key <= "9") {
        const target = streams[parseInt(e.key) - 1];
        if (target) { onSwitch(target); setFocusedIdx(parseInt(e.key) - 1); }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [streams, focusedIdx, onSwitch]);

  if (!stream) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Player ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16/9",
          background: "#000",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        {iframeError ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              background: "var(--bg2)",
              color: "var(--text3)",
            }}
          >
            <WifiOff size={48} strokeWidth={1.2} />
            <span style={{ fontSize: "1rem", fontWeight: 600 }}>
              Stream unavailable
            </span>
            <span style={{ fontSize: "0.82rem" }}>
              Use the buttons below to try another source
            </span>
          </div>
        ) : (
          <iframe
            key={stream.embedUrl}
            ref={iframeRef}
            src={stream.embedUrl}
            // ⚠️  No `allow` attribute — TV browsers (Tizen, webOS, Fire TV)
            // auto-sandbox iframes when they encounter Permissions-Policy tokens
            // they don't recognise, which shows "remove sandbox attribute" and
            // blocks playback.  Omitting `allow` entirely lets the TV browser
            // use its own permissive defaults.
            allowFullScreen
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            onError={() => setIframeError(true)}
          />
        )}
      </div>

      {/* ── Stream switcher ───────────────────────────────────────── */}
      {streams.length > 1 && (
        <div>
          {/* Label */}
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text3)",
              marginBottom: 10,
            }}
          >
            {streams.length} Streams Available · ← → to switch
          </div>

          {/* Button row — horizontally scrollable on narrow TVs */}
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 4,
              // hide scrollbar on TV (not needed, remote scrolls the focus)
              scrollbarWidth: "none",
            }}
          >
            {streams.map((s, i) => {
              const isActive = stream.embedUrl === s.embedUrl;
              return (
                <button
                  key={i}
                  onClick={() => { onSwitch(s); setFocusedIdx(i); }}
                  // TV remote "Enter" key fires click, so no extra handling needed
                  style={{
                    flexShrink: 0,
                    minWidth: 100,
                    minHeight: 64,
                    padding: "10px 18px",
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
                    gap: 4,
                    // Large focus ring for TV remote highlight
                    outline: "none",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  // Visible focus ring for TV d-pad navigation
                  onFocus={(e) =>
                    (e.currentTarget.style.boxShadow =
                      "0 0 0 3px var(--accent)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.boxShadow = "none")
                  }
                >
                  {/* Stream number badge */}
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: isActive ? "var(--accent)" : "var(--surface2)",
                      color: isActive ? "#fff" : "var(--text3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>

                  {/* Source + quality */}
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.source}
                  </span>

                  {s.hd && (
                    <span
                      style={{
                        fontSize: "0.58rem",
                        background: "var(--gold)",
                        color: "#000",
                        borderRadius: 3,
                        padding: "1px 5px",
                        fontWeight: 700,
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
