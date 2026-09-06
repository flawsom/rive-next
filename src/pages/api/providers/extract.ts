// Direct-stream extraction endpoint.
//
// Given a provider + media id, fetches the provider's embed/watch page
// server-side (no CORS problems), then extracts direct media URLs (HLS
// manifests, mp4, webm) using a layered strategy:
//
//   1. Regex sweep of the raw HTML/JS for media URLs.
//   2. Known player-API endpoints derived from the provider manifest's
//      apiEndpoints/streamPatterns (e.g. /embedplus?v=…, /api/source/…).
//   3. Optional server-side gateway keys (env-configurable) for providers
//      that need them.
//
// Returns candidate stream URLs that the client verifies and hands to the
// custom player (which supports HLS via hls.js and mp4/webm natively).
// This is the foundation for native quality/subtitle/multi-audio selection.
import type { NextApiRequest, NextApiResponse } from "next";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";
import { findProviderById } from "@/Utils/providers";
import { getOrBuildManifest } from "@/Utils/providerManifest";
import { getCachedDomain } from "@/Utils/domainDiscovery";
import { fetchVidemDirect, VIDEM_DIRECT_PROVIDERS } from "@/Utils/videmSources";
import {
  extractCatalogDirectStreams,
  fetchPageSmart,
} from "@/Utils/fileHostSources";
import { findArchiveStreams } from "@/Utils/archiveClassics";

export const maxDuration = 55;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Only public hosts; mirrors the SSRF guard used by the domains endpoint.
function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("[")
  )
    return false;
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

interface StreamCandidate {
  url: string;
  /** hls | mp4 | webm | unknown */
  kind: string;
  /** Where it was found: html | api */
  source: "html" | "api";
  label?: string;
}

const MEDIA_URL_RE =
  /https?:\/\/[^\s"'<>()\\]{10,400}?\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>()\\]{0,200})?/gi;

function classify(url: string): string {
  if (/\.m3u8(\?|$)/i.test(url)) return "hls";
  if (/\.mp4(\?|$)/i.test(url)) return "mp4";
  if (/\.webm(\?|$)/i.test(url)) return "webm";
  return "unknown";
}

function extractFromHtml(html: string): StreamCandidate[] {
  const out: StreamCandidate[] = [];
  const seen = new Set<string>();
  const matches = html.match(MEDIA_URL_RE) || [];
  for (const url of matches) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, kind: classify(url), source: "html" });
    if (out.length >= 12) break;
  }
  return out;
}

async function fetchPage(
  url: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        referer: new URL(url).origin,
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Try manifest-derived API endpoints for JSON/embed players. */
async function extractFromApis(
  providerId: string,
  embedUrl: string,
  timeoutMs: number,
): Promise<StreamCandidate[]> {
  const out: StreamCandidate[] = [];
  const manifest = await getOrBuildManifest();
  const mp = manifest.providers.find((p) => p.id === providerId);
  const endpoints = new Set<string>();
  for (const tpl of [
    ...(mp?.apiEndpoints || []),
    ...(mp?.streamPatterns || []),
  ]) {
    try {
      const parsed = new URL(tpl);
      if (!isPublicHostname(parsed.hostname)) continue;
      endpoints.add(tpl);
    } catch {
      // relative template — attach to embed origin
      if (tpl.startsWith("/"))
        endpoints.add(`${new URL(embedUrl).origin}${tpl}`);
    }
  }
  if (endpoints.size === 0) return out;

  const deadline = Date.now() + timeoutMs;
  await Promise.all(
    Array.from(endpoints)
      .slice(0, 6)
      .map(async (endpoint) => {
        if (Date.now() > deadline) return;
        const html = await fetchPage(endpoint, 6_000);
        if (!html) return;
        // API responses are often JSON with nested file/source URLs.
        for (const c of extractFromHtml(html))
          out.push({ ...c, source: "api" });
      }),
  );
  return out.slice(0, 12);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const providerId =
    typeof req.query.providerId === "string" ? req.query.providerId : "";
  const type = req.query.type === "tv" ? "tv" : "movie";
  const id = typeof req.query.id === "string" ? req.query.id.slice(0, 100) : "";
  const season = Number(req.query.season) || undefined;
  const episode = Number(req.query.episode) || undefined;

  if (!providerId || !findProviderById(providerId) || !id) {
    return res
      .status(400)
      .json({ error: "Valid providerId, type and id are required" });
  }

  // Build the page URL the watch page will mount. The client's title-resolved
  // page URL (from /api/providers/resolve) wins: WordPress-class providers do
  // not expose /movie/{tmdbId} routes, and the serverless instance often has
  // NO cached domain for a provider the *client* verified via its own browser
  // discovery (e.g. MoviesDrive — only HDHub4U has an env seed). A valid
  // pageUrl must therefore never be rejected just because the provider has no
  // server-side domain cache.
  const provider = findProviderById(providerId)!;
  const clientPageUrl =
    typeof req.query.pageUrl === "string" ? req.query.pageUrl.trim() : "";
  let primaryUrl: string | null = null;
  if (clientPageUrl) {
    try {
      const parsed = new URL(clientPageUrl);
      if (
        /^https?:$/.test(parsed.protocol) &&
        isPublicHostname(parsed.hostname)
      ) {
        primaryUrl = clientPageUrl;
      }
    } catch {
      // ignore malformed pageUrl, fall back to the naive embed below
    }
  }
  if (!primaryUrl) {
    const domain = getCachedDomain(providerId);
    const base = domain || provider.embedBase || null;
    if (base) {
      const baseUrl = base.startsWith("http") ? base : `https://${base}`;
      primaryUrl =
        type === "movie"
          ? `${baseUrl}/movie/${id}`
          : season && episode
            ? `${baseUrl}/tv/${id}/${season}/${episode}`
            : `${baseUrl}/tv/${id}`;
    }
  }
  if (!primaryUrl)
    return res.status(404).json({ error: "Provider has no domain" });

  if (!isPublicHostname(new URL(primaryUrl).hostname)) {
    return res.status(400).json({ error: "Embed host not allowed" });
  }

  const deadline = Date.now() + 45_000;
  const candidates: StreamCandidate[] = [];

  // 0) Universal tier: mint REAL direct HLS streams from the videm player
  // API (the HLS backend of 2Embed's default server). This is what makes
  // the custom player work — the generic HTML scraping below finds nothing
  // on these JS-driven players.
  if (VIDEM_DIRECT_PROVIDERS.has(providerId)) {
    const videm = await fetchVidemDirect(type, id, season, episode);
    candidates.push(...videm.streams);
  }

  // 0b) Catalog tier: WordPress-class providers (HDHub4U/MoviesDrive/…).
  // The watch page hands us the TITLE-RESOLVED post page; its file-host
  // buttons (HubCloud/FSL/GDFlix) redirect to the real signed media files.
  // Every URL is Range-probed server-side before it is returned, so the
  // client only ever sees playable direct files — ad-free, in our own
  // player, no provider embed in the loop. Universal providers are excluded:
  // their pageUrl is an embed route, not a catalog post, and probing it
  // would only add latency to the videm-first path above.
  if (
    candidates.length === 0 &&
    clientPageUrl &&
    !VIDEM_DIRECT_PROVIDERS.has(providerId)
  ) {
    const catalog = await extractCatalogDirectStreams(primaryUrl);
    candidates.push(...catalog);
  }

  // Legacy HTML/API scraping ONLY when the direct tier found nothing. For
  // universal providers the videm result is authoritative — running the
  // remaining steps anyway added ~10s of serial fetches before the response
  // landed (the watch page's extraction gate + embed release both wait on
  // it), for zero extra coverage: the JS-driven universal players expose
  // nothing to regex scraping (the original count:0 bug).
  if (candidates.length === 0) {
    // 1) The resolved provider page itself. CF-smart: direct first, then the
    // keyless reader proxy (r.jina.ai) — catalog domains challenge-hang
    // datacenter IPs, and the old blind fetch waited out the full timeout.
    const page = await fetchPageSmart(primaryUrl);
    const html = page?.html || null;
    if (html) candidates.push(...extractFromHtml(html));

    // 2) iframe sources inside the page → fetch those too (common pattern).
    const iframeSrcs = new Set<string>();
    if (html) {
      const iframeMatches =
        html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
      for (const tag of iframeMatches) {
        const srcMatch = tag.match(/src=["']([^"']+)["']/i);
        if (!srcMatch) continue;
        try {
          const resolved = new URL(srcMatch[1], primaryUrl).toString();
          if (
            /^https?:/i.test(resolved) &&
            isPublicHostname(new URL(resolved).hostname)
          ) {
            iframeSrcs.add(resolved);
          }
        } catch {
          // skip malformed iframe src
        }
        if (iframeSrcs.size >= 3) break;
      }
    }
    await Promise.all(
      Array.from(iframeSrcs)
        .slice(0, 3)
        .map(async (iframeUrl) => {
          if (Date.now() > deadline) return;
          const inner = await fetchPage(iframeUrl, 10_000);
          if (inner) candidates.push(...extractFromHtml(inner));
        }),
    );

    // 3) Manifest-derived API endpoints.
    if (Date.now() < deadline) {
      candidates.push(
        ...(await extractFromApis(
          providerId,
          primaryUrl,
          Math.max(0, deadline - Date.now()),
        )),
      );
    }
  }

  // Last-resort tier: archive.org classics. The piracy-grade providers have
  // no incentive to carry pre-1945 cinema (A Trip to the Moon, Gone with the
  // Wind, Nosferatu…) but archive.org legally hosts it in full. When every
  // provider tier came up empty, search archive.org for the title and return
  // its best mp4 derivative — 1900s cinema plays in the same custom player,
  // through our proxy, ad-free. TMDB title/year arrive via query params.
  if (candidates.length === 0) {
    const title =
      typeof req.query.title === "string" && req.query.title.trim()
        ? req.query.title.trim().slice(0, 150)
        : null;
    if (title) {
      const yearNum = Number(req.query.year) || undefined;
      const archive = await findArchiveStreams(
        title,
        yearNum,
        Math.max(0, deadline - Date.now()),
      );
      candidates.push(...archive);
    }
  }

  // Dedupe by URL, prefer HLS (best player support).
  const seen = new Set<string>();
  const unique = candidates
    .filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .sort((a, b) => {
      const rank = (k: string) => (k === "hls" ? 0 : k === "mp4" ? 1 : 2);
      return rank(a.kind) - rank(b.kind);
    })
    .slice(0, 15);

  return res.status(200).json({
    provider: providerId,
    embedUrl: primaryUrl,
    count: unique.length,
    streams: unique,
    extractedAt: Date.now(),
  });
}
