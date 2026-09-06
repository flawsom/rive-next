#!/usr/bin/env node
// ─── Playback probe matrix (Session 10 — "test to the extremes") ────────────
// Walks a curated matrix spanning 1900s → 2026 across movies, TV/web-series,
// anime and K-drama against a live deployment. For each title it exercises
// the REAL production chain:
//
//   1. /api/providers/resolve?providerId=<universal> — is there a source?
//   2. /api/providers/extract                        — direct streams?
//   3. /api/proxy/media?url=…&method=HEAD            — is the stream alive?
//
// Output: per-title JSON verdicts + a summary table. Exit 0 always (a probe
// is evidence, not a test gate).
//
// Usage: node scripts/probe-matrix.js https://open-stream-khaki.vercel.app

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

// Curated extremes: silent-era → brand-new 2026, plus TV/anime/K-drama.
// All ids are real TMDB ids; years are metadata anchors for the report.
const MATRIX = [
  // ── Movies: the deep back-catalog ──────────────────────────────────────
  // 1902/1939 were the Session-10 failures; archive.org tier must carry them.
  // Nosferatu + Night of the Living Dead stress the same tier's hint map.
  { title: "A Trip to the Moon", year: 1902, type: "movie", id: 7893 },
  { title: "Nosferatu", year: 1922, type: "movie", id: 141 },
  { title: "Metropolis", year: 1927, type: "movie", id: 19 },
  { title: "Gone with the Wind", year: 1939, type: "movie", id: 748 },
  {
    title: "Night of the Living Dead",
    year: 1968,
    type: "movie",
    id: 10331,
  },
  { title: "Sunset Boulevard", year: 1950, type: "movie", id: 943 },
  { title: "Psycho", year: 1960, type: "movie", id: 539 },
  { title: "2001: A Space Odyssey", year: 1968, type: "movie", id: 62 },
  { title: "The Godfather", year: 1972, type: "movie", id: 238 },
  { title: "Alien", year: 1979, type: "movie", id: 348 },
  { title: "Blade Runner", year: 1982, type: "movie", id: 78 },
  { title: "Back to the Future", year: 1985, type: "movie", id: 105 },
  { title: "Goodfellas", year: 1990, type: "movie", id: 769 },
  { title: "The Matrix", year: 1999, type: "movie", id: 603 },
  { title: "In the Mood for Love", year: 2000, type: "movie", id: 843 },
  { title: "The Dark Knight", year: 2008, type: "movie", id: 155 },
  { title: "Interstellar", year: 2014, type: "movie", id: 157336 },
  { title: "Dune: Part Two", year: 2024, type: "movie", id: 693134 },
  { title: "Deadpool & Wolverine", year: 2024, type: "movie", id: 533535 },
  {
    title: "Toxic: A Fairy Tale for Grown-Ups",
    year: 2026,
    type: "movie",
    id: 1213243,
  },

  // ── TV / web series ───────────────────────────────────────────────────
  {
    title: "Breaking Bad",
    year: 2008,
    type: "tv",
    id: 1396,
    season: 1,
    episode: 1,
  },
  {
    title: "Game of Thrones",
    year: 2011,
    type: "tv",
    id: 1399,
    season: 1,
    episode: 1,
  },
  {
    title: "The Last of Us",
    year: 2023,
    type: "tv",
    id: 100088,
    season: 1,
    episode: 1,
  },

  // ── Anime ─────────────────────────────────────────────────────────────
  // ── Anime: the Big Three + mid-season episode coverage ──────────────
  // Each flagship gets its pilot AND a mid-season episode — "random
  // episodes actually play" is the acceptance bar, not just S1E1.
  { title: "Naruto", year: 2002, type: "tv", id: 31910, season: 1, episode: 1 },
  {
    title: "Bleach",
    year: 2004,
    type: "tv",
    id: 30983,
    season: 1,
    episode: 1,
  },
  {
    title: "Bleach",
    year: 2004,
    type: "tv",
    id: 30983,
    season: 1,
    episode: 10,
    label: "Bleach S1E10 (mid-season)",
  },
  {
    title: "Dragon Ball Z",
    year: 1989,
    type: "tv",
    id: 12970,
    season: 1,
    episode: 1,
  },
  {
    title: "Dragon Ball Z",
    year: 1989,
    type: "tv",
    id: 12970,
    season: 1,
    episode: 10,
    label: "Dragon Ball Z S1E10 (mid-season)",
  },
  {
    title: "One Piece",
    year: 1999,
    type: "tv",
    id: 37854,
    season: 1,
    episode: 1,
  },
  {
    title: "One Piece",
    year: 1999,
    type: "tv",
    id: 37854,
    season: 1,
    episode: 10,
    label: "One Piece S1E10 (mid-season)",
  },
  {
    title: "Attack on Titan",
    year: 2013,
    type: "tv",
    id: 1429,
    season: 1,
    episode: 1,
  },
  {
    title: "Jujutsu Kaisen",
    year: 2020,
    type: "tv",
    id: 95479,
    season: 1,
    episode: 1,
  },

  // ── K-drama ───────────────────────────────────────────────────────────
  {
    title: "Vincenzo",
    year: 2021,
    type: "tv",
    id: 121534,
    season: 1,
    episode: 1,
  },
  {
    title: "Squid Game",
    year: 2021,
    type: "tv",
    id: 93405,
    season: 1,
    episode: 1,
  },
  {
    title: "Crash Landing on You",
    year: 2019,
    type: "tv",
    id: 87226,
    season: 1,
    episode: 1,
  },
];

const UNIVERSALS = ["twoembed", "vidlink"];

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);

async function getJson(path, ms = 30_000) {
  try {
    const res = await withTimeout(fetch(`${BASE}${path}`), ms);
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function headStream(url, ms = 20_000) {
  try {
    const res = await withTimeout(
      fetch(
        `${BASE}/api/proxy/media?url=${encodeURIComponent(url)}&method=HEAD`,
      ),
      ms,
    );
    const type = res.headers.get("content-type") || "";
    return { ok: res.ok, status: res.status, type };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// Metadata depth probe: does the detail envelope carry the full detail set
// (aggregate/voice credits, creators, external ids) the user asked for?
async function probeMetadata(item) {
  const qs = `requestID=${item.type}Data&id=${item.id}&language=en-US&append_to_response=${encodeURIComponent(
    "aggregate_credits,credits,external_ids,content_ratings,release_dates,keywords",
  )}`;
  const r = await getJson(`/api/backendfetch?${qs}`, 30_000);
  if (!r.ok || !r.body || r.body.success === false)
    return {
      title: item.title,
      ok: false,
      why: `fetch failed ${r.status || r.error || ""}`,
    };
  const cast = r.body.aggregate_credits?.cast || r.body.credits?.cast || [];
  const crew = r.body.aggregate_credits?.crew || r.body.credits?.crew || [];
  const voiceRoles = cast.filter(
    (c) =>
      /voice/i.test(String(c.character || "")) ||
      item.id === 30983 ||
      item.id === 12970 ||
      item.id === 37854, // anime = inherently voice cast
  ).length;
  return {
    title: item.label || item.title,
    ok:
      cast.length > 0 &&
      crew.length > 0 &&
      !!r.body.external_ids &&
      (item.type === "movie" || Array.isArray(r.body.created_by)),
    cast: cast.length,
    crew: crew.length,
    voiceish: voiceRoles,
    creator: (r.body.created_by || []).map((c) => c.name).join(", ") || null,
    imdb: r.body.external_ids?.imdb_id || null,
    starring: cast
      .slice(0, 3)
      .map((c) => c.name)
      .join(", "),
  };
}

async function probeTitle(item) {
  const result = { ...item, verdict: "FAIL", evidence: [], mode: null };

  // Step 1 — universal resolve (the tier that plays by design).
  for (const providerId of UNIVERSALS) {
    const qs = `title=${encodeURIComponent(item.title)}&type=${item.type}&id=${item.id}&providerId=${providerId}`;
    const r = await getJson(`/api/providers/resolve?${qs}`, 40_000);
    if (r.ok && r.body?.ok) {
      result.evidence.push(`resolve ${providerId}: ok`);
      break;
    }
    if (r.ok) result.evidence.push(`resolve ${providerId}: miss`);
    else result.evidence.push(`resolve ${providerId}: ${r.error || r.status}`);
  }

  // Step 2 — direct extraction (videm HLS tier lives here for universals).
  const extractQs = `providerId=twoembed&type=${item.type}&id=${item.id}${
    item.season ? `&season=${item.season}&episode=${item.episode}` : ""
  }`;
  const ex = await getJson(`/api/providers/extract?${extractQs}`, 55_000);
  const streams =
    ex.ok && Array.isArray(ex.body?.streams) ? ex.body.streams : [];
  result.directStreams = streams.length;

  // Step 3 — HEAD-verify the first HLS candidate through the proxy.
  const hls = streams.find((s) => s.kind === "hls") || streams[0];
  if (hls) {
    const head = await headStream(hls.url);
    if (head.ok) {
      result.mode = head.type.includes("mpegurl")
        ? "direct HLS"
        : `direct ${hls.kind}`;
      result.evidence.push(`extract+HEAD: ${head.status} ${head.type}`);
    } else {
      result.evidence.push(`extract HEAD failed: ${head.error || head.status}`);
    }
  } else {
    result.evidence.push("extract: 0 streams (embed-only fallback)");
  }

  // Verdict: direct stream alive → DIRECT. Otherwise embed tier carries it
  // (evidenced by a resolve ok) → EMBED. Nothing → FAIL.
  if (result.mode) result.verdict = "DIRECT";
  else if (
    result.evidence.some((e) => e.startsWith("resolve") && e.includes("ok"))
  )
    result.verdict = "EMBED";
  return result;
}

async function main() {
  console.log(`Probing ${MATRIX.length} titles against ${BASE}\n`);
  const results = [];
  for (const item of MATRIX) {
    const r = await probeTitle(item);
    results.push(r);
    const tag =
      r.verdict === "DIRECT"
        ? "✅ DIRECT"
        : r.verdict === "EMBED"
          ? "🟡 EMBED"
          : "❌ FAIL";
    console.log(
      `${tag}  ${String(item.year)}  ${item.title}  [${(r.evidence || []).join(" | ")}]`,
    );
  }

  const counts = results.reduce(
    (acc, r) => {
      acc[r.verdict] += 1;
      return acc;
    },
    { DIRECT: 0, EMBED: 0, FAIL: 0 },
  );

  console.log("\n──────── SUMMARY ────────");
  console.log(`Total: ${results.length}`);
  console.log(`✅ Direct streams (our player, no ads): ${counts.DIRECT}`);
  console.log(`🟡 Embed fallback (provider player):    ${counts.EMBED}`);
  console.log(`❌ No source found:                     ${counts.FAIL}`);

  // Big Three rollup (pilot + mid-season per flagship).
  const bigThree = ["Bleach", "Dragon Ball Z", "One Piece"];
  console.log("\nBig Three episodes:");
  for (const name of bigThree) {
    const eps = results.filter((r) => r.title === name);
    const ok = eps.filter((r) => r.verdict !== "FAIL").length;
    console.log(`  ${name}: ${ok}/${eps.length} playable`);
  }

  // Metadata depth rollup for the four content classes.
  console.log(
    "\nMetadata depth (aggregate credits / creators / external ids):",
  );
  const metaSamples = [
    { title: "The Dark Knight", year: 2008, type: "movie", id: 155 },
    { title: "Breaking Bad", year: 2008, type: "tv", id: 1396 },
    { title: "Bleach", year: 2004, type: "tv", id: 30983 },
    { title: "One Piece", year: 1999, type: "tv", id: 37854 },
    { title: "Squid Game", year: 2021, type: "tv", id: 93405 },
  ];
  for (const m of metaSamples) {
    const d = await probeMetadata(m);
    console.log(
      `  ${d.ok ? "✅" : "❌"} ${d.title}: cast=${d.cast} crew=${d.crew}${d.creator ? ` creator=${d.creator}` : ""}${d.imdb ? ` imdb=${d.imdb}` : ""} starring=${d.starring}`,
    );
  }

  // Era + category coverage rollups.
  const bucket = (year) =>
    year < 1950
      ? "1900s-1940s"
      : year < 1980
        ? "1950s-1970s"
        : year < 2000
          ? "1980s-1990s"
          : year < 2025
            ? "2000s-2024"
            : "2025-2026";
  const byEra = {};
  for (const r of results) {
    const b = bucket(r.year);
    byEra[b] = byEra[b] || { total: 0, playable: 0 };
    byEra[b].total += 1;
    if (r.verdict !== "FAIL") byEra[b].playable += 1;
  }
  console.log("\nCoverage by era:");
  for (const [era, v] of Object.entries(byEra))
    console.log(`  ${era}: ${v.playable}/${v.total} playable`);
  const cat = (r) =>
    r.title === "A Trip to the Moon" || r.year < 2000 ? r.type : r.type;
  void cat;
}

main().catch((err) => {
  console.error("Probe crashed:", err);
  process.exit(1);
});
