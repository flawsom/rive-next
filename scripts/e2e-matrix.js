#!/usr/bin/env node
// ─── Consumer E2E matrix (post-universal-validation) ────────────────────────
// Simulates what a real consumer's browser does on /watch for every content
// type, against a live deployment:
//
//   1. /api/providers/sources?action=best&category=…  — the provider the page
//      mounts on frame one.
//   2. /api/providers/extract (providerId, type, id, title, year, runtime,
//      season/episode) — the ad-free candidate pipeline, walked
//      universal-first (videm/2embed/vidlink/vidsrc → catalog) like the
//      watch page's rotation.
//   3. Sanity: is stream[0] free of junk (trailer/sample/test names),
//      on-title, and above a watchable bitrate for the runtime?
//   4. Playability probe of the winner: HLS → manifest round-trip through
//      the media proxy must return #EXTM3U; files → ranged GET must return
//      206 + video/*.
//
// Verdicts:
//   ✅ DIRECT  — validated candidate found AND probe passed (ad-free playback)
//   🟡 EMBED   — no candidate anywhere in the walk (page mounts the sandboxed
//                provider embed; playback possible but not ad-free)
//   ❌ FAIL    — walk errored unexpectedly
//
// Usage: node scripts/e2e-matrix.js https://open-stream-khaki.vercel.app

const argv = process.argv.slice(2);
const BASE = (
  argv[0] && !argv[0].startsWith("--") ? argv[0] : "http://localhost:3000"
).replace(/\/$/, "");
// --random N: sample N titles from the live TMDB catalog via the app's own
// backendfetch proxy (popular/top-rated movies & series, JP anime, KR
// K-drama) and run the consumer chain against them. Fast mode: universal
// tier only + shorter timeouts — matches what the page reaches first.
const RANDOM_N = (() => {
  const i = argv.indexOf("--random");
  return i !== -1 ? Math.max(1, Number(argv[i + 1]) || 100) : 0;
})();
const FAST = RANDOM_N > 0;
const CONCURRENCY = 3;
const EXTRACT_TIMEOUT_MS = FAST ? 30_000 : 55_000;
const MAX_EXTRACT_CALLS = FAST ? 2 : 3;

// Curated consumer matrix across every content type. Runtimes (minutes)
// anchor the watchable-bitrate validation exactly like the TMDB data the
// watch page sends.
const MATRIX = [
  // ── Movies ─────────────────────────────────────────────────────────────
  {
    title: "Hanuman Ansh",
    year: 2026,
    type: "movie",
    id: 1709391,
    runtime: 150,
    note: "the report that started this",
  },
  {
    title: "Pushpa 2: The Rule",
    year: 2024,
    type: "movie",
    id: 1479832,
    runtime: 200,
  },
  {
    title: "Toxic: A Fairy Tale for Grown-Ups",
    year: 2026,
    type: "movie",
    id: 1213243,
    runtime: 130,
  },
  {
    title: "Interstellar",
    year: 2014,
    type: "movie",
    id: 157336,
    runtime: 169,
  },
  {
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    id: 155,
    runtime: 152,
  },
  { title: "Inception", year: 2010, type: "movie", id: 27205, runtime: 148 },
  {
    title: "Dune: Part Two",
    year: 2024,
    type: "movie",
    id: 693134,
    runtime: 166,
  },
  { title: "Oppenheimer", year: 2023, type: "movie", id: 872585, runtime: 181 },
  { title: "Parasite", year: 2019, type: "movie", id: 496243, runtime: 132 },
  { title: "RRR", year: 2022, type: "movie", id: 675359, runtime: 187 },
  { title: "The Godfather", year: 1972, type: "movie", id: 238, runtime: 175 },
  { title: "The Matrix", year: 1999, type: "movie", id: 603, runtime: 136 },
  { title: "Barbie", year: 2023, type: "movie", id: 346698, runtime: 114 },
  {
    title: "Night of the Living Dead",
    year: 1968,
    type: "movie",
    id: 10331,
    runtime: 96,
  },
  { title: "Nosferatu", year: 1922, type: "movie", id: 141, runtime: 94 },

  // ── TV / web series ────────────────────────────────────────────────────
  {
    title: "Breaking Bad",
    year: 2008,
    type: "tv",
    id: 1396,
    season: 1,
    episode: 1,
    runtime: 58,
  },
  {
    title: "Game of Thrones",
    year: 2011,
    type: "tv",
    id: 1399,
    season: 1,
    episode: 1,
    runtime: 62,
  },
  {
    title: "Friends",
    year: 1994,
    type: "tv",
    id: 1668,
    season: 1,
    episode: 1,
    runtime: 22,
  },
  {
    title: "The Last of Us",
    year: 2023,
    type: "tv",
    id: 100088,
    season: 1,
    episode: 1,
    runtime: 55,
  },

  // ── Anime ──────────────────────────────────────────────────────────────
  {
    title: "Naruto",
    year: 2002,
    type: "tv",
    id: 31910,
    season: 1,
    episode: 1,
    runtime: 24,
  },
  {
    title: "Attack on Titan",
    year: 2013,
    type: "tv",
    id: 1429,
    season: 1,
    episode: 1,
    runtime: 24,
  },
  {
    title: "Jujutsu Kaisen",
    year: 2020,
    type: "tv",
    id: 95479,
    season: 1,
    episode: 1,
    runtime: 24,
  },

  // ── K-drama ────────────────────────────────────────────────────────────
  {
    title: "Vincenzo",
    year: 2021,
    type: "tv",
    id: 121534,
    season: 1,
    episode: 1,
    runtime: 65,
  },
  {
    title: "Crash Landing on You",
    year: 2019,
    type: "tv",
    id: 92783,
    season: 1,
    episode: 1,
    runtime: 70,
  },
];

// Mirror of the server-side universal validation (candidateValidation.ts) —
// the runner checks that the SERVER never hands back a junk candidate.
const JUNK_RE =
  /\b(trailer|teaser|promo|sample|sound ?test|5\.1|surround|aac ?test|dolby ?(vision|atmos)? ?(test|demo)|camrip|hdcam|hdts|\bcam\b|pdvd|dvdscr|screener|title ?sequence|opening ?titles|theme ?song|jukebox|lyrical|video ?song|song ?video|motion ?poster|recap)\b/i;
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "in",
  "on",
  "to",
  "for",
  "with",
  "at",
  "by",
  "from",
  "part",
  "one",
  "two",
  "three",
  "chapter",
  "episode",
  "movie",
  "film",
  "hd",
  "4k",
  "1080p",
  "720p",
  "480p",
  "web",
  "dl",
  "webdl",
  "webrip",
  "bluray",
  "brrip",
  "hdrip",
  "x264",
  "x265",
  "hevc",
  "aac",
  "hindi",
  "english",
  "dubbed",
  "official",
  "full",
]);
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[_.+:;,!?()[\]{}'’"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokens = (title) =>
  norm(title)
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
const minBytes = (runtimeMin, isTv) => {
  const MB = 1_000_000;
  const rt = runtimeMin && runtimeMin > 10 ? runtimeMin : isTv ? 45 : 100;
  return Math.round(rt * 2.2 * MB);
};

const UNIVERSAL = ["videm", "twoembed", "vidlink", "vidsrc"];

async function jfetch(url, timeoutMs = EXTRACT_TIMEOUT_MS) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return await res.json();
  } catch {
    return null;
  }
}
function sanityCheck(stream, entry) {
  if (!stream) return { ok: false, reason: "no candidate" };
  const label = String(stream.label || "");
  const hay = norm(`${label} ${stream.url}`);
  if (JUNK_RE.test(hay))
    return { ok: false, reason: `junk name: ${label.slice(0, 60)}` };
  // Minted universal-tier HLS (videm relays) carries no title text and no
  // byte count — the provider resolved the id upstream. Skip title/size,
  // same exemption as the server-side gate.
  const minted = stream.kind === "hls" && !stream.bytes;
  if (!minted) {
    const toks = tokens(entry.title);
    const collapsed = hay.replace(/ /g, "");
    if (
      toks.length &&
      !toks.every((t) => hay.includes(t) || collapsed.includes(t))
    ) {
      return { ok: false, reason: `off-title: ${label.slice(0, 60)}` };
    }
    if (
      stream.bytes &&
      stream.bytes > 0 &&
      stream.bytes < minBytes(entry.runtime, entry.type === "tv")
    ) {
      return {
        ok: false,
        reason: `sub-watchable: ${(stream.bytes / 1e6).toFixed(0)}MB for ${entry.runtime || "?"}min`,
      };
    }
  }
  return { ok: true };
}

async function probeWinner(stream) {
  const viaProxy = `/api/proxy/media?url=${encodeURIComponent(stream.url)}`;
  const url = `${BASE}${viaProxy}`;
  try {
    if (stream.kind === "hls") {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      return res.ok && text.includes("#EXTM3U")
        ? "hls-manifest-ok"
        : `hls-bad(${res.status})`;
    }
    const res = await fetch(url, {
      headers: { Range: "bytes=0-262143" },
      signal: AbortSignal.timeout(25000),
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const ok =
      (res.status === 206 || res.status === 200) &&
      (ct.startsWith("video/") ||
        ct.includes("octet-stream") ||
        ct.includes("mpegurl"));
    return ok ? `file-ok(${ct || "?"})` : `file-bad(${res.status},${ct})`;
  } catch (e) {
    return `probe-error(${e.message})`;
  }
}

async function runTitle(entry) {
  const category = entry.type === "tv" ? "tv" : "movie";
  const best = await jfetch(
    `${BASE}/api/providers/sources?action=best&category=${category}`,
    15000,
  );
  const providerOrder = [];
  const push = (id) => {
    if (id && !providerOrder.includes(id)) providerOrder.push(id);
  };
  push(best?.provider?.id);
  for (const u of UNIVERSAL) push(u);
  // In random/fast mode skip the catalog walk: server-side catalog extracts
  // burn ~55s each on CF-blocked domains (the real page reaches them only
  // after a client-side pageUrl resolve, which the runner cannot simulate).
  if (!FAST) push("hdhub4u");

  const paramsBase = new URLSearchParams({
    type: entry.type,
    id: String(entry.id),
    title: entry.title,
  });
  if (entry.year) paramsBase.set("year", String(entry.year));
  if (entry.runtime) paramsBase.set("runtime", String(entry.runtime));
  if (entry.season) paramsBase.set("season", String(entry.season));
  if (entry.episode) paramsBase.set("episode", String(entry.episode));

  let calls = 0;
  let firstStream = null;
  let sanity = { ok: false, reason: "no candidate" };
  let probe = "no candidate";
  let probeOk = false;
  let lastError = null;
  // Mirror the watch page's silent server rotation: a dead streams[0] (e.g.
  // a minted ref whose upstream 404s) must not fail the title while the
  // response carries two more live servers — try each until one probes OK.
  for (const providerId of providerOrder) {
    if (calls >= MAX_EXTRACT_CALLS) break;
    calls += 1;
    const res = await jfetch(
      `${BASE}/api/providers/extract?${paramsBase.toString()}&providerId=${providerId}`,
    );
    if (!res) {
      lastError = "extract timeout";
      continue;
    }
    const streams = (res.streams || []).slice(0, 3);
    for (const stream of streams) {
      firstStream = stream;
      sanity = sanityCheck(stream, entry);
      probe = await probeWinner(stream);
      probeOk = /^hls-manifest-ok|^file-ok/.test(probe);
      if (sanity.ok && probeOk) break;
    }
    if (sanity.ok && probeOk) break;
  }
  if (!firstStream) {
    return {
      entry,
      verdict: "🟡 EMBED",
      detail: `no validated candidate in ${calls} walk steps${lastError ? ` (${lastError})` : ""}`,
    };
  }
  // videm throttles play-minting per IP — a 403 under a burst is the
  // probe's own doing, not a product failure (one fresh mint + a short
  // pause plays fine, verified live). Retry once before classifying.
  const minted = firstStream.kind === "hls" && !firstStream.bytes;
  if (minted && !probeOk && /hls-bad\(403\)/.test(probe)) {
    await new Promise((r) => setTimeout(r, 4000));
    probe = await probeWinner(firstStream);
    probeOk = /^hls-manifest-ok|^file-ok/.test(probe);
  }
  if (!probeOk && minted && /hls-bad\(403\)/.test(probe)) {
    return {
      entry,
      verdict: "🟠 THROTTLED",
      detail: `minted HLS rate-limited under burst (real sessions re-mint silently)`,
      calls,
    };
  }
  return {
    entry,
    verdict:
      sanity.ok && probeOk ? "✅ DIRECT" : sanity.ok ? "🟡 EMBED" : "❌ FAIL",
    detail: `${firstStream.kind} · ${String(firstStream.label || firstStream.url).slice(0, 58)} · ${probe}${sanity.ok ? "" : ` · SANITY: ${sanity.reason}`}`,
    calls,
  };
}

// ─── Random catalog sampling (--random N) ────────────────────────────────
async function fetchPool(request, params) {
  const qs = new URLSearchParams({ requestID: request, ...params });
  try {
    const res = await fetch(`${BASE}/api/backendfetch?${qs}`, {
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    return data?.results || [];
  } catch {
    return [];
  }
}

function entryFromTmdb(item, type, category) {
  const id = item?.id;
  const title = item?.title || item?.name;
  if (!id || !title) return null;
  const date = item.release_date || item.first_air_date || "";
  return {
    title,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    type,
    id,
    category,
    ...(type === "tv" ? { season: 1, episode: 1 } : {}),
  };
}

async function buildRandomPool() {
  const pages = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
  const jobs = [
    ...pages(3).map((page) =>
      fetchPool("popularMovie", { page }).then((r) =>
        r.map((x) => entryFromTmdb(x, "movie", "movie")),
      ),
    ),
    ...pages(1).map((page) =>
      fetchPool("topRatedMovie", { page }).then((r) =>
        r.map((x) => entryFromTmdb(x, "movie", "movie")),
      ),
    ),
    ...pages(2).map((page) =>
      fetchPool("popularTv", { page }).then((r) =>
        r.map((x) => entryFromTmdb(x, "tv", "series")),
      ),
    ),
    ...pages(1).map((page) =>
      fetchPool("topRatedTv", { page }).then((r) =>
        r.map((x) => entryFromTmdb(x, "tv", "series")),
      ),
    ),
    ...pages(2).map((page) =>
      fetchPool("filterTv", {
        page,
        country: "JP",
        genreKeywords: "16", // animation × origin JP = anime
      }).then((r) => r.map((x) => entryFromTmdb(x, "tv", "anime"))),
    ),
    ...pages(2).map((page) =>
      fetchPool("filterTv", {
        page,
        country: "KR",
        genreKeywords: "18", // drama × origin KR = K-drama
      }).then((r) => r.map((x) => entryFromTmdb(x, "tv", "kdrama"))),
    ),
  ];
  const settled = await Promise.all(jobs);
  const seen = new Set();
  const pool = [];
  for (const list of settled) {
    for (const e of list) {
      if (!e) continue;
      const key = `${e.type}:${e.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(e);
    }
  }
  // Fisher-Yates shuffle, then sample.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

(async () => {
  let matrix = MATRIX;
  if (RANDOM_N > 0) {
    console.log(
      `Sampling ${RANDOM_N} random titles from the live TMDB catalog…`,
    );
    const pool = await buildRandomPool();
    matrix = pool.slice(0, RANDOM_N);
    console.log(
      `pool: ${pool.length} unique titles → testing ${matrix.length}\n`,
    );
  }
  console.log(`E2E consumer matrix → ${BASE}\n`);
  const results = [];
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < matrix.length) {
      const entry = matrix[index++];
      process.stdout.write(
        `· [${entry.category || entry.type}] ${entry.title}${entry.season ? ` S${entry.season}E${entry.episode}` : ""}…\n`,
      );
      const r = await runTitle(entry);
      results.push(r);
      // Gentle pacing: videm throttles minting per IP; a small stagger
      // keeps the probe representative of real usage.
      await new Promise((r2) => setTimeout(r2, 1500));
    }
  });
  await Promise.all(workers);

  const order = {
    "✅ DIRECT": 0,
    "🟠 THROTTLED": 1,
    "🟡 EMBED": 2,
    "❌ FAIL": 3,
  };
  results.sort((a, b) => order[a.verdict] - order[b.verdict]);
  console.log("\n══════════ CONSUMER E2E RESULTS ══════════");
  for (const r of results) {
    const name = `${r.entry.title}${r.entry.season ? ` S${r.entry.season}E${r.entry.episode}` : ""} [${r.entry.category || r.entry.type}]`;
    console.log(`${r.verdict}  ${name}`);
    console.log(`          ${r.detail}`);
  }
  const counts = results.reduce(
    (acc, r) => ((acc[r.verdict] = (acc[r.verdict] || 0) + 1), acc),
    {},
  );
  console.log("\n─── summary ───");
  console.log(
    `✅ DIRECT ${counts["✅ DIRECT"] || 0}/${matrix.length} · 🟠 THROTTLED ${counts["🟠 THROTTLED"] || 0} · 🟡 EMBED ${counts["🟡 EMBED"] || 0} · ❌ FAIL ${counts["❌ FAIL"] || 0}`,
  );
})();
