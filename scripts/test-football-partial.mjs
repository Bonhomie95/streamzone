#!/usr/bin/env node
/**
 * Self-check for the page-walk failure handling in api/_lib/footballLive.js.
 *
 * The bug this guards: a timeout partway through the page walk used to throw
 * out of getFootballLive, so a request that had already fetched 6 good pages
 * returned a 502 with nothing. Production hit this daily.
 *
 *   node scripts/test-football-partial.mjs
 *
 * Stubs global fetch — makes no network calls and needs no API key.
 */
import assert from "node:assert/strict";

process.env.RAPIDAPI_KEY = "test-key";

const { getFootballLive } = await import("../api/_lib/footballLive.js");

const hour = 3_600_000;

/**
 * Run one scenario.
 * failOn   – page number from which the matching walks throw instead of answering
 * statuses – which walks break ("vs" = upcoming, "live" = live)
 * hours    – unique per case: it is part of the cache key, so each scenario gets
 *            a fresh entry instead of reading the previous one's cached body.
 */
async function run({ failOn, statuses = ["vs"], hours }) {
  process.env.FOOTBALL_LIVE_UPCOMING_HOURS = String(hours);
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const n = Number(u.searchParams.get("page"));
    const status = u.searchParams.get("status");
    if (statuses.includes(status) && n >= failOn) {
      throw Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      });
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "1000" },
      text: async () =>
        JSON.stringify({
          matches: [{ match_time: Math.floor((Date.now() + hour) / 1000), id: `${status}-${n}` }],
          pagination: { hasNext: true },
        }),
    };
  };
  return getFootballLive({});
}

// 1. Timeout partway through the upcoming walk → keep the pages already fetched.
let r = await run({ failOn: 4, hours: 6 });
assert.equal(r.status, 200, `expected 200 with partial pages, got ${r.status}`);
assert.equal(r.body.pagination.upcoming, 3, "should keep the 3 upcoming pages fetched before the timeout");
assert.ok(r.body.pagination.live > 0, "live matches missing");
const partial = r.body.matches.length;
console.log(`ok   timeout on upcoming page 4 → 200, ${partial} matches kept (3 upcoming survived)`);

// 2. The whole upcoming walk fails → the live walk alone still answers.
r = await run({ failOn: 1, hours: 7 });
assert.equal(r.status, 200, `live-only schedule should still serve, got ${r.status}`);
assert.equal(r.body.pagination.upcoming, 0, "upcoming should be empty when its walk failed");
assert.ok(r.body.pagination.live > 0, "live-only schedule returned no live matches");
console.log(`ok   whole upcoming walk fails → 200 with ${r.body.pagination.live} live matches`);

// 3. Both walks fail from page 1 → nothing to serve, report the failure.
r = await run({ failOn: 1, statuses: ["vs", "live"], hours: 8 });
assert.equal(r.status, 502, `expected 502 when every walk fails, got ${r.status}`);
console.log("ok   both walks fail → 502");

// 4. No timeouts → full walk, more matches than the partial run.
r = await run({ failOn: Infinity, hours: 9 });
assert.equal(r.status, 200);
assert.ok(
  r.body.matches.length > partial,
  `full walk (${r.body.matches.length}) should beat partial (${partial})`,
);
console.log(`ok   no timeouts → 200 with ${r.body.matches.length} matches`);

console.log("\nall checks passed");
