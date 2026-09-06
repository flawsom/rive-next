// ─── Archive.org classics tier ──────────────────────────────────────────────
// The deep back-catalog (silent era, pre-1945 Hollywood) is invisible to the
// piracy-grade providers: hdhub4u/2Embed/videm simply do not carry "A Trip to
// the Moon (1902)" or "Gone with the Wind (1939)". But archive.org hosts the
// largest legal catalog of classic cinema on earth. This tier searches
// archive.org server-side, picks the best full-length mp4 derivative from the
// top hits, and hands the URLs to the extraction pipeline — so 100+ year old
// cinema plays in the same custom player as a 2026 release, ad-free, through
// our proxy.
//
// Design rules (same as every tier):
//   • soft-fail — any network/parse error returns [] and the pipeline moves on
//   • capped work — bounded rows, bounded metadata fetches, caller deadline
//   • cached — per-instance TTL map so a cold search (≈1–2s) happens once

interface ArchiveStream {
  url: string;
  kind: string; // "mp4"
  source: "api";
  label: string;
  /** File size in bytes (0 unknown) — used to rank full features above clips */
  bytes: number;
}

interface CacheEntry {
  expires: number;
  streams: ArchiveStream[];
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — archive identifiers are stable
const cache = new Map<string, CacheEntry>();

// Curated identifier hints for marquee classics whose exact archive item is
// known-good. Search runs first; hints are the safety net when the text index
// returns noise (e.g. fan reuploads of trailers).
const IDENTIFIER_HINTS: Record<string, string[]> = {
  // A Trip to the Moon (Le Voyage dans la Lune, 1902) — top-hit identifier.
  "a trip to the moon": ["ATripToTheMoonGeorgeMelies", "ATripToTheMoon1902"],
  "le voyage dans la lune": ["ATripToTheMoonGeorgeMelies"],
  // Gone with the Wind (1939) — full-length 218 MB feature upload.
  "gone with the wind": ["gone-with-the-wind_202108"],
  // Night of the Living Dead (1968) — the canonical public-domain horror.
  // Both identifiers verified live Sept 6 (full 596/599 MB features).
  "night of the living dead": [
    "night_of_the_living_dead_dvd",
    "NightOfTheLivingDead-MPEG",
  ],
  // Nosferatu (1922) — 574 MB feature, verified live Sept 6.
  nosferatu: ["Nosferatu1922"],
  // Metropolis (1927) — 737 MB English-version feature, verified live Sept 6.
  metropolis: ["Metropolis1927EnglishVersion"],
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function timedFetch(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface MetadataFile {
  name?: string;
  format?: string;
  size?: string;
}

/** Lowercase, strip separators so "S02E07 - Your_Obedient.Servant" matches. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_.]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pick the most complete mp4 derivative from an archive item's file list. */
function pickBestFile(files: MetadataFile[]): {
  name: string;
  bytes: number;
} | null {
  const mp4s = files.filter(
    (f) => f.name && /\.(mp4|m4v)$/i.test(f.name) && f.format !== "Thumbnail",
  );
  if (mp4s.length === 0) return null;
  const sized = mp4s
    .map((f) => ({ name: f.name as string, bytes: Number(f.size) || 0 }))
    .sort((a, b) => b.bytes - a.bytes);
  // Prefer a substantial feature-length file (>100MB); fall back to the
  // largest available (silent shorts like 1902 are legitimately small).
  const feature = sized.find((f) => f.bytes >= 100_000_000);
  return feature || sized[0];
}

/**
 * Episode-aware file picker for TV searches. Finds the file that actually
 * matches the requested season/episode (SxxEyy, NxYY, "EP 8", "episode 8"),
 * rejecting junk (<40MB clips/thumbnails) and the WRONG episode — playing
 * episode 8 when the user asked for episode 1 is worse than not playing.
 * Returns null when nothing matches: the caller keeps searching or yields
 * to the embed tier (status quo), never to wrong content.
 */
function pickEpisodeFile(
  files: MetadataFile[],
  season: number | undefined,
  episode: number,
): { name: string; bytes: number } | null {
  const mp4s = files.filter(
    (f) => f.name && /\.(mp4|m4v)$/i.test(f.name) && f.format !== "Thumbnail",
  );
  if (mp4s.length === 0) return null;
  const sized = mp4s
    .map((f) => ({
      name: f.name as string,
      bytes: Number(f.size) || 0,
      norm: normName(f.name as string),
    }))
    .filter((f) => f.bytes === 0 || f.bytes >= 40_000_000); // junk guard
  const matches = sized.filter((f) => {
    // s01e02 / 1x02 — exact season+episode pin
    const sNum = season || 0;
    if (
      sNum > 0 &&
      (new RegExp(`\\bs0*${sNum}\\s*e0*${episode}\\b`).test(f.norm) ||
        new RegExp(`\\b${sNum}\\s*x\\s*0*${episode}\\b`).test(f.norm))
    ) {
      return true;
    }
    // ep 2 / episode 2 / e02 — episode number only. Word boundaries keep
    // "ep 152" from matching episode 2; a pinned DIFFERENT season rejects.
    if (new RegExp(`\\b(?:ep|episode|e)\\s*0*${episode}\\b`).test(f.norm)) {
      const seasonPin = f.norm.match(/\b(?:season|series)\s*0*(\d{1,2})\b/);
      if (seasonPin && sNum > 0 && Number(seasonPin[1]) !== sNum) return false;
      return true;
    }
    return false;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.bytes - a.bytes);
  return { name: matches[0].name, bytes: matches[0].bytes };
}

async function streamsFromIdentifier(
  identifier: string,
  tv?: { season?: number; episode?: number },
): Promise<ArchiveStream[]> {
  const meta = await timedFetch(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
    8_000,
  );
  if (!meta) return [];
  const body = (await meta.json().catch(() => null)) as {
    files?: MetadataFile[];
    metadata?: { title?: string };
  } | null;
  const files = body?.files || [];
  // TV: only an episode-number match counts — the largest file is often the
  // WRONG episode, which must never be served as "direct".
  const best =
    tv && tv.episode
      ? pickEpisodeFile(files, tv.season, tv.episode)
      : pickBestFile(files);
  if (!best) return [];
  return [
    {
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(best.name)}`,
      kind: "mp4",
      source: "api",
      label: `archive.org · ${identifier}`,
      bytes: best.bytes,
    },
  ];
}

/**
 * Hint-only variant: resolve marquee classics straight from the curated
 * identifier map, skipping the full-text search round-trip. Used by the
 * extraction pipeline as a TRAILING safety net even when the provider tiers
 * returned candidates — videm tokens are short-lived and can arrive stale,
 * so a classic with a known-good archive item must never dead-end. The
 * client's silent server rotation skips the dead candidates in front of it.
 */
export async function getHintedArchiveStreams(
  title: string,
  deadlineMs = Date.now() + 8_000,
): Promise<ArchiveStream[]> {
  const key = `hint|${title.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.streams;

  const streams: ArchiveStream[] = [];
  const hintIds = IDENTIFIER_HINTS[title.toLowerCase()] || [];
  for (const hint of hintIds) {
    if (streams.length >= 2 || Date.now() > deadlineMs) break;
    streams.push(...(await streamsFromIdentifier(hint)));
  }
  // Rank full features above short clips/promos (same rule as the search path).
  const ranked = [...streams].sort((a, b) => b.bytes - a.bytes);
  cache.set(key, { expires: Date.now() + CACHE_TTL, streams: ranked });
  return ranked;
}

/**
 * Search archive.org for the title and return direct-mp4 stream candidates.
 * @param title  display title (e.g. "A Trip to the Moon")
 * @param year   optional release year to disambiguate remakes
 * @param deadlineMs absolute epoch-ms by which all work must stop
 * @param tv     for TV titles: the season/episode to match. When set, only
 *   files whose names pin that exact episode are returned — no match means
 *   an empty result (the embed tier covers it), never a wrong episode.
 */
export async function findArchiveStreams(
  title: string,
  year?: number,
  deadlineMs = Date.now() + 20_000,
  tv?: { season?: number; episode?: number },
): Promise<ArchiveStream[]> {
  const isTv = !!(tv && tv.episode);
  const key = `${title.toLowerCase()}|${year || ""}|tv${
    isTv ? `${tv?.season ?? 0}e${tv?.episode}` : ""
  }`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.streams;

  const streams: ArchiveStream[] = [];

  // 1) Full-text search across archive.org's movie holdings. TV sweeps more
  //    rows because episode uploads are scattered across low-download items.
  const q = [`title:("${title}")`, "mediatype:(movies)"].join(" AND ");
  const search = await timedFetch(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl%5B%5D=identifier&sort%5B%5D=downloads+desc&rows=${isTv ? 8 : 4}&output=json`,
    8_000,
  );
  if (search && Date.now() < deadlineMs) {
    const body = (await search.json().catch(() => null)) as {
      response?: { docs?: Array<{ identifier?: string }> };
    } | null;
    for (const doc of body?.response?.docs || []) {
      if (!doc.identifier || Date.now() > deadlineMs) break;
      streams.push(
        ...(await streamsFromIdentifier(doc.identifier, isTv ? tv : undefined)),
      );
      if (streams.length >= 2) break; // top 2 hits are plenty
    }
  }

  // 2) Curated hints as the safety net (deduped against search results).
  const hintIds = IDENTIFIER_HINTS[title.toLowerCase()] || [];
  for (const hint of hintIds) {
    if (streams.length >= 3 || Date.now() > deadlineMs) break;
    if (streams.some((s) => s.url.includes(`/${encodeURIComponent(hint)}/`)))
      continue;
    streams.push(...(await streamsFromIdentifier(hint)));
  }

  cache.set(key, {
    expires: Date.now() + CACHE_TTL,
    // Rank full features above short clips/promos: a 10MB trailer must not
    // outrank the 218MB feature when the player tries candidates in order.
    streams: [...streams].sort((a, b) => b.bytes - a.bytes),
  });
  return streams;
}
