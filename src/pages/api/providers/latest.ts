// Latest uploads from HDHub4u — server-side crawl of the provider homepage.
//
// HDHub4u (and its mirrors discovered by domainDiscovery) lists its newest
// uploads directly on the landing page (post cards with title + poster).
// This endpoint fetches that page server-side (no CORS issues), parses the
// post grid, and enriches each entry with a TMDB match so the row renders
// with real posters, ratings and detail links.
//
// Response shape:
//   { provider, source, uploads: [{ title, quality, href, poster,
//      tmdbId, tmdbType, year, overview }] }
import type { NextApiRequest, NextApiResponse } from "next";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";
import { getBestDomain, getDomainPatterns } from "@/Utils/domainDiscovery";

// Searchable providers whose homepage lists fresh uploads.
const CRAWLABLE: Record<string, string[]> = {
  hdhub4u: ["hdhub4u"],
  moviesdrive: ["moviesdrive"],
};

export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE =
  process.env.NEXT_PUBLIC_TMDB_API || "https://api.themoviedb.org/3";
const IMG_BASE =
  process.env.NEXT_PUBLIC_TMBD_IMAGE_URL ||
  "https://image.tmdb.org/t/p/original";

interface Upload {
  title: string;
  quality: string;
  href: string;
  poster: string | null;
  tmdbId: number | null;
  tmdbType: "movie" | "tv" | null;
  year: number | null;
  overview: string | null;
}

/** Clean a raw site title into a searchable name + optional year/quality. */
function parseTitle(raw: string): {
  title: string;
  quality: string;
  year: number | null;
} {
  let title = raw
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Quality tokens commonly appended: 1080p 10bit, HDRip, 4K, WEB-DL, Season…
  const qualityMatch = title.match(
    /\b(4K|2160p|1080p|720p|480p|HDRip|WEB-?DL|WEBRip|BluRay|HDR10?\b|CAM[HQ]?\b|HQ\b)/i,
  );
  const quality = qualityMatch ? qualityMatch[1].toUpperCase() : "";
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;
  // Strip the parenthetical language/quality suffixes and the trailing year.
  title = title
    .replace(/\((?:[^)]*)\)\s*$/, "")
    .replace(/\b(19|20)\d{2}\b.*$/, "")
    .replace(/\b(Season|S\d{1,2})\s*\d{0,2}\b.*$/i, "")
    .replace(/[-–|]\s*$/, "")
    .trim();
  return { title, quality, year };
}

function extractUploads(html: string, baseUrl: string): Upload[] {
  const out: Upload[] = [];
  const seen = new Set<string>();
  // Post blocks: an <a href> wrapping or adjacent to an <img>, with a title
  // attribute or inner heading text. Works for WordPress-style grids.
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const inner = m[2];
    if (!href || seen.has(href)) continue;
    const abs = href.startsWith("http")
      ? href
      : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
    let path: string;
    try {
      path = new URL(abs).pathname;
    } catch {
      continue;
    }
    // Upload pages are single slugs, not archive/listing routes.
    if (!/\.(html?|php)$/i.test(path) && (path.match(/\//g) || []).length > 2)
      continue;
    if (/\/(category|tag|page|genre|year|author|wp-)/i.test(path)) continue;
    const imgMatch =
      inner.match(/<img[^>]+src=["']([^"']+)["']/i) ||
      inner.match(/data-src=["']([^"']+)["']/i);
    const titleAttr = inner.match(/title=["']([^"']{4,150})["']/i);
    const headingMatch = inner.match(
      /<h[1-6][^>]*>([\s\S]{3,150}?)<\/h[1-6]>/i,
    );
    const rawTitle = (titleAttr?.[1] || headingMatch?.[1] || "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!rawTitle || rawTitle.length < 3) continue;
    if (!imgMatch) continue; // post grid cards always carry a poster
    seen.add(href);
    const { title, quality, year } = parseTitle(rawTitle);
    let poster: string | null = null;
    try {
      const p = new URL(imgMatch[1], abs).toString();
      poster = p.startsWith("http") ? p : null;
    } catch {
      poster = null;
    }
    out.push({
      title,
      quality,
      href: abs,
      poster,
      tmdbId: null,
      tmdbType: null,
      year,
      overview: null,
    });
    if (out.length >= 30) break;
  }
  return out;
}

/** Best-effort TMDB match so the row shows real posters/ratings/links. */
async function enrichWithTmdb(uploads: Upload[]): Promise<Upload[]> {
  if (!TMDB_KEY || uploads.length === 0) return uploads;
  const deadline = Date.now() + 20_000;
  const results = await Promise.all(
    uploads.slice(0, 24).map(async (u) => {
      if (Date.now() > deadline) return u;
      try {
        const q = encodeURIComponent(u.title);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(
          `${TMDB_BASE}/search/multi?query=${q}&include_adult=false&api_key=${TMDB_KEY}`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        if (!res.ok) return u;
        const data = await res.json();
        const hit = (data.results || []).find((r: any) => {
          const name = r.title || r.name || "";
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          return norm(name).startsWith(norm(u.title).slice(0, 12));
        });
        if (!hit) return u;
        return {
          ...u,
          tmdbId: hit.id ?? null,
          tmdbType:
            hit.media_type === "tv" || hit.first_air_date
              ? ("tv" as const)
              : ("movie" as const),
          year:
            u.year ||
            Number(
              (hit.release_date || hit.first_air_date || "").slice(0, 4),
            ) ||
            null,
          overview: hit.overview || null,
          // Normalize: TMDB path (for the shared poster component) plus the
          // absolute URL kept for any direct rendering.
          poster: hit.poster_path ? `${IMG_BASE}${hit.poster_path}` : u.poster,
          posterPath: hit.poster_path || null,
        };
      } catch {
        return u;
      }
    }),
  );
  return results;
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

  const requested =
    typeof req.query.provider === "string" ? req.query.provider : "hdhub4u";
  const providerId = CRAWLABLE[requested] ? requested : "hdhub4u";

  // Candidate domains: the verified/active domain first, then known mirrors
  // from the discovery patterns — some block datacenter IPs with 429s.
  const primary = await getBestDomain(providerId);
  const candidates: string[] = [];
  if (primary) candidates.push(primary);
  for (const pattern of getDomainPatterns()[providerId] || []) {
    const url = /^https?:/i.test(pattern) ? pattern : `https://${pattern}`;
    if (!candidates.includes(url)) candidates.push(url);
    if (candidates.length >= 4) break;
  }

  let lastReason = "no-active-domain";
  for (const domain of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const pageRes = await fetch(domain, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "text/html" },
      });
      clearTimeout(timer);
      if (!pageRes.ok) {
        lastReason = `status ${pageRes.status}`;
        continue;
      }
      const html = await pageRes.text();

      let uploads = extractUploads(html, domain.replace(/\/$/, ""));
      if (uploads.length === 0) {
        lastReason = "parse-empty";
        continue;
      }

      uploads = await enrichWithTmdb(uploads);

      res.setHeader(
        "Cache-Control",
        "s-maxage=900, stale-while-revalidate=3600",
      );
      return res.status(200).json({
        provider: providerId,
        source: domain,
        uploads: uploads.filter((u) => u.tmdbId || u.poster),
      });
    } catch (err: any) {
      lastReason = err?.message || "crawl-failed";
    }
  }

  // Soft-fail: the row shows its calm note when every domain is unreachable.
  return res.status(200).json({
    provider: providerId,
    source: primary,
    uploads: [],
    reason: lastReason,
  });
}
