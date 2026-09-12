import { useEffect, useRef, useState } from "react";
import { Settings, VolumeX } from "lucide-react";
import { streamProxyUrl } from "../api";
import type { Stream } from "../types";

// Native <video> player for raw media streams (1xAPI servers): HLS via
// hls.js (or native HLS on Safari), DASH + ClearKey via shaka-player, and
// FLV via mpegts.js. Libraries are loaded on demand so the home page bundle
// doesn't pay for them.
//
// Each stream is tried directly first, then through /api/stream-proxy
// (needed when the CDN has no CORS headers). Streams that need a Referer
// (stream.proxy) go straight to the relay. If every attempt fails,
// onFatalError lets the Watch page auto-advance to the next server.

const START_TIMEOUT_MS = 12_000;

type Cleanup = () => void;
type Starter = (
  video: HTMLVideoElement,
  stream: Stream,
  useProxy: boolean,
  // hostUnreachable = network-level failure (DNS/SSL/refused, relay 502/504)
  // rather than the host answering with an error for this particular stream.
  onFail: (reason: string, hostUnreachable?: boolean) => void,
  // Reports selectable renditions (HLS levels / DASH variants) and a setter;
  // id -1 = automatic (adaptive bitrate).
  onQuality: (levels: QualityLevel[], select: (id: number) => void) => void,
) => Promise<Cleanup>;

export interface QualityLevel {
  id: number;
  label: string;
  height: number;
  bitrate: number;
}

function levelLabel(height: number, bitrate: number) {
  return height ? `${height}p` : `${Math.round(bitrate / 1000)} kbps`;
}

const startHls: Starter = async (video, stream, useProxy, onFail, onQuality) => {
  const src = useProxy
    ? streamProxyUrl(stream.embedUrl, stream.headers)
    : stream.embedUrl;
  const { default: Hls } = await import("hls.js");

  if (Hls.isSupported()) {
    // Fail fast on the manifest: hls.js's default retries/backoff can spend
    // ~30s on a host that's simply blocked before reporting a fatal error.
    const manifestPolicy = {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 15_000,
        timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1_000 },
      },
    };
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      manifestLoadPolicy: manifestPolicy,
      playlistLoadPolicy: manifestPolicy,
    });
    let recovered = false;
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
        recovered = true;
        hls.recoverMediaError();
        return;
      }
      const code = (data.response as { code?: number } | undefined)?.code ?? 0;
      onFail(
        `hls ${data.details}${code ? ` (${code})` : ""}`,
        data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          (code <= 0 || code === 502 || code === 504),
      );
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      onQuality(
        hls.levels.map((l, id) => ({
          id,
          height: l.height || 0,
          bitrate: l.bitrate || 0,
          label: levelLabel(l.height || 0, l.bitrate || 0),
        })),
        (id) => {
          hls.currentLevel = id; // -1 = auto
        },
      );
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => hls.destroy();
  }

  // Safari / iOS without MSE: native HLS. Relayed playlists are rewritten
  // server-side, so relative segment URLs still work here.
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    const onError = () =>
      onFail("native hls error", video.error?.code === MediaError.MEDIA_ERR_NETWORK);
    video.addEventListener("error", onError);
    video.src = src;
    return () => {
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
    };
  }
  throw new Error("HLS not supported in this browser");
};

const startDash: Starter = async (video, stream, useProxy, onFail, onQuality) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("shaka-player/dist/shaka-player.compiled.js");
  const shaka = mod.default ?? mod;
  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) throw new Error("DASH not supported in this browser");

  const player = new shaka.Player();
  await player.attach(video);

  const license = stream.drm?.license ?? "";
  if (/^https?:\/\//i.test(license)) {
    player.configure({ drm: { servers: { "org.w3.clearkey": license } } });
  } else if (license) {
    // "kid:key" pairs (hex or base64), comma/semicolon separated
    const clearKeys: Record<string, string> = {};
    for (const pair of license.split(/[,;]/)) {
      const [kid, key] = pair.split(":").map((s) => s.trim());
      if (kid && key) clearKeys[kid] = key;
    }
    player.configure({ drm: { clearKeys } });
  }

  if (useProxy) {
    // Route manifest + segment requests through the relay, but report the
    // original URL back to shaka so relative segment paths still resolve.
    const originals = new Map<string, string>();
    const net = player.getNetworkingEngine();
    const LICENSE = shaka.net.NetworkingEngine.RequestType.LICENSE;
    net.registerRequestFilter((type: number, request: { uris: string[] }) => {
      if (type === LICENSE) return;
      request.uris = request.uris.map((u) => {
        if (u.includes("/api/stream-proxy?")) return u;
        const proxied = streamProxyUrl(u, stream.headers);
        originals.set(proxied, u);
        return proxied;
      });
    });
    net.registerResponseFilter(
      (type: number, response: { uri: string; originalUri: string }) => {
        if (type === LICENSE) return;
        const orig = originals.get(response.originalUri) ?? originals.get(response.uri);
        if (orig) {
          response.uri = orig;
          response.originalUri = orig;
        }
      },
    );
  }

  // shaka error 1002 = HTTP_ERROR (no response), 1001 = BAD_HTTP_STATUS (data[1] = status)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unreachable = (err: any) =>
    err?.code === 1002 || (err?.code === 1001 && [502, 504].includes(err?.data?.[1]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  player.addEventListener("error", (e: any) =>
    onFail(`dash ${e?.detail?.code ?? ""}`, unreachable(e?.detail)),
  );
  const publishTracks = () => {
    type Track = { id: number; height?: number; bandwidth: number };
    const byRendition = new Map<string, Track>();
    for (const t of player.getVariantTracks() as Track[]) {
      const k = `${t.height ?? 0}:${t.bandwidth}`;
      if (!byRendition.has(k)) byRendition.set(k, t);
    }
    onQuality(
      [...byRendition.values()].map((t) => ({
        id: t.id,
        height: t.height ?? 0,
        bitrate: t.bandwidth,
        label: levelLabel(t.height ?? 0, t.bandwidth),
      })),
      (id) => {
        if (id === -1) {
          player.configure({ abr: { enabled: true } });
          return;
        }
        const track = (player.getVariantTracks() as Track[]).find((t) => t.id === id);
        if (!track) return;
        player.configure({ abr: { enabled: false } });
        player.selectVariantTrack(track, true);
      },
    );
  };
  player
    .load(stream.embedUrl)
    .then(publishTracks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .catch((e: any) => onFail(`dash load ${e?.code ?? ""}`, unreachable(e)));
  return () => {
    void player.destroy();
  };
};

const startFlv: Starter = async (video, stream, useProxy, onFail) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("mpegts.js");
  const mpegts = mod.default ?? mod;
  if (!mpegts.isSupported()) throw new Error("FLV not supported in this browser");

  const src = useProxy
    ? streamProxyUrl(stream.embedUrl, stream.headers)
    : stream.embedUrl;
  const player = mpegts.createPlayer(
    { type: "flv", isLive: true, url: src },
    { enableWorker: true, liveBufferLatencyChasing: true },
  );
  player.on(
    mpegts.Events.ERROR,
    (type: string, _detail: string, info?: { code?: number }) => {
      const code = info?.code ?? 0;
      onFail(
        `flv ${type}${code ? ` (${code})` : ""}`,
        type === mpegts.ErrorTypes.NETWORK_ERROR && (code <= 0 || code === 502 || code === 504),
      );
    },
  );
  player.attachMediaElement(video);
  player.load();
  return () => {
    try {
      player.pause();
      player.unload();
      player.detachMediaElement();
      player.destroy();
    } catch {
      /* noop */
    }
  };
};

export default function LivePlayer({
  stream,
  onFatalError,
  hold = false,
}: {
  stream: Stream;
  onFatalError: (info: { hostUnreachable: boolean }) => void;
  // true = keep the video paused (e.g. while the player ad gate is showing)
  hold?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"loading" | "relay" | "playing">("loading");
  const [muted, setMuted] = useState(false);
  const onFatalRef = useRef(onFatalError);
  const holdRef = useRef(hold);
  const [selectLevel, setSelectLevel] = useState<((id: number) => void) | null>(null);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQuality, setShowQuality] = useState(false);

  // Hold/release playback without restarting the stream.
  useEffect(() => {
    holdRef.current = hold;
    const video = videoRef.current;
    if (!video) return;
    if (hold) {
      video.pause();
    } else if (video.paused) {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, [hold]);

  useEffect(() => {
    onFatalRef.current = onFatalError;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const starter =
      stream.kind === "dash" ? startDash : stream.kind === "flv" ? startFlv : startHls;
    const attempts = stream.proxy ? [true] : [false, true];
    let cancelled = false;
    let cleanup: Cleanup | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attemptId = 0;
    // Stays true only if every attempt (direct + relay) failed at network level.
    let unreachableSoFar = true;

    const onPlaying = () => {
      if (cancelled) return;
      clearTimeout(timer);
      setPhase("playing");
    };
    const onVolume = () => setMuted(video.muted);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("volumechange", onVolume);

    const tryPlay = () => {
      video.play().catch((e: unknown) => {
        // Autoplay with sound is blocked until the user interacts — start
        // muted and show an unmute button instead of a frozen first frame.
        if ((e as { name?: string })?.name === "NotAllowedError") {
          video.muted = true;
          video.play().catch(() => {});
        }
      });
    };

    const run = async (i: number) => {
      const id = ++attemptId;
      clearTimeout(timer);
      cleanup?.();
      cleanup = null;
      if (cancelled) return;
      if (i >= attempts.length) {
        onFatalRef.current({ hostUnreachable: unreachableSoFar });
        return;
      }
      setPhase(attempts[i] && i > 0 ? "relay" : "loading");
      setLevels([]);
      setCurrentLevel(-1);
      setSelectLevel(null);

      const fail = (reason: string, hostUnreachable = false) => {
        if (cancelled || id !== attemptId) return;
        if (!hostUnreachable) unreachableSoFar = false;
        console.warn(
          `[player] ${stream.label ?? stream.source} ${attempts[i] ? "via relay" : "direct"} failed: ${reason}`,
        );
        void run(i + 1);
      };
      timer = setTimeout(() => {
        // While held behind the ad gate the video may legitimately not buffer.
        if (video.readyState < 3 && !holdRef.current) fail("start timeout");
      }, START_TIMEOUT_MS);

      try {
        const c = await starter(video, stream, attempts[i], fail, (lv, select) => {
          if (cancelled || id !== attemptId) return;
          setSelectLevel(() => select);
          setLevels(lv);
        });
        if (cancelled || id !== attemptId) {
          c();
          return;
        }
        cleanup = c;
        if (!holdRef.current) tryPlay();
      } catch (e) {
        fail(e instanceof Error ? e.message : "start failed");
      }
    };

    void run(0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("volumechange", onVolume);
      cleanup?.();
    };
  }, [stream]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay={!hold}
        style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
      />
      {levels.length > 1 && (() => {
        // Highest first; disambiguate renditions that share a resolution.
        const sorted = [...levels].sort(
          (a, b) => b.height - a.height || b.bitrate - a.bitrate,
        );
        const counts = new Map<string, number>();
        for (const l of sorted) counts.set(l.label, (counts.get(l.label) ?? 0) + 1);
        const options = [
          { id: -1, label: "Auto", bitrate: 0 },
          ...sorted.map((l) => ({
            id: l.id,
            bitrate: l.bitrate,
            label:
              (counts.get(l.label) ?? 0) > 1
                ? `${l.label} · ${Math.round(l.bitrate / 1000)}k`
                : l.label,
          })),
        ];
        const current = options.find((o) => o.id === currentLevel) ?? options[0];
        return (
          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 4 }}>
            <button
              type="button"
              onClick={() => setShowQuality((v) => !v)}
              title="Video quality"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(20,20,24,0.85)",
                border: "1px solid var(--border2)",
                borderRadius: 20,
                padding: "6px 12px",
                color: "#fff",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Settings size={13} />
              {current.label}
            </button>
            {showQuality && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 150,
                  background: "rgba(20,20,24,0.97)",
                  border: "1px solid var(--border2)",
                  borderRadius: 10,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      selectLevel?.(o.id);
                      setCurrentLevel(o.id);
                      setShowQuality(false);
                    }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      textAlign: "left",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: o.id === currentLevel ? "var(--accent)" : "transparent",
                      color: "#fff",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span>{o.label}</span>
                    {o.bitrate > 0 && (
                      <span style={{ opacity: 0.6, fontWeight: 500 }}>
                        {(o.bitrate / 1_000_000).toFixed(1)} Mbps
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {phase !== "playing" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            color: "var(--text2)",
            pointerEvents: "none",
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
            {phase === "relay" ? "Retrying through relay…" : "Connecting to stream…"}
          </span>
        </div>
      )}
      {muted && phase === "playing" && (
        <button
          onClick={() => {
            if (videoRef.current) videoRef.current.muted = false;
          }}
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(20,20,24,0.92)",
            border: "1px solid var(--border2)",
            borderRadius: 20,
            padding: "7px 14px",
            color: "#fff",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          <VolumeX size={14} />
          Tap to unmute
        </button>
      )}
    </div>
  );
}
