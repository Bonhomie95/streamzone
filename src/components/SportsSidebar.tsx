import { Heart } from "lucide-react";
import type { Sport } from "../types";

const SPORT_EMOJIS: Record<string, string> = {
  football: "⚽", basketball: "🏀", tennis: "🎾", hockey: "🏒",
  baseball: "⚾", mma: "🥊", boxing: "🥊", cricket: "🏏",
  rugby: "🏉", volleyball: "🏐", golf: "⛳", motorsport: "🏎",
  cycling: "🚴", swimming: "🏊", athletics: "🏃", default: "🏆",
};

interface SidebarProps {
  sports: Sport[];
  selected: string;
  onSelect: (id: string) => void;
  counts: Record<string, number>;
  favouriteCount?: number;
}

export default function SportsSidebar({ sports, selected, onSelect, counts, favouriteCount = 0 }: SidebarProps) {
  const items = [{ id: "all", name: "All Sports" }, ...sports];

  function renderBtn(id: string, label: string, emoji: string | null, count: number, isHeart = false) {
    const isActive = selected === id;
    return (
      <button
        key={id}
        onClick={() => onSelect(id)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", border: "none", textAlign: "left",
          background: isActive ? "rgba(230,57,70,0.08)" : "transparent",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
          color: isActive ? "var(--text)" : "var(--text2)",
          fontSize: "0.86rem", fontWeight: isActive ? 600 : 400,
          cursor: "pointer", transition: "all 0.15s", width: "100%",
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: "0.95rem", width: 20, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isHeart
            ? <Heart size={14} fill={isActive ? "var(--accent)" : "none"} color={isActive ? "var(--accent)" : "var(--text3)"} />
            : emoji}
        </span>
        <span style={{ flex: 1 }}>{label}</span>
        {count > 0 && (
          <span style={{
            fontSize: "0.65rem", fontWeight: 700,
            background: isActive ? "var(--accent)" : "var(--border2)",
            color: isActive ? "#fff" : "var(--text3)",
            borderRadius: 10, padding: "1px 6px", minWidth: 20, textAlign: "center",
          }}>
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      className="desktop-sidebar"
      style={{
        width: "var(--sidebar-w)", flexShrink: 0,
        background: "var(--surface)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflowY: "auto",
        height: "calc(100vh - var(--header-h))", position: "sticky", top: "var(--header-h)",
      }}
    >
      <div style={{ padding: "14px 14px 6px", fontSize: "0.62rem", fontWeight: 700, color: "var(--text3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        Categories
      </div>

      {/* Favourites entry */}
      {renderBtn("__favourites__", "My Favourites", null, favouriteCount, true)}

      <div style={{ height: "0.5px", background: "var(--border)", margin: "4px 14px" }} />

      {items.map(sport => renderBtn(
        sport.id,
        sport.name,
        sport.id === "all" ? "🌐" : (SPORT_EMOJIS[sport.id] || SPORT_EMOJIS.default),
        counts[sport.id] || 0,
        false
      ))}
    </aside>
  );
}
