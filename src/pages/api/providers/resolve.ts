// Title-based provider page resolver.
//
// Root cause this fixes: the watch page builds `${domain}/movie/${tmdbId}` —
// but HDHub4U / MoviesDrive / Bollyflix-class providers are WordPress sites
// whose posts are found by TITLE SEARCH, not TMDB ids. Those id URLs 404,
// the iframe "loads" the 404 page, and the user stares at a broken player
// until the 30s watchdog gives up. Same story for `/download/{id}`.
//
// Strategy (server-side, no CORS):
//   1. Verify the naive id-based URL — if it really exists, use it as-is.
//   2. Otherwise search the provider site (`/?s=<title>`), rank result links
//      by title-token overlap (+ year bonus, − quality-tag noise), verify the
//      best candidate returns a real page, and return that URL.
//   3. If nothing matches, return ok:false so the client can immediately
//      switch providers instead of waiting for a timeout.
//
// Results are cached in-memory (per serverless instance) so repeat plays are
// instant. The client passes its live-discovered domain (`base`); only public
// http(s) hosts are fetched (SSRF-guarded, same class as extract.ts).
import type { NextApiRequest, NextApiResponse } from "next";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";
import {
  findProviderById,
  buildEmbedUrl,
  type Provider,
} from "@/Utils/providers";

export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ─── SSRF guard (mirrors extract.ts / media proxy) ──────────────────────────
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

// ─── Small fetch helpers ─────────────────────────────────────────────────────
async function fetchText(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; html: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        referer: new URL(url).origin + "/",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { status: res.status, html: "", finalUrl: res.url };
    const html = await res.text();
    return { status: res.status, html, finalUrl: res.url };
  } catch {
    return null;
  }
}

function looksLikeNotFound(html: string): boolean {
  if (!html) return true;
  const head = html.slice(0, 6000).toLowerCase();
  return (
    /error404/.test(head) ||
    /page not found/.test(head) ||
    /nothing found/.test(head) ||
    /no results found/.test(head) ||
    /404\s*(not found|error)?<\/title>/.test(head) ||
    /<title>[^<]*404[^<]*<\/title>/.test(head)
  );
}

// ─── Shell / parked-page rejection ───────────────────────────────────────
// Real-world shells that must never count as a hit even though they answer
// HTTP 200:
//  * Parked-domain redirects — provider domains that rotated into a
//    monetization page answer 200 but land somewhere else entirely
//    (observed live Sept 2026: hdhub4u.com/movie/* → view.secure-password.online).
//  * Squatter guide/SEO pages — ONE static "streaming guide" page served for
//    every URL on the domain (observed live: hdhub4u.fit, moviesdrive.pics
//    → moviesdrives.cfd answer 200 for /movie/{id} AND /?s= with identical
//    body that never mentions the title).
//  * JS-bootstrapped stubs whose raw HTML has no content (a 486-byte page
//    whose <title> is literally "Loading...").
function looksLikeShellPage(
  html: string,
  finalUrl: string,
  requestedUrl: string,
): boolean {
  if (!html) return true;
  try {
    const finalHost = new URL(finalUrl).hostname.replace(/^www\./, "");
    const requestedHost = new URL(requestedUrl).hostname.replace(/^www\./, "");
    if (finalHost !== requestedHost) return true; // parked/redirector
  } catch {
    // fall through to content checks
  }
  const head = html.slice(0, 12000).toLowerCase();
  return (
    /<title>\s*loading\.\.\./.test(head) ||
    /just a moment|attention required|cf-?challenge/i.test(head) ||
    /<title>[^<]*(streaming guide|movie reviews|trailers\s*&|safe & legal|official\s*\d{4})[^<]*<\/title>/.test(
      head,
    )
  );
}

// ─── Title matching ──────────────────────────────────────────────────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&apos;|&#39;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

const NOISE_WORDS = new Set([
  "1080p",
  "720p",
  "2160p",
  "480p",
  "360p",
  "4k",
  "8k",
  "10bit",
  "8bit",
  "web",
  "webdl",
  "webrip",
  "web",
  "hdrip",
  "bdrip",
  "brrip",
  "dvdrip",
  "bluray",
  "blu",
  "ray",
  "hdtv",
  "hdts",
  "tc",
  "dvdscr",
  "camrip",
  "hq",
  "x264",
  "x265",
  "hevc",
  "avc",
  "aac",
  "aac2",
  "aac5",
  "ddp",
  "dd5",
  "dolby",
  "vision",
  "hdr10",
  "hdr",
  "sdr",
  "dual",
  "audio",
  "multiaudio",
  "org",
  "original",
  "esub",
  "esub",
  "subs",
  "subtitles",
  "hindi",
  "dubbed",
  "movie",
  "movies",
  "download",
  "watch",
  "online",
  "free",
  "hd",
  "full",
  "season",
  "complete",
  "episode",
  "episodes",
  "480p",
  "2160p",
  "amzn",
  "nf",
  "netflix",
  "prime",
  "hotstar",
  "sony",
  "zee",
  "jio",
]);

function normalizeTitle(s: string): string[] {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // parentheticals
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(
      (t) => t.length >= 3 && !NOISE_WORDS.has(t) && !/^\d+(p|k|bit)$/.test(t),
    );
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Soft-existence check: when a title is known, the fetched page must actually
 * mention it. WordPress shells (e.g. hdhub4u.fit) answer 200 with an identical
 * JS homepage for ANY id route, and some mirrors redirect to unrelated sites —
 * both "verify" a page that will never play. Token coverage handles inflected
 * or decorated titles ("Panchayat Season 1", "Toxic: A Fairy Tale…").
 *
 * Tokenless titles ("DC", "MI" — everything under ~3 chars is filtered by
 * normalizeTitle) can't use coverage math; a 200 shell used to be accepted
 * blindly for them. Verified live: "DC" resolved "direct" against parked
 * guide shells on both hdhub4u.fit and moviesdrive.pics in ~220ms. For these
 * titles the page must prove identity verbatim: its <title> must contain the
 * exact name AND the release year (real provider posts read "DC (2026) …";
 * squatter pages never name the queried title).
 */
function pageMentionsTitle(html: string, title: string, year: string): boolean {
  const tokens = normalizeTitle(title);
  if (tokens.length === 0) {
    const pageTitle = (
      html.match(/<title>([^<]*)<\/title>/i)?.[1] || ""
    ).toLowerCase();
    if (!pageTitle) return false;
    const q = decodeEntities(title).trim().toLowerCase();
    if (!q || !pageTitle.includes(q)) return false;
    return !!year && pageTitle.includes(year);
  }
  const text = stripTags(html).toLowerCase();
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits / tokens.length >= 0.6;
}

interface Candidate {
  url: string;
  score: number;
}

function extractCandidates(
  searchHtml: string,
  baseUrl: string,
  queryTokens: string[],
  year: string,
): Candidate[] {
  const out: Candidate[] = [];
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./, "");
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(searchHtml)) !== null) {
    let href = m[1];
    const text = stripTags(m[2]);
    if (!text || text.length > 220) continue;
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const parsed = new URL(href);
    if (!/^https?:$/.test(parsed.protocol)) continue;
    if (parsed.hostname.replace(/^www\./, "") !== baseHost) continue;
    if (
      /\/(category|tag|author|page\/\d|feed|wp-|comment)/i.test(
        parsed.pathname,
      ) ||
      /\.(jpg|png|webp|gif|css|js)(\?|$)/i.test(parsed.pathname) ||
      href.includes("#")
    )
      continue;

    const textTokens = new Set(normalizeTitle(text));
    if (textTokens.size === 0) continue;
    let hits = 0;
    for (const t of queryTokens) if (textTokens.has(t)) hits += 1;
    const coverage = queryTokens.length ? hits / queryTokens.length : 0;
    if (coverage < 0.6) continue; // nav links / unrelated posts die here

    let score = coverage;
    if (year && (text.includes(year) || href.includes(year))) score += 0.2;
    score -= Math.min(0.1, text.length / 4000); // prefer tight matches
    out.push({ url: href.split("#")[0], score });
  }
  // Keep the best per URL.
  const best = new Map<string, number>();
  for (const c of out) {
    const prev = best.get(c.url);
    if (prev === undefined || c.score > prev) best.set(c.url, c.score);
  }
  return Array.from(best.entries())
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ─── In-memory result cache (per instance) ───────────────────────────────────
interface CacheEntry {
  at: number;
  url: string | null;
  method: "direct" | "search";
  searchUrl: string | null;
}
const RESOLVE_TTL = 10 * 60_000;
const resolveCache = new Map<string, CacheEntry>();

function cacheKey(parts: (string | undefined)[]): string {
  return parts.filter((p) => p !== undefined && p !== "").join("|");
}

// ─── Universal-embed verification (2Embed) ─────────────────────────────────
// 2Embed answers HTTP 200 for TMDB ids it does NOT have — the iframe mounts,
// fires onLoad, and plays nothing (the exact "loads but never plays" bug).
// Availability oracle: the OUTER page title. Inner /embed pages mirror TMDB
// metadata for ANY existing TMDB id ("Toxic (2026)" even with no servers),
// but outer pages name only playable titles:
//   /movie/{id}  hit: "Inception (2010) - 2Embed"   miss: " () - 2Embed"
//   /tv/{id}     hit: "Breaking Bad - TvShow - 2Embed"
//                miss: "Unknown TV Show - TvShow - 2Embed"
// So: verify the outer route, then return the inner embed URL to mount.
function twoembedOuterUrl(embedUrl: string): string | null {
  const m = embedUrl.match(
    /^(https?:\/\/[^/]*2embed\.cc)\/embed(?:tv)?\/(\d+)/i,
  );
  if (!m) return null;
  const [, base, id] = m;
  return /\/embedtv\//i.test(embedUrl)
    ? `${base}/tv/${id}`
    : `${base}/movie/${id}`;
}
const TWOEMBED_EMBED_URL_RE =
  /https?:\/\/[^\s"'<>]*2embed\.cc\/embed(?:tv)?\/[^\s"'<>]+/i;

async function verifyUniversalEmbed(
  provider: Provider,
  url: string,
): Promise<CacheEntry> {
  if (provider.urlPattern === "tmdb-path") {
    // VidLink-style routes: status codes are a real availability oracle.
    // The embed plays exactly when the route answers 200; missing titles and
    // broken TV routes answer 404/500 (observed live). A transient failure
    // (network error) must NOT be cached as a miss — fail open instead, so
    // an embed that might play is still tried by the player.
    try {
      const res = await fetchText(url, 7_000);
      if (res && res.status === 200 && res.html && !looksLikeNotFound(res.html))
        return { at: Date.now(), url, method: "direct", searchUrl: null };
      if (res === null)
        return { at: Date.now(), url, method: "direct", searchUrl: null }; // fail open
    } catch {
      return { at: Date.now(), url, method: "direct", searchUrl: null }; // fail open
    }
    return { at: Date.now(), url: null, method: "direct", searchUrl: null };
  }
  if (provider.urlPattern !== "2embed") {
    // Other id-routed providers: no server-verifiable existence check — the
    // embed is authoritative.
    return { at: Date.now(), url, method: "direct", searchUrl: null };
  }
  if (!TWOEMBED_EMBED_URL_RE.test(url)) {
    return { at: Date.now(), url: null, method: "direct", searchUrl: null };
  }
  const outer = twoembedOuterUrl(url);
  if (!outer) {
    return { at: Date.now(), url: null, method: "direct", searchUrl: null };
  }
  try {
    const res = await fetchText(outer, 7_000);
    const raw = res?.html.match(/<title>([^<]*)<\/title>/i)?.[1] || "";
    // Strip the " - 2Embed" / " - TvShow - 2Embed" suffixes, then decide.
    const titleText = raw.replace(/-\s*2Embed.*$/i, "").trim();
    const isUnknownShow = /^unknown tv show/i.test(titleText);
    const hasName = /\w/.test(titleText.replace(/[()]/g, " "));
    const ok =
      !!res &&
      res.status === 200 &&
      !!res.html &&
      !looksLikeNotFound(res.html) &&
      !isUnknownShow &&
      hasName;
    if (ok) {
      // The inner embed URL is what the watch page mounts.
      return { at: Date.now(), url, method: "direct", searchUrl: null };
    }
  } catch {
    // network failure — treat as unverifiable miss
  }
  return { at: Date.now(), url: null, method: "direct", searchUrl: null };
}

// ─── Search-index fallback ─────────────────────────────────────────────
// When the provider's own search is unreachable (Cloudflare-class blocks hit
// datacenter IPs first), DuckDuckGo's HTML endpoint can still reveal the
// provider's post URL via a `site:` query. Fails soft — this is extra
// coverage, not a dependency.
async function searchIndexCandidates(
  domain: string,
  title: string,
): Promise<string[]> {
  const out: string[] = [];
  const query = encodeURIComponent(`site:${domain} "${title}"`);
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${query}`,
    `https://lite.duckduckgo.com/lite/?q=${query}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(endpoint, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8" },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const html = await res.text();
      const linkRe = /(?:href="|uddg=)(https?%3A%2F%2F|https?:\/\/)[^"]*"/gi;
      const matches = html.match(linkRe) || [];
      for (const raw of matches) {
        let candidate = raw
          .replace(/^href="/, "")
          .replace(/^uddg=/, "")
          .replace(/"$/, "");
        if (candidate.includes("uddg=")) {
          try {
            const u = new URL(`https://duckduckgo.com/?${candidate}`);
            candidate = u.searchParams.get("uddg") || "";
          } catch {
            continue;
          }
        }
        try {
          const parsed = new URL(candidate);
          if (
            parsed.hostname.replace(/^www\./, "") ===
            domain.replace(/^https?:\/\//, "").replace(/^www\./, "")
          ) {
            out.push(candidate.toString());
          }
        } catch {
          // skip malformed
        }
      }
      if (out.length > 0) break;
    } catch {
      // try next endpoint
    }
  }
  return Array.from(new Set(out)).slice(0, 3);
}

// ─── Handler ─────────────────────────────────────────────────────────────────
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
  const title =
    typeof req.query.title === "string" ? req.query.title.slice(0, 200) : "";
  const year = /^(\d{4})$/.test(String(req.query.year || ""))
    ? String(req.query.year)
    : "";
  const season = /^\d+$/.test(String(req.query.season || ""))
    ? String(req.query.season)
    : "";
  const episode = /^\d+$/.test(String(req.query.episode || ""))
    ? String(req.query.episode)
    : "";

  const provider = findProviderById(providerId);
  if (!provider || !id) {
    return res
      .status(400)
      .json({ ok: false, reason: "Valid providerId and id are required" });
  }

  // Base domain: prefer the client's live-discovered domain, fall back to the
  // operator-configured default (hdhub4u) or the registry embedBase.
  let base: string | null = null;
  const clientBase =
    typeof req.query.base === "string" ? req.query.base.trim() : "";
  if (clientBase) {
    try {
      const parsed = new URL(
        clientBase.startsWith("http") ? clientBase : `https://${clientBase}`,
      );
      if (
        /^https?:$/.test(parsed.protocol) &&
        isPublicHostname(parsed.hostname)
      ) {
        base = parsed.origin;
      }
    } catch {
      // ignore malformed client base
    }
  }
  if (!base && providerId === "hdhub4u") {
    const env = (process.env.NEXT_PUBLIC_STREAM_URL || "").trim();
    if (/^https?:\/\//i.test(env)) base = env.replace(/\/+$/, "");
  }
  if (!base && provider.embedBase) base = provider.embedBase;

  const naiveUrl =
    base === null
      ? null
      : type === "movie"
        ? `${base}/movie/${id}`
        : season && episode
          ? `${base}/tv/${id}/${season}/${episode}`
          : `${base}/tv/${id}`;
  const searchUrl =
    base === null || !title ? null : `${base}/?s=${encodeURIComponent(title)}`;

  // Universal id-routed embeds: verify the exact embed URL the watch page will
  // mount (2Embed's /embed page exposes availability server-side; vidlink has
  // no such signal and stays authoritative for its id routes).
  if (provider.urlPattern) {
    const embedUrl = buildEmbedUrl(
      provider,
      type as "movie" | "tv",
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );
    if (!embedUrl) {
      return res.status(200).json({ ok: false, url: null, method: "direct" });
    }
    const uKey = cacheKey([providerId, type, id, season, episode]);
    const cachedU = resolveCache.get(uKey);
    if (cachedU && Date.now() - cachedU.at < RESOLVE_TTL) {
      return res.status(200).json({
        ok: !!cachedU.url,
        url: cachedU.url,
        method: cachedU.method,
        cached: true,
      });
    }
    const verdict = await verifyUniversalEmbed(provider, embedUrl);
    resolveCache.set(uKey, verdict);
    return res
      .status(200)
      .json({ ok: !!verdict.url, url: verdict.url, method: verdict.method });
  }

  // Serve from cache when fresh.
  const key = cacheKey([providerId, type, id, season, episode, base || ""]);
  const cached = resolveCache.get(key);
  if (cached && Date.now() - cached.at < RESOLVE_TTL) {
    return res.status(200).json({
      ok: !!cached.url,
      url: cached.url,
      method: cached.method,
      searchUrl: cached.searchUrl,
      cached: true,
    });
  }

  if (!base) {
    return res.status(200).json({
      ok: false,
      reason: "no-base",
      url: null,
      searchUrl: null,
    });
  }

  // 1) Does the naive id-based URL actually exist?
  if (naiveUrl) {
    const direct = await fetchText(naiveUrl, 7_000);
    if (
      direct &&
      direct.status === 200 &&
      !looksLikeNotFound(direct.html) &&
      // WordPress shells answer 200 for ANY id route with an identical
      // homepage — require the page to actually carry the title when known.
      // Redirected (parked) domains and squatter guide pages are rejected
      // outright regardless of title length.
      !looksLikeShellPage(direct.html, direct.finalUrl, naiveUrl) &&
      pageMentionsTitle(direct.html, title, year)
    ) {
      const entry: CacheEntry = {
        at: Date.now(),
        url: naiveUrl,
        method: "direct",
        searchUrl,
      };
      resolveCache.set(key, entry);
      return res
        .status(200)
        .json({ ok: true, url: naiveUrl, method: "direct", searchUrl });
    }
  }

  // 2) Title search on the provider site.
  if (searchUrl && title) {
    const tokens = normalizeTitle(title);
    const searchHtml = await fetchText(searchUrl, 9_000);
    if (searchHtml && searchHtml.status === 200 && searchHtml.html) {
      let candidates = extractCandidates(searchHtml.html, base, tokens, year);
      if (candidates.length === 0 && type === "tv" && season) {
        // Retry: season packs are often titled "<Title> Season N".
        const seasonQuery = `${title} season ${season}`;
        const alt = await fetchText(
          `${base}/?s=${encodeURIComponent(seasonQuery)}`,
          8_000,
        );
        if (alt && alt.status === 200 && alt.html) {
          candidates = extractCandidates(
            alt.html,
            base,
            normalizeTitle(seasonQuery),
            year,
          );
        }
      }
      // Verify the top candidates until one is a real page.
      for (const candidate of candidates) {
        const page = await fetchText(candidate.url, 7_000);
        if (
          page &&
          page.status === 200 &&
          !looksLikeNotFound(page.html) &&
          !looksLikeShellPage(page.html, page.finalUrl, candidate.url) &&
          pageMentionsTitle(page.html, title, year)
        ) {
          const entry: CacheEntry = {
            at: Date.now(),
            url: candidate.url,
            method: "search",
            searchUrl,
          };
          resolveCache.set(key, entry);
          return res.status(200).json({
            ok: true,
            url: candidate.url,
            method: "search",
            searchUrl,
          });
        }
      }
    }
  }

  // 2b) Search-index fallback (site-scoped) — extra coverage when the
  // provider's own search endpoint is blocked to datacenter IPs.
  if (title && base) {
    const domain = new URL(base).hostname;
    const indexed = await searchIndexCandidates(domain, title);
    for (const candidate of indexed) {
      const page = await fetchText(candidate, 7_000);
      if (
        page &&
        page.status === 200 &&
        !looksLikeNotFound(page.html) &&
        !looksLikeShellPage(page.html, page.finalUrl, candidate) &&
        pageMentionsTitle(page.html, title, year)
      ) {
        const entry: CacheEntry = {
          at: Date.now(),
          url: candidate,
          method: "search",
          searchUrl,
        };
        resolveCache.set(key, entry);
        return res
          .status(200)
          .json({ ok: true, url: candidate, method: "search", searchUrl });
      }
    }
  }

  // 3) Not found on this provider.
  const entry: CacheEntry = {
    at: Date.now(),
    url: null,
    method: "search",
    searchUrl,
  };
  resolveCache.set(key, entry);
  return res
    .status(200)
    .json({ ok: false, url: null, method: "search", searchUrl });
}
