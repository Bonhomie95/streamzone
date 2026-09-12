import { Play } from "lucide-react";
import { usePlayerAdGate, type PlayerAdGate as Gate } from "../hooks/usePlayerAdGate";

// Click-catching overlay over a player. Each click opens a player ad in a new
// tab (see usePlayerAdGate); once the clicks are used up it disappears.
//
// Pass `gate` when the page also needs the lock state (e.g. to keep the
// native player paused), or just `sessionKey` to let the overlay manage
// itself (iframe players, where playback can't be held anyway).
export default function PlayerAdGate({
  gate,
  sessionKey = "",
}: {
  gate?: Gate;
  sessionKey?: string;
}) {
  const own = usePlayerAdGate(sessionKey);
  const { locked, clicksLeft, handleClick } = gate ?? own;
  if (!locked) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
      aria-label="Play"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 8,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(0,0,0,0.55)",
        border: "none",
        color: "#fff",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        }}
      >
        <Play size={30} fill="#fff" color="#fff" style={{ marginLeft: 4 }} />
      </span>
      <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
        {clicksLeft > 1 ? "Tap to play" : "Tap again to start"}
      </span>
    </button>
  );
}
