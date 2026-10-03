#!/usr/bin/env node
/**
 * Probe every movie embed source in src/api.ts and report which are alive.
 *
 * Embed hosts die, get parked or change domain every few months, which is how
 * the movie section silently stopped playing. Run this when playback breaks:
 *
 *   node scripts/test-movie-sources.mjs            # Superman (2025)
 *   node scripts/test-movie-sources.mjs 1399 1 1   # a TV episode
 *
 * DEAD = the domain no longer resolves anywhere → delete it from the list.
 * bad  = resolves but returned no player → may be a format change or an
 *        outage; check it in a browser before removing.
 * Hosts your own network blocks show as ERR, not DEAD — the probe runs from
 * Vercel in production, so re-check those there before deleting them.
 */
import { promises as dns } from "node:dns";
import { readFile } from "node:fs/promises";
import { probeMovieEmbed } from "../api/_lib/movieProbe.js";

const [id = "1061474", season, episode] = process.argv.slice(2);
const isTV = season !== undefined && episode !== undefined;

// Pull the URL templates straight out of api.ts so the two can't drift.
const src = await readFile(new URL("../src/api.ts", import.meta.url), "utf8");
const block = src.slice(
  src.indexOf("export function getEmbedSources("),
  src.indexOf("return sources.map((s, i) => ({"),
);
const sources = [...block.matchAll(/name: "([^"]+)",\s*url: isTV\s*\?\s*`([^`]+)`\s*:\s*`([^`]+)`/g)]
  .map(([, name, tv, movie]) => ({
    name,
    url: (isTV ? tv : movie)
      .replaceAll("${tmdbId}", id)
      .replaceAll("${season}", season ?? "")
      .replaceAll("${episode}", episode ?? ""),
  }));

if (!sources.length) {
  console.error("No sources parsed — did getEmbedSources change shape?");
  process.exit(1);
}

console.log(`Probing ${sources.length} sources for ${isTV ? `tv ${id} s${season}e${episode}` : `movie ${id}`}\n`);

const rows = await Promise.all(
  sources.map(async (s) => {
    const host = new URL(s.url).hostname;
    try {
      await dns.resolve4(host);
    } catch {
      return { ...s, verdict: "DEAD", detail: "domain does not resolve" };
    }
    try {
      const r = await probeMovieEmbed(s.url, 15_000);
      return {
        ...s,
        verdict: r.ok ? "OK" : "bad",
        detail: `${r.status} ${r.bytes}b player=${r.hasPlayerMarkers} blocked=${r.hasBlockMarkers}`,
      };
    } catch (e) {
      return { ...s, verdict: "ERR", detail: e.message.slice(0, 60) };
    }
  }),
);

for (const r of rows) {
  console.log(`${r.verdict.padEnd(5)} ${r.name.padEnd(12)} ${r.detail.padEnd(46)} ${r.url}`);
}

const alive = rows.filter((r) => r.verdict === "OK").length;
console.log(`\n${alive}/${rows.length} alive from this machine.`);
if (!alive) process.exitCode = 1;
