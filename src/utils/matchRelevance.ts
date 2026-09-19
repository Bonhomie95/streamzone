import type { EnrichedMatch } from "../types";

// ─── Match relevance ──────────────────────────────────────────────
// The home page lists matches most-relevant first (top competitions, big
// clubs, curated "popular" events) instead of by kickoff time. Live matches
// get a boost and finished ones sink, so every tab still leads with what's
// worth watching now; ties fall back to time.

const norm = (s = "") => s.toLowerCase().replace(/\s+/g, " ").trim();

// 1xAPI league names are inconsistent — English, Vietnamese ("Giải bóng đá
// Serie A Italia"), or codes ("GER D1") — so each competition lists its known
// spellings. First match wins.
const FOOTBALL_TIERS: [RegExp, number][] = [
  // Elite
  [/^(english |england )?premier league$|^epl$|^eng d1$|ngoại hạng anh/, 100],
  [/^(uefa )?champions league$|uefa champions|^ucl$|cúp c1/, 100],
  [/^(fifa )?world cup$|^(uefa )?euro( 20\d\d)?$|european championship|copa am[eé]rica|africa cup of nations|^afcon|club world cup/, 100],
  [/^(spain |spanish )?la ?liga( ea sports)?$|^spa d1$|la liga tây ban nha/, 95],
  [/^(italy |italian )?serie a$|serie a italia|^ita d1$/, 90],
  [/^(germany |german )?(1\. )?bundesliga( 1)?$|^ger d1$|bundesliga đức/, 90],
  [/^(france |french )?ligue 1( france)?$|^fra d1$|ligue 1 pháp/, 85],
  // Major
  [/europa league|conference league|cúp c2|cúp c3/, 75],
  [/world cup qualif|euro qualif|nations league|friendl|giao hữu/, 65],
  [/^(english )?championship$|^eng d2$|^(english )?fa cup$|carabao|efl cup|^league cup$|community shield/, 65],
  [/copa del rey|coppa italia|dfb[- ]pokal|coupe de france/, 65],
  [/eredivisie|^hol d1$|primeira liga|liga portugal|^por d1$|saudi (pro|premier) league|roshn|^mls$|major league soccer/, 60],
  [/s[uü]per lig|^tur d1$|ngoại hạng thổ nhĩ kỳ|scottish premiership|ngoại hạng scotland|^sco d1$/, 55],
  [/brasileir|brazil(ian)? serie a|liga profesional|argentin|libertadores|sudamericana|liga mx/, 55],
  [/caf champions league|npfl|nigeria/, 50],
  // Notable
  [/bundesliga 2|2\. bundesliga|^ger d2$|serie b|segunda|ligue 2|hạng hai pháp|league one|hạng 3 anh|women super league|women'?s champions league/, 35],
  [/(belgi|austria|swiss|switzerland|denmark|danish|greece|greek|russia|ukrain|czech|poland).*(league|liga|d1)|^(bel|aut|sui|den|gre|rus|ukr|cze|pol) d1$|ekstraklasa|superliga|j1? league|k league/, 30],
];

// Youth, women's (outside the WSL/UWCL above), reserve, regional and
// lower-division competitions rank below everything else.
const MINOR_FOOTBALL =
  /u1[5-9]|u2[0-3]|youth|primavera|reserve|\(w\)|women|nữ|amateur|regional|city (football )?(super )?league|football league$|\bd[3-9][ab]?\b|division [3-9]|hạng (3|4|ba|tư)/;

const BIG_CLUBS =
  /real madrid|barcelona|manchester (united|city)|man (utd|united|city)|liverpool|arsenal|chelsea|tottenham|bayern|dortmund|paris (saint|sg)|\bpsg\b|juventus|inter milan|internazionale|^inter$|ac milan|^milan$|napoli|atl[eé]tico (de )?madrid|al[- ]nassr|al[- ]hilal|inter miami|newcastle|aston villa/;

// Headline events in other sports (streamed.pk titles).
const OTHER_SPORTS_TOP =
  /\bnba\b|\bnfl\b|super bowl|\bufc\b|formula 1|\bf1\b|motogp|grand prix|wimbledon|us open|roland garros|australian open|world series|stanley cup|champions league/;

export function footballLeagueTier(leagueName: string): number {
  const league = norm(leagueName);
  const hit = FOOTBALL_TIERS.find(([re]) => re.test(league));
  if (hit) return hit[1];
  return MINOR_FOOTBALL.test(league) ? 0 : 10;
}

export function hasBigClub(home = "", away = ""): boolean {
  return BIG_CLUBS.test(norm(home)) || BIG_CLUBS.test(norm(away));
}

export function relevanceScore(m: EnrichedMatch, now = Date.now()): number {
  let score: number;
  if (m.category === "football" && m.league) {
    const tier = footballLeagueTier(m.league.name);
    score = tier;
    // Only in real top-flight/cup context — avoids "Arsenal Tula" or
    // "Barcelona SC" getting the Arsenal/Barça bump.
    if (tier >= 30 && hasBigClub(m.teams?.home?.name, m.teams?.away?.name)) score += 35;
  } else {
    score = 10;
    if (m.popular) score += 45; // streamed.pk's own curation
    if (OTHER_SPORTS_TOP.test(norm(m.title))) score += 45;
  }

  if (m.status === "live") {
    score += 60;
  } else if (m.status === "upcoming") {
    // +20, rising to +35 as kickoff approaches (within ~6h)
    const hoursAway = Math.max(0, (m.date - now) / 3_600_000);
    score += 20 + Math.max(0, 15 - hoursAway * 2.5);
  } else {
    score -= 40;
  }
  return score;
}

// Most relevant first; equal scores → live/upcoming by kickoff (soonest
// first), finished by most recent.
export function sortByRelevance(matches: EnrichedMatch[]): EnrichedMatch[] {
  const now = Date.now();
  return matches
    .map((m) => ({ m, s: relevanceScore(m, now) }))
    .sort(
      (a, b) =>
        b.s - a.s ||
        (a.m.status === "finished" ? b.m.date - a.m.date : a.m.date - b.m.date),
    )
    .map(({ m }) => m);
}
