import { useState, useEffect } from "react";
import { X } from "lucide-react";

/**
 * PrerollAd — Overlay ad shown before the stream loads.
 *
 * This is your most valuable ad slot. It sits on top of the player
 * chrome (not inside the iframe), so it fires regardless of what
 * the stream provider does inside their embed.
 *
 * TO ACTIVATE:
 * - Replace the placeholder div with your ad network's tag
 * - Adsterra "Direct Link" or "Pop-under" format works well here
 * - You can also use this to show a countdown interstitial ad
 *
 * Set SKIP_AFTER_SECONDS to how many seconds before the skip button appears.
 */

const SKIP_AFTER_SECONDS = 5;
const SHOW_AD = false; // Set to true when you have a real ad to show

interface PrerollAdProps {
  onDismiss: () => void;
}

export default function PrerollAd({ onDismiss }: PrerollAdProps) {
  const [countdown, setCountdown] = useState(SKIP_AFTER_SECONDS);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (!SHOW_AD) {
      onDismiss();
      return;
    }
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          setCanSkip(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!SHOW_AD) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      {/* Replace this placeholder with your actual ad tag */}
      <div
        style={{
          width: 300,
          height: 250,
          background: "var(--surface2)",
          border: "1px dashed var(--border2)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text3)",
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
        }}
      >
        AD · 300×250
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {canSkip ? (
          <button
            onClick={onDismiss}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <X size={14} />
            Skip Ad
          </button>
        ) : (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "0.82rem",
              color: "var(--text2)",
            }}
          >
            Skip in {countdown}s
          </div>
        )}
        <span style={{ fontSize: "0.72rem", color: "var(--text3)" }}>
          Ad · Stream loading...
        </span>
      </div>
    </div>
  );
}
