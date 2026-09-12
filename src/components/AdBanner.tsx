import { useEffect, useRef, useState } from "react";

type AdSize = "leaderboard" | "rectangle" | "mobile" | "native";

interface AdBannerProps {
  size?: AdSize;
  className?: string;
}

// Add ?ads=1 to a localhost URL to load the real ad scripts while testing.
const LOAD_REMOTE_ADS_ON_LOCALHOST =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("ads");

// ─── Ad configurations ────────────────────────────────────────────
// leaderboard → 728×90  (highperformanceformat.com)
// rectangle   → 300×250 (highperformanceformat.com)
// native      → effectivecpmnetwork native banner
const AD_CONFIG = {
  leaderboard: {
    key: "a13d8637793eb5e5aa36538259c6cf41",
    width: 728,
    height: 90,
  },
  rectangle: {
    key: "8195f9139671b98d2c53ffa6266ee6fc",
    width: 300,
    height: 250,
  },
  mobile: { key: "8195f9139671b98d2c53ffa6266ee6fc", width: 300, height: 250 },
} as const;

const NATIVE_SCRIPT_SRC =
  "https://pl30098044.effectivecpmnetwork.com/2516f1087def7e5df065eec5daac15b6/invoke.js";
const NATIVE_CONTAINER_ID = "container-2516f1087def7e5df065eec5daac15b6";

function isLocalhost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function effectiveSize(size: AdSize, windowWidth: number): AdSize {
  if (size === "leaderboard" && windowWidth < 730) return "rectangle";
  return size;
}

// ─── Standard iframe banner injection ────────────────────────────
// Each banner runs inside its own srcdoc iframe. The ad tag configures itself
// through a *global* `atOptions`, so injecting two banners into the same page
// (leaderboard + rectangle) made the second overwrite the first's config
// before its invoke.js ran. An iframe per banner gives each its own global.
//
// If the banner host fails to load (ad blockers, ISP/network blocks), the
// iframe reports back and the slot falls back to the native banner, which is
// served from a different ad domain.

function bannerDoc(cfg: { key: string; width: number; height: number }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;display:flex;justify-content:center}</style></head><body>
<script>atOptions = { 'key': '${cfg.key}', 'format': 'iframe', 'height': ${cfg.height}, 'width': ${cfg.width}, 'params': {} };</script>
<script src="https://www.highperformanceformat.com/${cfg.key}/invoke.js" onerror="parent.postMessage({ szAdFailed: '${cfg.key}' }, '*')"></script>
</body></html>`;
}

function BannerAd({
  cfg,
}: {
  cfg: { key: string; width: number; height: number };
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const [useNativeFallback, setUseNativeFallback] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      if ((e.data as { szAdFailed?: string } | null)?.szAdFailed !== cfg.key) return;
      // Only one native banner can exist per page (it targets a fixed id).
      setUseNativeFallback(!document.getElementById(NATIVE_CONTAINER_ID));
      setFailed(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cfg.key]);

  if (failed) {
    return useNativeFallback ? <NativeBannerAd /> : null;
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: cfg.width,
        minHeight: cfg.height,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <iframe
        ref={frameRef}
        title="Advertisement"
        srcDoc={bannerDoc(cfg)}
        width={cfg.width}
        height={cfg.height}
        scrolling="no"
        style={{ border: "none", display: "block", maxWidth: "100%" }}
      />
    </div>
  );
}

// ─── Native banner component ──────────────────────────────────────
function NativeBannerAd() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST) return;
    if (document.getElementById(NATIVE_CONTAINER_ID)) return;

    injected.current = true;

    const script = document.createElement("script");
    script.src = NATIVE_SCRIPT_SRC;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.body.appendChild(script);
  }, []);

  if (isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: 120,
          background:
            "repeating-linear-gradient(45deg, var(--surface) 0px, var(--surface) 10px, var(--surface2) 10px, var(--surface2) 20px)",
          border: "1px dashed var(--border2)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.68rem",
            color: "var(--text3)",
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          LOCAL AD SLOT · NATIVE
        </span>
      </div>
    );
  }

  return <div id={NATIVE_CONTAINER_ID} style={{ width: "100%" }} />;
}

// ─── Main export ─────────────────────────────────────────────────
export default function AdBanner({
  size = "leaderboard",
  className,
}: AdBannerProps) {
  const resolved = effectiveSize(size, window.innerWidth);

  if (resolved === "native") {
    return <NativeBannerAd />;
  }

  const cfg = AD_CONFIG[resolved as keyof typeof AD_CONFIG];
  const showLocalPlaceholder = isLocalhost() && !LOAD_REMOTE_ADS_ON_LOCALHOST;

  if (showLocalPlaceholder) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          maxWidth: cfg.width,
          minHeight: cfg.height,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background:
            "repeating-linear-gradient(45deg, var(--surface) 0px, var(--surface) 10px, var(--surface2) 10px, var(--surface2) 20px)",
          border: "1px dashed var(--border2)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <span
          style={{
            fontSize: "0.68rem",
            color: "var(--text3)",
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          LOCAL AD SLOT · {cfg.width}×{cfg.height}
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      <BannerAd cfg={cfg} />
    </div>
  );
}
