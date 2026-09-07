// Quick probe: extract chain for one provider/title against a base URL.
// Usage: node scripts/probe-extract.js <base> <providerId> <type> <id> [season] [episode]
const base = process.argv[2];
const providerId = process.argv[3];
const type = process.argv[4];
const id = process.argv[5];
const season = process.argv[6];
const episode = process.argv[7];

(async () => {
  const params = new URLSearchParams({ providerId, type, id });
  if (season) params.set("season", season);
  if (episode) params.set("episode", episode);
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/providers/extract?${params}`, {
      signal: AbortSignal.timeout(80000),
    });
    const data = await res.json();
    const streams = data.streams || [];
    console.log(
      `${providerId}/${type}/${id} dur=${((Date.now() - t0) / 1000).toFixed(1)}s count=${streams.length}`,
    );
    streams
      .slice(0, 3)
      .forEach((s) =>
        console.log(
          `  ${s.kind} | ${String(s.label || "").slice(0, 60)} | ${s.bytes || "-"} bytes | ${String(s.url).slice(0, 90)}`,
        ),
      );
    if (streams.length === 0)
      console.log(`  raw: ${JSON.stringify(data).slice(0, 200)}`);
  } catch (e) {
    console.log(
      `${providerId}/${type}/${id} dur=${((Date.now() - t0) / 1000).toFixed(1)}s ERROR ${e.message}`,
    );
  }
})();
