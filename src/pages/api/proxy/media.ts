import type { NextApiRequest, NextApiResponse } from "next";
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

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    res.setHeader("access-control-allow-origin", "*");
    if (upstreamRange) res.setHeader("content-range", upstreamRange);
    if (acceptRanges) res.setHeader("accept-ranges", acceptRanges);
    if (upstreamLength) res.setHeader("content-length", upstreamLength);

    if (isHead) return res.end();

    const reader = upstream.body?.getReader();
    if (!reader) return res.status(502).end();

    req.on("close", () => controller?.abort());
    const pump = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(value);
        }
        res.end();
      } catch {
        res.end();
      }
    };
    await pump();
  } catch {
    if (!res.headersSent) {
      return res.status(502).json({ error: "Upstream unavailable" });
    }
    res.end();
  }
}
