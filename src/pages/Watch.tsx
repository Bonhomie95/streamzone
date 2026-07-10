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
  Play,
} from "lucide-react";
import {
  fetchStreams,
  fetchAllMatches,
  badgeUrl,
  getDaddyStreams,
} from "../api";
import MatchCard from "../components/MatchCard";
import ViewerBadge from "../components/ViewerBadge";
import AdBanner from "../components/AdBanner";
import type { EnrichedMatch, Stream } from "../types";

// Auto-retry delay when an iframe errors — tries the next stream after this many ms
const AUTO_RETRY_MS = 3_000;
// If an iframe never fires onload within this window, assume it's silently
// blocked (CSP/X-Frame-Options blocks don't trigger onError) and fall back
// to direct mode instead of leaving the user staring at a blank player.
const LOAD_WATCHDOG_MS = 5_000;

// ─── TV detection ──────────────────────────────────────────────────
// Smart TV browsers (Tizen, webOS, Fire TV's Silk/AFT, Android TV/Google TV,
// HbbTV, VIDAA, etc.) frequently apply stricter cross-origin iframe policies
// than mobile/desktop, which causes third-party embed pages to fail silently
// inside an <iframe> even with no explicit sandbox attribute set. Rather than
// fight those per-vendor quirks, we detect TV UAs and skip the iframe
// entirely — the stream opens as a normal top-level page instead.
function detectIsTV(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /TV|Tizen|SmartTV|SMART-TV|WebOS|Web0S|NetCast|HbbTV|VIDAA|BRAVIA|AFTT|AFTB|AFTN|AFTA|AFTS|AFTM|GoogleTV|CrKey|Roku|ADT-G3|Hisense|Philips TV|Panasonic TV/i.test(
    ua,
  );
}

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
  // react-router does NOT auto-decode dynamic segments (verified against
  // matchPath directly) — the id was encoded exactly once when the link
  // was built (see MatchCard/Home `encodeURIComponent(match.id)`), so it
  // must be decoded exactly once here to get back the raw match.id.
  const matchId = rawMatchId ? decodeURIComponent(rawMatchId) : rawMatchId;
  const navigate = useNavigate();

  const [match, setMatch] = useState<EnrichedMatch | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  // Countdown shown when auto-retrying after an iframe error (seconds remaining)
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  // "direct mode" = skip the iframe, show a Tap-to-Watch card that navigates
  // top-level instead. UA sniffing alone misses plenty of TVs (reduced/generic
  // UA strings on newer Tizen/webOS firmware), so this is seeded from UA
  // detection but can also be set by a load-watchdog (iframe blocked via CSP/
  // X-Frame-Options never fires onError, it just stays blank — only a missed
  // onload tells us) or by the user manually via the "Trouble loading?" link.
  // Once learned for this browser, it's remembered so we never show the
  // iframe error flicker again on a known-bad device.
  const DIRECT_MODE_KEY = "sz_direct_mode";
  const [isTV, setIsTV] = useState(() => {
    try {
      const stored = localStorage.getItem(DIRECT_MODE_KEY);
      // Previously, a single slow/flaky iframe load on any browser could
      // permanently stick that browser into direct mode. Self-heal it: a
      // stored "1" is only trustworthy if this is actually a TV user agent
      // or the user explicitly chose it manually — since we can't tell
      // those apart in storage, only honor "1" when the UA still looks like
      // a TV; otherwise treat it as a stale false positive.
      if (stored === "1") return detectIsTV();
      if (stored === "0") return false;
    } catch {
      /* noop */
    }
    return detectIsTV();
  });
  const iframeLoadedRef = useRef(false);
  const loadWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setDirectMode(on: boolean) {
    setIsTV(on);
    try {
      localStorage.setItem(DIRECT_MODE_KEY, on ? "1" : "0");
    } catch {
      /* noop */
    }
  }

  const [showStreamList, setShowStreamList] = useState(true);
  const [liveMatches, setLiveMatches] = useState<EnrichedMatch[]>([]);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // A direct iframe to a third-party embed is genuinely cross-origin — we
  // have no visibility into its content, so a stream that loads the page
  // fine but then fails internally (dead upstream CDN, backend 503, expired
  // token) is invisible to both `onError` (page loaded fine) and the load
  // watchdog (onload fired fine). The only honest fix is a fast, low-friction
  // manual escape hatch rather than pretending to auto-detect it.
  const [showSwitchHint, setShowSwitchHint] = useState(false);
  const switchHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      )
        return;

      if (streams.length === 0 || !activeStream) return;

      const idx = streams.findIndex(
        (s) => s.embedUrl === activeStream.embedUrl,
      );

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
    setShowSwitchHint(false);
    if (switchHintTimerRef.current) clearTimeout(switchHintTimerRef.current);
    iframeLoadedRef.current = false;
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
    const idx = currentStreams.findIndex(
      (s) => s.embedUrl === activeStream.embedUrl,
    );
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

  // ─── Load watchdog ─────────────────────────────────────────────────
  // Iframes blocked by CSP frame-ancestors or X-Frame-Options never fire
  // `onError` — they just render blank forever. The only signal we get is a
  // missing `onload`. If it doesn't fire within LOAD_WATCHDOG_MS, assume the
  // embed is blocked, switch to direct mode, and remember that for this
  // browser so we never sit on a blank iframe again.
  useEffect(() => {
    if (isTV || !activeStream) return; // already in direct mode, nothing to watch
    iframeLoadedRef.current = false;
    if (loadWatchdogRef.current) clearTimeout(loadWatchdogRef.current);
    loadWatchdogRef.current = setTimeout(() => {
      // Only auto-escalate to full-page direct mode for genuine TV user
      // agents. A missed onload on a normal desktop/mobile browser is far
      // more often a slow/flaky mirror than an actual CSP frame-ancestors
      // block, and setDirectMode() persists to localStorage — wrongly
      // sticking a regular browser into full-page mode for every future
      // match would be worse than the blank iframe it's meant to fix. The
      // "Nothing playing? Try another source" hint already covers this case
      // without taking away the iframe's own player controls.
      if (!iframeLoadedRef.current && detectIsTV()) setDirectMode(true);
    }, LOAD_WATCHDOG_MS);
    return () => {
      if (loadWatchdogRef.current) clearTimeout(loadWatchdogRef.current);
    };
  }, [activeStream, isTV]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Show "having trouble?" 8s after a stream is activated, regardless of
  // whether onload/onerror fired — those two signals can't detect a page
  // that loaded fine but is internally dead (see note above the state decl).
  useEffect(() => {
    setShowSwitchHint(false);
    if (switchHintTimerRef.current) clearTimeout(switchHintTimerRef.current);
    if (activeStream && !iframeError) {
      switchHintTimerRef.current = setTimeout(() => setShowSwitchHint(true), 8_000);
    }
    return () => {
      if (switchHintTimerRef.current) clearTimeout(switchHintTimerRef.current);
    };
  }, [activeStream, iframeError]);

  // ─── Dynamic page title + JSON-LD structured data ─────────────────
  useEffect(() => {
    if (!match) return;
    const teams =
      match.teams?.home && match.teams?.away
        ? `${match.teams.home.name} vs ${match.teams.away.name}`
        : match.title;
    const statusLabel =
      match.status === "live"
        ? " — LIVE"
        : match.status === "upcoming"
          ? " — Upcoming"
          : "";
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
      name: teams,
      description: `Watch ${teams} live on StreamZone`,
      startDate: new Date(match.date).toISOString(),
      eventStatus:
        match.status === "live"
          ? "https://schema.org/EventScheduled"
          : match.status === "finished"
            ? "https://schema.org/EventPostponed"
            : "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: {
        "@type": "VirtualLocation",
        url: `https://stream-zone.xyz/watch/${encodeURIComponent(match.id)}`,
      },
      organizer: {
        "@type": "Organization",
        name: "StreamZone",
        url: "https://stream-zone.xyz",
      },
      ...(match.teams?.home && match.teams?.away
        ? {
            homeTeam: { "@type": "SportsTeam", name: match.teams.home.name },
            awayTeam: { "@type": "SportsTeam", name: match.teams.away.name },
          }
        : {}),
    });

    return () => {
      document.title = "StreamZone — Live Sports & Movies";
      document.getElementById(id)?.remove();
    };
  }, [match]);

  // ─── Share button ─────────────────────────────────────────────────
  const [shareCopied, setShareCopied] = useState(false);

  async function handleShare() {
    const teams =
      match?.teams?.home && match?.teams?.away
        ? `${match.teams.home.name} vs ${match.teams.away.name}`
        : (match?.title ?? "Match");
    const url = window.location.href;
    const shareData = { title: `${teams} — StreamZone`, url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user dismissed */
      }
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
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "5px 12px",
              color: shareCopied ? "var(--green)" : "var(--text2)",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: "pointer",
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
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text3)",
                          textAlign: "center",
                          maxWidth: 260,
                        }}
                      >
                        Streams will be available once this match goes live
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={44} strokeWidth={1.2} />
                      <span style={{ fontSize: "0.9rem" }}>
                        No streams available
                      </span>
                      <span
                        style={{ fontSize: "0.75rem", color: "var(--text3)" }}
                      >
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
              ) : activeStream && isTV ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg2)",
                  }}
                >
                  <button
                    autoFocus
                    onClick={() => {
                      window.location.href = activeStream.embedUrl;
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Play size={28} fill="#fff" color="#fff" style={{ marginLeft: 3 }} />
                  </button>
                </div>
              ) : activeStream ? (
                <>
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
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
                    onLoad={() => {
                      iframeLoadedRef.current = true;
                      if (loadWatchdogRef.current)
                        clearTimeout(loadWatchdogRef.current);
                    }}
                    onError={handleIframeError}
                  />
                  {showSwitchHint && (() => {
                    const idx = streams.findIndex((s) => s.embedUrl === activeStream.embedUrl);
                    const next = streams[idx + 1] ?? streams[0];
                    return (
                      <button
                        onClick={() => next && switchStream(next)}
                        style={{
                          position: "absolute",
                          bottom: 12,
                          left: "50%",
                          transform: "translateX(-50%)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "rgba(20,20,24,0.92)",
                          border: "1px solid var(--border2)",
                          borderRadius: 20,
                          padding: "8px 16px",
                          color: "#fff",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          zIndex: 3,
                          cursor: "pointer",
                        }}
                      >
                        Nothing playing? Try another source
                      </button>
                    );
                  })()}
                </>
              ) : null}
            </div>

            {/* Manual escape hatch — covers TVs/devices that detection misses */}
            {activeStream && !isTV && (
              <button
                onClick={() => setDirectMode(true)}
                style={{
                  alignSelf: "center",
                  background: "none",
                  border: "none",
                  color: "var(--text3)",
                  fontSize: "0.72rem",
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                Player stuck or blank on a TV? Tap here to open the stream
                directly
              </button>
            )}

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
          style={{
            height: 34,
            width: 34,
            objectFit: "contain",
            borderRadius: 8,
          }}
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
}: {
  streams: Stream[];
  activeStream: Stream | null;
  onSwitch: (s: Stream) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--text3)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Stream Sources
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 46,
              borderRadius: 8,
              background: "var(--surface2)",
              marginBottom: 6,
              animation: "shimmer 1.4s infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  if (streams.length === 0) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 24,
          textAlign: "center",
          color: "var(--text3)",
        }}
      >
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
  const globalIdx = (s: Stream) =>
    streams.findIndex((x) => x.embedUrl === s.embedUrl);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px 8px",
          fontSize: "0.68rem",
          fontWeight: 700,
          color: "var(--text3)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {streams.length} Stream{streams.length !== 1 ? "s" : ""} Available
      </div>
      <div
        style={{
          maxHeight: "clamp(320px,55vh,700px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          scrollBehavior: "smooth",
          scrollPaddingBlock: 12,
          // TV browsers (Tizen/webOS) often hide/ignore default scrollbars and
          // don't translate remote arrow-key focus changes into container
          // scrolling on their own — keep the scrollbar visibly present so
          // there's a clear affordance, and rely on each button's onFocus
          // handler below to scrollIntoView as focus moves via the D-pad.
          scrollbarWidth: "thin",
        }}
      >
        {groupEntries.map(([sourceName, sourceStreams]) => (
          <div key={sourceName}>
            {/* Source group header — only show if more than one source group */}
            {groupEntries.length > 1 && (
              <div
                style={{
                  padding: "8px 14px 4px",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  color: "var(--text3)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: "var(--surface2)",
                  borderBottom: "0.5px solid var(--border)",
                }}
              >
                {sourceName}
              </div>
            )}
            {sourceStreams.map((s) => {
              const i = globalIdx(s);
              const isActive = activeStream?.embedUrl === s.embedUrl;
              return (
                <button
                  key={i}
                  onClick={() => onSwitch(s)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    border: "none",
                    textAlign: "left",
                    background: isActive
                      ? "rgba(230,57,70,0.08)"
                      : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    borderBottom: "1px solid var(--border)",
                    color: isActive ? "var(--text)" : "var(--text2)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--surface2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                  }}
                  onFocus={(e) => {
                    // D-pad/remote focus doesn't always trigger native scroll
                    // on TV browsers — force the focused stream into view.
                    (e.currentTarget as HTMLElement).scrollIntoView({
                      block: "nearest",
                      behavior: "smooth",
                    });
                  }}
                >
                  <div
                    className="stream-num-badge"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: isActive
                        ? "var(--accent)"
                        : "var(--surface2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: isActive ? "#fff" : "var(--text3)",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="stream-btn-label"
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {groupEntries.length === 1
                        ? sourceName
                        : `Stream ${s.streamNo}`}
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
                    </div>
                    <div
                      className="stream-btn-sub"
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text3)",
                        marginTop: 1,
                      }}
                    >
                      {s.language && s.language !== "unknown"
                        ? s.language
                        : "English"}
                    </div>
                  </div>
                  {isActive && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        flexShrink: 0,
                        animation: "pulse 1.2s infinite",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
