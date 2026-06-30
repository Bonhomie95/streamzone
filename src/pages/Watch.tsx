import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  ExternalLink,
  Star,
  Clock,
  ChevronDown,
  ChevronUp,
  Tv2,
  Trophy,
  Film,
  Share2,
  Check,
} from "lucide-react";
import {
  fetchStreams,
  fetchAllMatches,
  badgeUrl,
  getDaddyStreams,
} from "../api";
import { isTVBrowser } from "../utils/tvDetect";
import MatchCard from "../components/MatchCard";
import ViewerBadge from "../components/ViewerBadge";
import AdBanner from "../components/AdBanner";
import TVStreamPanel from "../components/TVStreamPanel";
import { isTVBrowser } from "../utils/device";
import type { EnrichedMatch, Stream } from "../types";

const IS_TV = isTVBrowser();

// Auto-retry delay when an iframe errors — tries the next stream after this many ms
const AUTO_RETRY_MS = 3_000;

function formatDate(ms: number) {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Watch() {
  const { matchId: rawMatchId } = useParams<{ matchId: string }>();
  // React Router decodes URL params once automatically — no manual decode needed.
  // A second decodeURIComponent would break IDs that contain encoded chars (e.g. daddy_ IDs).
  const matchId = rawMatchId;
  const navigate = useNavigate();

  // TV browsers (Tizen, webOS, Fire TV…) auto-sandbox cross-origin iframes when
  // they encounter `allow` attributes they don't fully support, causing embedded
  // players to show "remove sandbox attribute".  Strip the attribute on these platforms.
  const isTV = isTVBrowser();

  const [match, setMatch] = useState<EnrichedMatch | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  // Countdown shown when auto-retrying after an iframe error (seconds remaining)
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStreamList, setShowStreamList] = useState(true);
  const [liveMatches, setLiveMatches] = useState<EnrichedMatch[]>([]);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load match ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!matchId) {
        setLoadingMatch(false);
        return;
      }

      // 1. Try sessionStorage (same tab navigation — fastest)
      const cached = sessionStorage.getItem(`match_${matchId}`);
      if (cached) {
        try {
          setMatch(JSON.parse(cached));
          setLoadingMatch(false);
          return;
        } catch {
          /* corrupt, continue */
        }
      }

      // 2. Try localStorage (persists across tabs/TV browser sessions)
      const lsCached = localStorage.getItem(`match_${matchId}`);
      if (lsCached) {
        try {
          const parsed = JSON.parse(lsCached);
          setMatch(parsed);
          setLoadingMatch(false);
          return;
        } catch {
          /* corrupt, continue */
        }
      }

      // 3. Fetch via race API — fetchAllMatches covers both sources
      try {
        const all = await fetchAllMatches();
        const found = all.find((m) => m.id === matchId);
        if (found) {
          setMatch(found);
          setLoadingMatch(false);
          return;
        }
      } catch {
        /* noop */
      }

      setLoadingMatch(false);
    }
    load();
  }, [matchId]);

  // ─── Load streams ─────────────────────────────────────────────────
  useEffect(() => {
    if (!match) return;
    loadStreams(match);
  }, [match]);

  // ─── Load live rail via the race API (fix: was calling both APIs separately) ──
  useEffect(() => {
    async function loadLive() {
      try {
        const all = await fetchAllMatches();
        const live = all.filter((m) => m.status === "live" && m.id !== matchId);
        setLiveMatches(live);
      } catch {
        /* noop */
      }
    }
    loadLive();
  }, [matchId]);

  // ─── Keyboard shortcuts: ←/P = prev stream, →/N = next, 1-9 = jump ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept when user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (streams.length === 0 || !activeStream) return;

      const idx = streams.findIndex((s) => s.embedUrl === activeStream.embedUrl);

      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        const next = streams[(idx + 1) % streams.length];
        if (next) switchStream(next);
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        const prev = streams[(idx - 1 + streams.length) % streams.length];
        if (prev) switchStream(prev);
      } else if (e.key >= "1" && e.key <= "9") {
        const target = streams[parseInt(e.key) - 1];
        if (target) switchStream(target);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [streams, activeStream]);

  async function loadStreams(m: EnrichedMatch) {
    setLoadingStreams(true);
    setStreams([]);
    setActiveStream(null);
    setIframeError(false);
    clearRetryTimers();

    // DaddyLive: stream URLs are embedded in the match object as _daddyUrls.
    // They survive localStorage/sessionStorage because JSON.stringify includes
    // all own enumerable properties — _daddyUrls is set directly on the object,
    // not on the prototype, so it round-trips correctly.
    // If the match came from the raw API fallback path and _daddyUrls is missing
    // (shouldn't happen but defensive), re-fetch DaddyLive to recover them.
    if (m.id.startsWith("daddy_")) {
      let s = getDaddyStreams(m);
      if (s.length === 0) {
        // _daddyUrls was lost — re-fetch and find the match
        try {
          const all = await fetchAllMatches();
          const fresh = all.find((x) => x.id === m.id);
          if (fresh) s = getDaddyStreams(fresh);
        } catch {
          /* noop */
        }
      }
      setStreams(s);
      if (s.length > 0) setActiveStream(s[0]);
      setLoadingStreams(false);
      return;
    }

    const batches = await Promise.all(
      m.sources.map((src) => fetchStreams(src.source, src.id)),
    );
    const all = batches.flat();
    setStreams(all);
    if (all.length > 0) setActiveStream(all[0]);
    setLoadingStreams(false);
  }

  function switchStream(s: Stream) {
    clearRetryTimers();
    setActiveStream(s);
    setIframeError(false);
    setRetryCountdown(null);
  }

  // ─── Auto-retry on iframe error ───────────────────────────────────
  // When a stream errors, start a 3-second countdown then auto-advance
  // to the next available stream. The user can manually skip at any time.
  function clearRetryTimers() {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    retryTimerRef.current = null;
    retryIntervalRef.current = null;
  }

  const handleIframeError = useCallback(() => {
    setIframeError(true);

    if (!activeStream) return;
    const currentStreams = streams; // capture at call time
    const idx = currentStreams.findIndex((s) => s.embedUrl === activeStream.embedUrl);
    const nextStream = currentStreams[idx + 1] ?? null;
    if (!nextStream) return; // no more streams to try

    // Start countdown
    const secs = Math.ceil(AUTO_RETRY_MS / 1000);
    setRetryCountdown(secs);

    retryIntervalRef.current = setInterval(() => {
      setRetryCountdown((c) => {
        if (c === null || c <= 1) {
          clearInterval(retryIntervalRef.current!);
          return null;
        }
        return c - 1;
      });
    }, 1_000);

    retryTimerRef.current = setTimeout(() => {
      switchStream(nextStream);
    }, AUTO_RETRY_MS);
  }, [activeStream, streams]);

  // Clean up timers on unmount
  useEffect(() => () => clearRetryTimers(), []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ─── Dynamic page title + JSON-LD structured data ─────────────────
  useEffect(() => {
    if (!match) return;
    const teams = match.teams?.home && match.teams?.away
      ? `${match.teams.home.name} vs ${match.teams.away.name}`
      : match.title;
    const statusLabel = match.status === "live" ? " — LIVE" : match.status === "upcoming" ? " — Upcoming" : "";
    document.title = `${teams}${statusLabel} | StreamZone`;

    // Inject SportsEvent JSON-LD
    const id = "sz-jsonld-sports";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = id;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      "name": teams,
      "description": `Watch ${teams} live on StreamZone`,
      "startDate": new Date(match.date).toISOString(),
      "eventStatus": match.status === "live"
        ? "https://schema.org/EventScheduled"
        : match.status === "finished"
          ? "https://schema.org/EventPostponed"
          : "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
      "location": { "@type": "VirtualLocation", "url": `https://stream-zone.xyz/watch/${encodeURIComponent(match.id)}` },
      "organizer": { "@type": "Organization", "name": "StreamZone", "url": "https://stream-zone.xyz" },
      ...(match.teams?.home && match.teams?.away ? {
        "homeTeam": { "@type": "SportsTeam", "name": match.teams.home.name },
        "awayTeam": { "@type": "SportsTeam", "name": match.teams.away.name },
      } : {}),
    });

    return () => {
      document.title = "StreamZone — Live Sports & Movies";
      document.getElementById(id)?.remove();
    };
  }, [match]);

  // ─── Share button ─────────────────────────────────────────────────
  const [shareCopied, setShareCopied] = useState(false);

  async function handleShare() {
    const teams = match?.teams?.home && match?.teams?.away
      ? `${match.teams.home.name} vs ${match.teams.away.name}`
      : match?.title ?? "Match";
    const url = window.location.href;
    const shareData = { title: `${teams} — StreamZone`, url };

    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch { /* user dismissed */ }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
  }

  const hasTeams = match?.teams?.home && match?.teams?.away;
  const isLive = match?.status === "live";

  if (loadingMatch) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        <TopBar onBack={() => navigate("/")} />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            color: "var(--text2)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: "3px solid var(--border2)",
              borderTop: "3px solid var(--accent)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <span style={{ fontSize: "0.85rem" }}>Loading match...</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!match) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        <TopBar onBack={() => navigate("/")} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "var(--text3)",
          }}
        >
          <WifiOff size={40} strokeWidth={1.2} />
          <span>Match not found</span>
          <button
            onClick={() => navigate("/")}
            style={{
              marginTop: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        animation: "watchFadeIn 0.25s ease",
      }}
    >
      <TopBar onBack={() => navigate("/")} />

      {/* Top ad */}
      <div
        style={{
          padding: "8px 16px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <AdBanner size="leaderboard" />
      </div>

      {/* Main layout: player area + stream sidebar */}
      <div
        className="watch-outer-pad"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          maxWidth: "min(2400px, 96vw)",
          width: "100%",
          margin: "0 auto",
          padding:
            "clamp(8px, 1.5vw, 28px) clamp(8px, 2vw, 36px) clamp(16px, 2.5vw, 48px)",
          gap: "clamp(10px, 1.5vw, 24px)",
        }}
      >
        {/* Match title row */}
        <div
          className="watch-title-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {hasTeams ? (
            <>
              <TeamBadge
                badge={match.teams!.home!.badge}
                name={match.teams!.home!.name}
                size={48}
              />
              <div style={{ textAlign: "center", flex: 1, minWidth: 120 }}>
                <div
                  style={{
                    fontFamily: "Bebas Neue",
                    fontSize: "clamp(1.1rem, 3vw, 1.8rem)",
                    letterSpacing: "0.06em",
                    lineHeight: 1,
                  }}
                >
                  {match.teams!.home!.name}{" "}
                  <span style={{ color: "var(--text3)" }}>vs</span>{" "}
                  {match.teams!.away!.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <StatusBadge status={match.status} />
                  {match.popular && (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        fontSize: "0.72rem",
                        color: "var(--gold)",
                      }}
                    >
                      <Star size={11} fill="var(--gold)" /> Popular
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--text3)",
                      textTransform: "capitalize",
                    }}
                  >
                    {match.category}
                  </span>
                  {!isLive && (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "0.72rem",
                        color: "var(--text3)",
                      }}
                    >
                      <Clock size={11} />
                      {formatDate(match.date)}
                    </span>
                  )}
                </div>
              </div>
              <TeamBadge
                badge={match.teams!.away!.badge}
                name={match.teams!.away!.name}
                size={48}
              />
            </>
          ) : (
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontFamily: "Bebas Neue",
                  fontSize: "clamp(1.2rem, 4vw, 2rem)",
                  letterSpacing: "0.05em",
                }}
              >
                {match.title}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <StatusBadge status={match.status} />
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--text3)",
                    textTransform: "capitalize",
                  }}
                >
                  {match.category}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Viewer count badge */}
        <div
          className="watch-viewer-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <ViewerBadge
            id={matchId?.startsWith("daddy_") ? "live" : (matchId ?? "")}
            active={!!activeStream}
            large
          />
          {match.status === "live" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(45,206,137,0.1)",
                border: "1px solid rgba(45,206,137,0.25)",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--green)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--green)",
                  display: "inline-block",
                  animation: "pulse 1.2s infinite",
                }}
              />
              LIVE NOW
            </span>
          )}
          {/* Keyboard hint — desktop only */}
          {streams.length > 1 && (
            <span
              className="desktop-only"
              style={{ fontSize: "0.68rem", color: "var(--text3)" }}
            >
              ← → to switch streams · 1–9 to jump
            </span>
          )}
          {/* Share button */}
          <button
            onClick={handleShare}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "5px 12px",
              color: shareCopied ? "var(--green)" : "var(--text2)",
              fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {shareCopied ? <Check size={13} /> : <Share2 size={13} />}
            {shareCopied ? "Copied!" : "Share"}
          </button>
        </div>

        {/* Two-column: player left, stream list right */}
        <div
          style={{
            display: "flex",
            gap: "clamp(10px, 1.2vw, 24px)",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {/* Player column */}
          <div
            style={{
              flex: "1 1 300px",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "clamp(8px, 1vw, 16px)",
            }}
          >
            {/* Player box */}
            <div
              className="watch-player-col"
              ref={playerWrapRef}
              style={{
                position: "relative",
                background: "#000",
                borderRadius: isFullscreen ? 0 : "var(--radius)",
                overflow: "hidden",
                border: isFullscreen ? "none" : "1px solid var(--border)",
                width: "100%",
                aspectRatio: "16/9",
                minHeight: "clamp(200px, 56.25vw, 90vh)",
              }}
            >
              {loadingStreams ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                    background: "var(--bg2)",
                    color: "var(--text2)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      border: "3px solid var(--border2)",
                      borderTop: "3px solid var(--accent)",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                  <span style={{ fontSize: "0.85rem" }}>
                    Loading streams...
                  </span>
                </div>
              ) : streams.length === 0 ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    background: "var(--bg2)",
                    color: "var(--text3)",
                  }}
                >
                  {match?.status === "upcoming" ? (
                    <>
                      <Clock size={44} strokeWidth={1.2} />
                      <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        Match not live yet
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text3)", textAlign: "center", maxWidth: 260 }}>
                        Streams will be available once this match goes live
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={44} strokeWidth={1.2} />
                      <span style={{ fontSize: "0.9rem" }}>
                        No streams available
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text3)" }}>
                        Check back when the match goes live
                      </span>
                    </>
                  )}
                </div>
              ) : iframeError ? (
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
                  }}
                >
                  <WifiOff size={44} strokeWidth={1.2} color="var(--text3)" />
                  <div style={{ textAlign: "center", padding: "0 24px" }}>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      Stream blocked by source
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text3)",
                        marginBottom: 20,
                      }}
                    >
                      {retryCountdown !== null
                        ? `Trying next stream in ${retryCountdown}s…`
                        : "Try another source from the list, or open directly."}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {streams
                        .filter((s) => s.embedUrl !== activeStream?.embedUrl)
                        .slice(0, 3)
                        .map((s, i) => (
                          <button
                            key={i}
                            onClick={() => switchStream(s)}
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border2)",
                              borderRadius: 8,
                              padding: "7px 14px",
                              color: "var(--text2)",
                              fontSize: "0.8rem",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {s.hd && (
                              <span
                                style={{
                                  fontSize: "0.58rem",
                                  background: "var(--gold)",
                                  color: "#000",
                                  borderRadius: 3,
                                  padding: "1px 4px",
                                  fontWeight: 700,
                                }}
                              >
                                HD
                              </span>
                            )}
                            {s.source} #{s.streamNo}
                          </button>
                        ))}
                      {activeStream && (
                        <a
                          href={activeStream.embedUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: "var(--accent)",
                            color: "#fff",
                            borderRadius: 8,
                            padding: "7px 14px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          <ExternalLink size={13} />
                          Open Direct
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeStream ? (
                IS_TV ? (
                  <TVStreamPanel
                    stream={activeStream}
                    streams={streams}
                    onSwitch={switchStream}
                  />
                ) : (
                  <iframe
                    key={activeStream.embedUrl}
                    ref={iframeRef}
                    src={activeStream.embedUrl}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      border: "none",
                      display: "block",
                    }}
                    allowFullScreen
                    // TV browsers auto-sandbox iframes when they see `allow` attributes
                    // they don't fully support → "remove sandbox attribute" error.
                    // Omit it on TV so the browser uses its own permissive defaults.
                    {...(!isTV && {
                      allow:
                        "autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write",
                    })}
                    onError={handleIframeError}
                  />
                )
              ) : null}
            </div>

            {/* Active stream info bar */}
            {activeStream && (
              <div
                className="watch-infobar"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 14px",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Wifi
                    size={13}
                    color={isLive ? "var(--green)" : "var(--text3)"}
                  />
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    {activeStream.source} · Stream #{activeStream.streamNo}
                  </span>
                  {activeStream.hd && (
                    <span
                      style={{
                        fontSize: "0.62rem",
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
                  {activeStream.language &&
                    activeStream.language !== "unknown" && (
                      <span
                        style={{ fontSize: "0.72rem", color: "var(--text3)" }}
                      >
                        {activeStream.language}
                      </span>
                    )}
                </div>
                <span style={{ fontSize: "0.72rem", color: "var(--text3)" }}>
                  {streams.indexOf(activeStream) + 1} of {streams.length}
                </span>
              </div>
            )}

            {/* Mobile: collapsible stream list below player */}
            <div className="show-below-md" style={{ display: "none" }}>
              <button
                className="watch-stream-toggle"
                onClick={() => setShowStreamList((v) => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 14px",
                  color: "var(--text2)",
                  fontSize: "0.82rem",
                  fontWeight: 500,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Tv2 size={14} color="var(--accent)" />
                  {streams.length} stream{streams.length !== 1 ? "s" : ""}{" "}
                  available
                </span>
                {showStreamList ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              {showStreamList && (
                <StreamSidebar
                  streams={streams}
                  activeStream={activeStream}
                  onSwitch={switchStream}
                  isTV={isTV}
                />
              )}
            </div>
          </div>

          {/* Right sidebar: stream list (desktop) */}
          <div
            className="hide-below-md"
            style={{ width: "clamp(240px, 20vw, 400px)", flexShrink: 0 }}
          >
            <StreamSidebar
              streams={streams}
              activeStream={activeStream}
              onSwitch={switchStream}
              loading={loadingStreams}
              isTV={isTV}
            />
          </div>
        </div>

        {/* Bottom ad */}
        <div
          style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}
        >
          <AdBanner size="rectangle" />
        </div>

        {/* Other live matches */}
        {liveMatches.length > 0 && (
          <div style={{ paddingTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "inline-block",
                  animation: "pulse 1.2s infinite",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "Bebas Neue",
                  fontSize: "1.1rem",
                  letterSpacing: "0.06em",
                }}
              >
                Also Live Now
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text3)",
                  marginLeft: 2,
                }}
              >
                {liveMatches.length} match{liveMatches.length !== 1 ? "es" : ""}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "clamp(10px, 1.2vw, 18px)",
              }}
            >
              {liveMatches.slice(0, 12).map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  onClick={() => {
                    const key = `match_${m.id}`;
                    const val = JSON.stringify(m);
                    sessionStorage.setItem(key, val);
                    try {
                      localStorage.setItem(key, val);
                    } catch {
                      /* noop */
                    }
                    navigate(`/watch/${encodeURIComponent(m.id)}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes watchFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .hide-below-md { display: block; }
        .show-below-md { display: none !important; }
        @media (max-width: 768px) {
          .hide-below-md { display: none !important; }
          .show-below-md { display: block !important; }
          .watch-outer-pad {
            padding-left: 0 !important;
            padding-right: 0 !important;
            padding-top: 0 !important;
          }
          .watch-player-col {
            border-radius: 0 !important;
          }
          .watch-title-row {
            gap: 8px !important;
            padding: 8px 12px 0 !important;
          }
          .watch-viewer-row {
            padding: 0 12px !important;
          }
          .watch-infobar {
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
          }
          .watch-stream-toggle {
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
          }
        }
        @media (min-width: 769px) {
          .show-below-md { display: none !important; }
        }
        @media (min-width: 1600px) {
          .stream-btn-label { font-size: 0.95rem !important; }
          .stream-btn-sub { font-size: 0.82rem !important; }
        }
        @media (min-width: 2560px) {
          .stream-btn-label { font-size: 1.1rem !important; }
          .stream-btn-sub { font-size: 0.95rem !important; }
          .stream-num-badge { width: 36px !important; height: 36px !important; font-size: 0.9rem !important; }
        }
        @media (min-width: 3840px) {
          .stream-btn-label { font-size: 1.35rem !important; }
          .stream-btn-sub { font-size: 1.1rem !important; }
          .stream-num-badge { width: 44px !important; height: 44px !important; font-size: 1.1rem !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  const nav = useNavigate();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(8px, 1vw, 18px)",
        padding: "0 clamp(12px, 2vw, 40px)",
        height: "var(--header-h)",
        background: "rgba(8,11,16,0.95)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}
    >
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 12px",
            color: "var(--text2)",
            fontSize: "0.82rem",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <button
          onClick={() => nav("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <img
            src="/logo.png"
            alt="StreamZone"
            style={{ height: 34, width: 34, objectFit: "contain", borderRadius: 8 }}
          />
          <span
            style={{
              fontFamily: "Bebas Neue",
              fontSize: "clamp(1.2rem, 1.8vw, 2.2rem)",
              letterSpacing: "0.08em",
              color: "var(--text)",
            }}
          >
            STREAM<span style={{ color: "var(--accent)" }}>ZONE</span>
          </span>
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 3,
          }}
        >
          <button
            onClick={() => nav("/")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 11px",
              borderRadius: 7,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Trophy size={12} /> Sports
          </button>
          <button
            onClick={() => nav("/movies")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 11px",
              borderRadius: 7,
              border: "none",
              background: "transparent",
              color: "var(--text2)",
              fontSize: "0.78rem",
              fontWeight: 400,
              cursor: "pointer",
            }}
          >
            <Film size={12} /> Movies
          </button>
        </div>
      </div>
  );
}

function TeamBadge({
  badge,
  name,
  size,
}: {
  badge: string;
  name: string;
  size: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: 60,
      }}
    >
      <img
        src={badgeUrl(badge)}
        alt={name}
        width={size}
        height={size}
        style={{
          objectFit: "contain",
          width: "clamp(40px, 4vw, 72px)",
          height: "clamp(40px, 4vw, 72px)",
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <span
        style={{
          fontSize: "clamp(0.68rem, 0.9vw, 1rem)",
          fontWeight: 600,
          textAlign: "center",
          color: "var(--text2)",
          maxWidth: 100,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live")
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "rgba(230,57,70,0.15)",
          border: "1px solid rgba(230,57,70,0.4)",
          borderRadius: 10,
          padding: "2px 8px",
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "var(--accent)",
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--accent)",
            display: "inline-block",
            animation: "pulse 1.2s infinite",
          }}
        />
        LIVE
      </span>
    );
  if (status === "finished")
    return (
      <span
        style={{
          background: "var(--surface2)",
          borderRadius: 10,
          padding: "2px 8px",
          fontSize: "0.65rem",
          fontWeight: 600,
          color: "var(--text3)",
        }}
      >
        FINISHED
      </span>
    );
  return (
    <span
      style={{
        background: "rgba(77,158,247,0.1)",
        border: "1px solid rgba(77,158,247,0.2)",
        borderRadius: 10,
        padding: "2px 8px",
        fontSize: "0.65rem",
        fontWeight: 600,
        color: "var(--blue)",
      }}
    >
      UPCOMING
    </span>
  );
}

function StreamSidebar({
  streams,
  activeStream,
  onSwitch,
  loading,
  isTV = false,
}: {
  streams: Stream[];
  activeStream: Stream | null;
  onSwitch: (s: Stream) => void;
  loading?: boolean;
  isTV?: boolean;
}) {
  if (loading) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Stream Sources</div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 46, borderRadius: 8, background: "var(--surface2)", marginBottom: 6, animation: "shimmer 1.4s infinite", animationDelay: `${i * 0.1}s` }} />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  if (streams.length === 0) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, textAlign: "center", color: "var(--text3)" }}>
        <WifiOff size={28} strokeWidth={1.2} style={{ margin: "0 auto 8px" }} />
        <div style={{ fontSize: "0.82rem" }}>No streams yet</div>
      </div>
    );
  }

  // Group streams by source name
  const groups: Record<string, Stream[]> = {};
  for (const s of streams) {
    const key = s.source || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  const groupEntries = Object.entries(groups);
  const globalIdx = (s: Stream) => streams.findIndex((x) => x.embedUrl === s.embedUrl);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 8px", fontSize: "0.68rem", fontWeight: 700, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
        {streams.length} Stream{streams.length !== 1 ? "s" : ""} Available
      </div>
      <div style={{ maxHeight: "clamp(320px,55vh,700px)", overflowY: "auto" }}>
        {groupEntries.map(([sourceName, sourceStreams]) => (
          <div key={sourceName}>
            {/* Source group header — only show if more than one source group */}
            {groupEntries.length > 1 && (
              <div style={{ padding: "8px 14px 4px", fontSize: "0.62rem", fontWeight: 700, color: "var(--text3)", letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--surface2)", borderBottom: "0.5px solid var(--border)" }}>
                {sourceName}
              </div>
            )}
            {sourceStreams.map((s) => {
              const i = globalIdx(s);
              const isActive = activeStream?.embedUrl === s.embedUrl;
              return (
                <button
                  key={i}
                  onClick={() => {
                    onSwitch(s);
                    // On TV, also open the stream directly in a new tab
                    if (isTV) window.open(s.embedUrl, "_blank");
                  }}
                  // TV d-pad moves focus but doesn't auto-scroll the container.
                  // scrollIntoView ensures the focused button is always visible.
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", behavior: "smooth" })}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 14px", border: "none", textAlign: "left",
                    background: isActive ? "rgba(230,57,70,0.08)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    borderBottom: "1px solid var(--border)",
                    color: isActive ? "var(--text)" : "var(--text2)",
                    cursor: "pointer", transition: "background 0.15s",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div className="stream-num-badge" style={{ width: 28, height: 28, borderRadius: 6, background: isActive ? "var(--accent)" : "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: isActive ? "#fff" : "var(--text3)", flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="stream-btn-label" style={{ fontSize: "0.82rem", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                      {groupEntries.length === 1 ? sourceName : `Stream ${s.streamNo}`}
                      {s.hd && <span style={{ fontSize: "0.58rem", background: "var(--gold)", color: "#000", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>HD</span>}
                    </div>
                    <div className="stream-btn-sub" style={{ fontSize: "0.7rem", color: "var(--text3)", marginTop: 1 }}>
                      {s.language && s.language !== "unknown" ? s.language : "English"}
                    </div>
                  </div>
                  {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, animation: "pulse 1.2s infinite" }} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
