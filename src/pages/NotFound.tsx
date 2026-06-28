import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--bg)",
        color: "var(--text)",
        padding: "0 20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Bebas Neue",
          fontSize: "clamp(5rem, 15vw, 10rem)",
          color: "var(--accent)",
          lineHeight: 1,
          letterSpacing: "0.04em",
        }}
      >
        404
      </div>
      <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text)" }}>
        Page not found
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text3)", maxWidth: 340, lineHeight: 1.6 }}>
        The match or page you're looking for doesn't exist or may have ended.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius)",
            padding: "10px 24px",
            fontSize: "0.88rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Live Sports
        </button>
        <button
          onClick={() => navigate("/movies")}
          style={{
            background: "var(--surface)",
            color: "var(--text2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "10px 24px",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Movies
        </button>
      </div>
    </div>
  );
}
