// Quick free-tier check for the RapidAPI "Football Live Streaming API" (1xAPI).
// Uses 1 API request (2 with --leagues). Free plan = 50 requests/day.
//
//   node scripts/test-football-api.mjs            # live matches
//   node scripts/test-football-api.mjs --all      # all matches, page 1
//   node scripts/test-football-api.mjs --leagues  # also list leagues
//
// Reads RAPIDAPI_KEY from .env. Saves the raw response to
// scripts/football-api-sample.json and probes each stream URL to see whether
// a browser could play it (HLS manifest reachable + CORS allowed).
import "dotenv/config";
import { writeFileSync } from "node:fs";

const HOST = "football-live-streaming-api.p.rapidapi.com";
const KEY = process.env.RAPIDAPI_KEY;
if (!KEY) {
  console.error("RAPIDAPI_KEY missing from .env");
  process.exit(1);
}

const args = process.argv.slice(2);

async function call(path) {
  const res = await fetch(`https://${HOST}/${path}`, {
    headers: { "x-rapidapi-key": KEY, "x-rapidapi-host": HOST },
  });
  const quota = res.headers.get("x-ratelimit-requests-remaining");
  const body = await res.text();
  console.log(`GET /${path} → ${res.status} (quota left today: ${quota ?? "?"})`);
  if (!res.ok) {
    console.log(body.slice(0, 500));
    process.exit(1);
  }
  return JSON.parse(body);
}

async function probe(server) {
  const [url] = server.url.split("|"); // drm urls carry license info after |
  try {
    const res = await fetch(url, {
      headers: {
        ...(server.header ?? {}),
        Origin: "https://example.com", // simulate a browser on another site
      },
      signal: AbortSignal.timeout(8000),
    });
    const text = (await res.text()).slice(0, 200);
    const cors = res.headers.get("access-control-allow-origin");
    const isHls = text.startsWith("#EXTM3U");
    return `${res.status} ${isHls ? "HLS-ok" : "not-HLS"} cors=${cors ?? "none"}`;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

const data = await call(args.includes("--all") ? "matches" : "matches?status=live");
writeFileSync(
  new URL("./football-api-sample.json", import.meta.url),
  JSON.stringify(data, null, 2),
);

const matches = data.matches ?? [];
console.log(`\n${matches.length} matches (total ${data.pagination?.total ?? "?"})\n`);

const typeCounts = {};
for (const m of matches.slice(0, 5)) {
  console.log(
    `● [${m.match_status}] ${m.home_team_name} ${m.homeTeamScore ?? ""}-${m.awayTeamScore ?? ""} ${m.away_team_name}  (${m.league_name})`,
  );
  for (const s of m.servers ?? []) {
    typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;
    console.log(`   - ${s.name} [${s.type}] ${await probe(s)}`);
  }
}
for (const m of matches.slice(5)) {
  for (const s of m.servers ?? []) typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;
}
console.log("\nStream types across page:", typeCounts);

if (args.includes("--leagues")) {
  const leagues = await call("leagues");
  console.log(JSON.stringify(leagues, null, 2).slice(0, 1500));
}
