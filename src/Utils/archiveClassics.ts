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
  "night of the living dead": ["night_of_the_living_dead"],
  // Nosferatu (1922)
  nosferatu: ["nosferatuTheVampire", "Nosferatu1922"],
  // Metropolis (1927) — backup when provider tiers miss.
  metropolis: ["Metropolis1927Film", "metropolis_1927"],
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

async function streamsFromIdentifier(
  identifier: string,
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
  const best = pickBestFile(files);
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
 * Search archive.org for the title and return direct-mp4 stream candidates.
 * @param title  display title (e.g. "A Trip to the Moon")
 * @param year   optional release year to disambiguate remakes
 * @param deadlineMs absolute epoch-ms by which all work must stop
 */
export async function findArchiveStreams(
  title: string,
  year?: number,
  deadlineMs = Date.now() + 20_000,
): Promise<ArchiveStream[]> {
  const key = `${title.toLowerCase()}|${year || ""}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.streams;

  const streams: ArchiveStream[] = [];

  // 1) Full-text search across archive.org's movie holdings.
  const q = [`title:("${title}")`, "mediatype:(movies)"].join(" AND ");
  const search = await timedFetch(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl%5B%5D=identifier&sort%5B%5D=downloads+desc&rows=4&output=json`,
    8_000,
  );
  if (search && Date.now() < deadlineMs) {
    const body = (await search.json().catch(() => null)) as {
      response?: { docs?: Array<{ identifier?: string }> };
    } | null;
    for (const doc of body?.response?.docs || []) {
      if (!doc.identifier || Date.now() > deadlineMs) break;
      streams.push(...(await streamsFromIdentifier(doc.identifier)));
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
