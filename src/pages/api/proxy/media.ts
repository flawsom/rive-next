import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";

// Streaming media proxy: lets the custom player play direct media URLs
// (HLS/mp4/webm) through our origin, which avoids CORS/embed restrictions.
//
// Two URL forms:
//   /api/proxy/media?url=<encoded upstream>   — simple form (mp4/webm/tracks)
//   /api/proxy/media/<encoded upstream>       — path form; relative HLS
//       children resolve back into the proxy path automatically, so every
//       segment also travels through our origin.
//
// - SSRF guard: only public http(s) hosts, no localhost/private ranges.
// - Range passthrough so seeking works.
// - HEAD probes allowed (the watch page uses them to sniff content type).
// - Upstream timeouts so a dead host never hangs the player.

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("[")
  ) {
    return false;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

function extractUpstream(req: NextApiRequest): string | null {
  const queryForm =
    typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (queryForm) return queryForm;

  // Path form: /api/proxy/media/<encoded upstream>
  const marker = "/api/proxy/media/";
  const selfUrl = req.url || "";
  const index = selfUrl.indexOf(marker);
  if (index !== -1) {
    const tail = selfUrl.slice(index + marker.length).split("?")[0];
    if (tail) {
      try {
        return decodeURIComponent(tail);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const config = {
  api: {
    responseLimit: false,
  },
};

// Long-lived streams: a progressive movie file (multi-GB, Range-requested)
// stays open for the whole watch session, so the function needs the maximum
// execution window the platform allows (the plan cap clamps this value).
export const maxDuration = 300;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  const isHead = req.method === "HEAD";
  if (!isHead && req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawUrl = extractUpstream(req) || "";
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }
  if (
    rawUrl.length > 2048 ||
    !/^https?:$/i.test(parsed.protocol) ||
    !isPublicHostname(parsed.hostname)
  ) {
    return res.status(400).json({ error: "Url not allowed" });
  }

  const upstreamHeaders: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    accept: "*/*",
    // Some HLS gateways (videm.xyz cap.php) reject requests without a
    // same-origin referer; a same-origin referer is what any legit player
    // would send, so include it for every upstream.
    referer: `${parsed.origin}/`,
  };
  const range = req.headers.range;
  if (typeof range === "string" && /^bytes=\d*-\d*$/.test(range)) {
    upstreamHeaders.range = range;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const upstream = await fetch(rawUrl, {
      method: isHead ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: controller.signal,
      // 1KB is enough to sniff content type on GET probes carrying Range... but
      // real media streams must pass through untouched, so no body cap here.
    });
    clearTimeout(timer);

    if (!upstream.ok && upstream.status !== 206) {
      return res
        .status(upstream.status || 502)
        .json({ error: "Upstream error" });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const upstreamRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");
    const upstreamLength = upstream.headers.get("content-length");
    const isPlaylist = /mpegurl|vnd\.apple\.mpegurl/i.test(contentType);

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    // Caching strategy — media bytes are IMMUTABLE per full URL (a rotated
    // token or new file means a new URL, i.e. a new cache key), so they can
    // be cached hard: the browser serves back-seeks and revisits from its
    // own cache (instant seeks), and Vercel's CDN (s-maxage) serves popular
    // segments without a cold function + upstream hop. Rewritten HLS
    // playlists stay no-store — they embed rotating signed URLs.
    res.setHeader(
      "cache-control",
      isPlaylist ? "no-store" : "public, max-age=86400, s-maxage=86400",
    );
    res.setHeader("access-control-allow-origin", "*");
    // Strong validators let the browser cache partial (206) responses too —
    // that is what makes backward seeks instant on progressive files.
    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");
    if (etag) res.setHeader("etag", etag);
    if (lastModified) res.setHeader("last-modified", lastModified);
    if (upstreamRange) res.setHeader("content-range", upstreamRange);
    if (acceptRanges) res.setHeader("accept-ranges", acceptRanges);
    if (upstreamLength) res.setHeader("content-length", upstreamLength);

    if (isHead) return res.end();

    // HLS playlists: rewrite every child URI to an absolute upstream URL.
    // Some players (e.g. videm.xyz) emit ROOT-RELATIVE children
    // (/_stream?id=…) inside their masters; left as-is, hls.js would resolve
    // them against our origin (the proxied master path) and 404. Absolute
    // URIs (e.g. signed relay segments) pass through untouched — the player
    // rebases each request through this proxy via xhrSetup.
    if (/mpegurl|vnd\.apple\.mpegurl/i.test(contentType)) {
      const body = await upstream.text();
      const rewritten = body
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            // Rewrite URI="…" attributes inside tags (KEY / MEDIA / MAP / PART).
            return line.replace(/URI="([^"]+)"/g, (_m, u: string) => {
              try {
                return `URI="${new URL(u, rawUrl).toString()}"`;
              } catch {
                return _m;
              }
            });
          }
          try {
            const abs = new URL(line, rawUrl);
            if (/^https?:$/.test(abs.protocol)) return abs.toString();
          } catch {
            // leave non-URL lines untouched
          }
          return line;
        })
        .join("\n");
      return res.end(rewritten);
    }

    const body = upstream.body;
    if (!body) return res.end();

    // Stream with REAL backpressure: pipeline() pauses the upstream read
    // whenever the client socket is slow. The old manual read/write loop
    // ignored res.write()'s backpressure signal and buffered the response
    // in function memory on slow clients — memory pressure stalls and
    // OOM-killed streams are exactly the "keeps buffering" symptom.
    const nodeStream = Readable.fromWeb(body as any);
    const onClientGone = () => {
      controller.abort();
      nodeStream.destroy();
    };
    req.on("close", onClientGone);
    try {
      await pipeline(nodeStream, res);
    } finally {
      req.off("close", onClientGone);
    }
  } catch {
    if (!res.headersSent) {
      return res.status(502).json({ error: "Upstream unavailable" });
    }
    res.end();
  }
}
