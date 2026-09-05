// Mass-verification harness for the videm direct-HLS pipeline.
// Runs the same code path as /api/providers/extract (fetchVidemDirect) and
// then walks the playlist chain exactly like the player will:
//   master (#EXT-X-STREAM-INF) → first variant (#EXTINF) → first segment (200).
// Usage: bun scripts/probe-videm.ts
import { fetchVidemDirect } from "../src/Utils/videmSources";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MOVIES: [number, string][] = [
  [27205, "Inception"],
  [157336, "Interstellar"],
  [155, "The Dark Knight"],
  [603, "The Matrix"],
  [550, "Fight Club"],
  [680, "Pulp Fiction"],
  [278, "The Shawshank Redemption"],
  [13, "Forrest Gump"],
  [238, "The Godfather"],
  [693134, "Dune Part Two"],
  [533535, "Deadpool & Wolverine"],
  [872585, "Oppenheimer"],
  [579974, "RRR"],
  [1064213, "Animal"],
  [597, "Titanic"],
  [671, "Harry Potter 1"],
];

async function fetchText(
  url: string,
  timeoutMs = 15_000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Mirror /api/proxy/media: browser UA + accept + same-origin referer
    // (videm's cap.php gateway rejects referer-less requests).
    let referer: string | undefined;
    try {
      referer = `${new URL(url).origin}/`;
    } catch {
      // keep undefined
    }
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "*/*",
        ...(referer ? { referer } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function headStatus(url: string): Promise<string> {
  // Ranged GET (0-1023): relays often reject HEAD, but any real media host
  // answers a 1KB range request with 200/206 + a media content-type.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let referer: string | undefined;
    try {
      referer = `${new URL(url).origin}/`;
    } catch {
      // keep undefined
    }
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "*/*",
        range: "bytes=0-1023",
        ...(referer ? { referer } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return `${res.status} ${res.headers.get("content-type") || ""}`.trim();
  } catch {
    return "ERR";
  }
}

async function verifyTitle(
  label: string,
  type: "movie" | "tv",
  id: number,
  season?: number,
  episode?: number,
): Promise<string> {
  const t0 = Date.now();
  const result = await fetchVidemDirect(type, id, season, episode);
  if (result.streams.length === 0) {
    return `${label}: NO-STREAMS`;
  }
  const masterUrl = result.streams[0].url;
  const master = await fetchText(masterUrl);
  if (!master) return `${label}: MASTER-FAIL (${masterUrl})`;
  const variantCount = (master.match(/#EXT-X-STREAM-INF/g) || []).length;

  const variantUri = master
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  if (!variantUri) {
    // Single-playlist (non-master) responses are also playable.
    const segUri = master
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    const segOk = segUri
      ? await headStatus(new URL(segUri, masterUrl).toString())
      : "none";
    return `${label}: OK single-playlist seg=[${segOk}] (${Date.now() - t0}ms)`;
  }
  const variantUrl = new URL(variantUri, masterUrl).toString();
  const variant = await fetchText(variantUrl);
  if (!variant) return `${label}: VARIANT-FAIL (${variantUrl})`;
  const segUri = variant
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  const segOk = segUri
    ? await headStatus(new URL(segUri, variantUrl).toString())
    : "none";
  return `${label}: OK variants=${variantCount} seg=[${segOk}] (${Date.now() - t0}ms)`;
}

async function main() {
  console.log("=== MOVIES ===");
  let ok = 0;
  for (const [id, name] of MOVIES) {
    const line = await verifyTitle(name, "movie", id);
    console.log(line);
    if (line.includes("OK")) ok += 1;
  }
  console.log("=== TV Breaking Bad S1E1 ===");
  console.log(await verifyTitle("Breaking Bad 1x1", "tv", 1396, 1, 1));
  console.log(`\nMovies with playable direct streams: ${ok}/${MOVIES.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
