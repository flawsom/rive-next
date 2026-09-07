// Live probe of the VidLink direct-mint stack (the goWasmRuntime glue +
// sodium shim + stream adapter), run from the project itself.
//
//   bun scripts/probe-vidlink.ts [base-url]
//
// Mints streams for a movie (the long-standing embed-only title 1709391)
// and a TV title. With a base URL it also exercises the deployed
// /api/providers/extract endpoint end-to-end.

import { fetchVidlinkDirect } from "../src/Utils/vidlinkSources";

const base = process.argv[2];

async function main() {
  console.log("── mint: movie 1709391 (Hanuman Ansh) ──");
  const t0 = Date.now();
  const movie = await fetchVidlinkDirect("movie", "1709391");
  console.log(`  mint time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  streams: ${movie.streams.length}`);
  for (const s of movie.streams) {
    console.log(
      `   · ${s.label} | kind=${s.kind} | bytes=${s.bytes ?? "?"} | rank=${s.rank ?? "-"}`,
    );
    console.log(`     ${s.url.slice(0, 110)}…`);
  }

  console.log("── mint: warm-runtime re-run (movie 157336) ──");
  const t1 = Date.now();
  const warm = await fetchVidlinkDirect("movie", "157336");
  console.log(`  mint time: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  streams: ${warm.streams.length}`);

  console.log("── mint: tv 46609 S1E1 ──");
  const tv = await fetchVidlinkDirect("tv", "46609", 1, 1);
  console.log(`  streams: ${tv.streams.length}`);
  for (const s of tv.streams) {
    console.log(`   · ${s.label} | bytes=${s.bytes ?? "?"}`);
  }

  if (base) {
    console.log("── deployed extract (universal session, movie 1709391) ──");
    const p = new URLSearchParams({
      providerId: "twoembed",
      type: "movie",
      id: "1709391",
      title: "Hanuman Ansh",
      year: "2026",
      runtime: "157",
    });
    const res = await fetch(`${base}/api/providers/extract?${p}`);
    const json = (await res.json()) as {
      count: number;
      streams: Array<{ label?: string; kind?: string; url: string }>;
    };
    console.log(`  count: ${json.count}`);
    for (const s of json.streams) {
      console.log(
        `   · ${s.label || "?"} | ${s.kind} | ${s.url.slice(0, 90)}…`,
      );
    }
  }

  const ok = movie.streams.some((s) => s.kind === "mp4" && s.rank === 1080);
  console.log(ok ? "PROBE PASS (1080p minted)" : "PROBE FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("PROBE ERROR:", e?.message || e);
  process.exit(1);
});
