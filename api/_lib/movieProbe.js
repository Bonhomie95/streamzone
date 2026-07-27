const PLAYER_MARKERS =
  /<video|<iframe|jwplayer|clappr|hls\.js|videojs|plyr|fluidplayer|playerjs|m3u8|dash\.js|sources?\s*[:=]/i;
const BLOCK_PAGE_MARKERS =
  /cf-browser-verification|checking your browser|just a moment|attention required|access denied|error\s*404|error\s*403|movie not found|video not found|no sources found|server error/i;

export async function probeMovieEmbed(url, timeoutMs = 8_000) {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("bad protocol");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: `${target.protocol}//${target.hostname}/`,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    const body = contentType.includes("text") || contentType.includes("html")
      ? await upstream.text()
      : "";
    const bodySample = body.slice(0, 120_000);
    const hasPlayerMarkers = PLAYER_MARKERS.test(bodySample);
    const hasAppShell = /<script\b/i.test(bodySample) && body.length > 2_000;
    const hasBlockMarkers = BLOCK_PAGE_MARKERS.test(bodySample);
    const ok =
      upstream.ok &&
      (hasPlayerMarkers || hasAppShell) &&
      !(hasBlockMarkers && !hasAppShell);

    return {
      ok,
      status: upstream.status,
      bytes: body.length,
      hasPlayerMarkers,
      hasAppShell,
      hasBlockMarkers,
    };
  } finally {
    clearTimeout(timeout);
  }
}
