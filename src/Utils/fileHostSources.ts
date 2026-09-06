// Direct-file extraction from WordPress-class catalog providers (HDHub4U,
// MoviesDrive, Bollyflix, …) and their file hosts (HubCloud, FSL, GDFlix…).
//
// Why this tier exists: those catalog sites sit behind aggressive
// Cloudflare/anti-bot walls that block datacenter IPs (verified live Sept 6:
// hdhub4u.tv/.bi → 403 challenge, post pages → infinite challenge loop).
// The user's browser gets through fine, but serverless never will. Two
// consequences drive the design here:
//
//   1. Page fetches fall back to a keyless reader proxy (r.jina.ai) that
//      renders pages through Cloudflare and returns the real HTML. It is
//      best-effort (rate-limited, slow) — always tried AFTER a direct fetch
//      fails, and every failure is soft.
//   2. The valuable part of a catalog post is NOT the page — it's the file
//      hosts it links to (hubcloud.*, fsl servers, gdflix…). Those hosts
//      answer direct fetches fine, and their /file|/link|/dl routes redirect
//      to the actual signed media file. A cheap Range-probe (bytes=0-1)
//      follows the redirect, observes the real content-type, and yields the
//      DIRECT playable URL — which then plays in our own CustomPlayer with
//      zero ads (no provider page, no embed, no click-gates).
//
// Everything is plain fetch + AbortController (serverless-safe) and fails
// soft: callers always have their embed/universal tier to fall back to.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const READER_BASE = "https://r.jina.ai/";
const READER_TIMEOUT = 12_000;
const DIRECT_TIMEOUT = 9_000;

// ─── Cloudflare / anti-bot detection ────────────────────────────────────────
export function looksLikeChallenge(status: number, html: string): boolean {
  if (status === 403 || status === 503 || status === 429) return true;
  if (!html) return true;
  const head = html.slice(0, 4000).toLowerCase();
  return (
    /just a moment|attention required|cf-?challenge|challenge-platform/.test(
      head,
    ) || /<title>\s*(just a moment|loading\.\.\.)\s*<\/title>/.test(head)
  );
}

/**
 * Fetch a page through the keyless reader proxy (renders through Cloudflare).
 * Returns real HTML or null — never throws. Anonymous tier is rate-limited,
 * so callers must treat every null as "keep going with other strategies".
 */
export async function fetchThroughReader(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READER_TIMEOUT);
    const res = await fetch(`${READER_BASE}${url}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,*/*;q=0.8",
        "x-return-format": "html",
      },
    });
    clearTimeout(timer);
    if (!res.ok || res.status === 429) return null;
    const text = await res.text();
    if (!text || text.length < 400) return null;
    // Reader errors come back as JSON envelopes — reject those.
    const trimmed = text.slice(0, 80);
    if (trimmed.startsWith('{"data"') || trimmed.startsWith('{"code"'))
      return null;
    return text;
  } catch {
    return null;
  }
}

/** Direct fetch first; on a challenge/blocked/failed response, the reader. */
export async function fetchPageSmart(url: string): Promise<{
  html: string;
  via: "direct" | "reader";
  /** URL after redirects — the requested URL when served via the reader. */
  finalUrl: string;
} | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT);
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
    const status = res.status;
    const finalUrl = res.url || url;
    const html = res.ok ? await res.text() : "";
    if (status === 200 && html && !looksLikeChallenge(status, html)) {
      return { html, via: "direct", finalUrl };
    }
  } catch {
    // fall through to the reader
  }
  const html = await fetchThroughReader(url);
  return html ? { html, via: "reader", finalUrl: url } : null;
}

// ─── Range probe: does this URL actually serve video? ───────────────────────
export interface ProbeVerdict {
  ok: boolean;
  /** Final URL after redirects — the real signed file URL on file hosts. */
  finalUrl: string;
  contentType: string;
  kind: "hls" | "mp4" | "webm" | null;
}

/**
 * Range-probe a URL server-side (follows redirects, 1-byte fetch).
 * Accepts only responses that actually look like video: video/* content
 * types, HLS manifests, or octet-stream with a media filename. HTML answers
 * (a wrong/interstitial page) are rejected — they can never play.
 */
export async function probeDirectMedia(
  url: string,
  refererPage: string,
): Promise<ProbeVerdict> {
  const fail = (finalUrl = url): ProbeVerdict => ({
    ok: false,
    finalUrl,
    contentType: "",
    kind: null,
  });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        // 1-byte range: enough for headers, negligible bandwidth.
        range: "bytes=0-1",
        accept: "*/*",
        referer: refererPage,
      },
    });
    clearTimeout(timer);
    const finalUrl = res.url || url;
    const contentType = (
      res.headers.get("content-type") ||
      res.headers.get("content-disposition") ||
      ""
    ).toLowerCase();
    if (!(res.status === 200 || res.status === 206)) return fail(finalUrl);
    if (
      !/video\/|mpegurl|application\/octet-stream|attachment/.test(contentType)
    )
      return fail(finalUrl);
    // Reject pages that merely pretend (text/html masquerade).
    if (/text\/html/.test(contentType)) return fail(finalUrl);
    const kind: ProbeVerdict["kind"] = /mpegurl/.test(contentType)
      ? "hls"
      : /webm/.test(contentType)
        ? "webm"
        : "mp4";
    // Drain the tiny body politely.
    try {
      await res.arrayBuffer();
    } catch {
      /* body already consumed or closed */
    }
    return { ok: true, finalUrl, contentType, kind };
  } catch {
    return fail();
  }
}

// ─── Catalog post → file-host links ─────────────────────────────────────────
// HDHub4U-class posts list their quality variants as anchor buttons to
// HubCloud/FSL/GDFlix pages. The valuable anchors: same-route file links on
// OTHER hosts (never the catalog site itself, never nav/images).
const FILE_ROUTE_RE = /\/(file|link|dl|play|download)\/[^/"'?]+/i;
const FILE_HOST_RE =
  /(hubcloud|hubdrive|gdflix|gdfx|fsl\.|fslinker|drivesharer|flixdrive|filepress|filemoon|streamtape|dood|gofile|krakenfiles|gbot|gub|medic|vlink|hdhub4u.*(file|link))/i;
const CATALOG_QUALITY_RE =
  /(2160p|1080p|720p|480p|360p|4k|hdtc|hdrip|web-?dl)/i;

function qualityRank(text: string): number {
  const t = text.toLowerCase();
  let rank = 0;
  if (/2160p|4k/.test(t)) rank += 40;
  else if (/1080p/.test(t)) rank += 32;
  else if (/720p/.test(t)) rank += 24;
  else if (/480p/.test(t)) rank += 16;
  else if (/360p/.test(t)) rank += 8;
  if (/web-?dl|webrip/.test(t)) rank += 6;
  else if (/bluray|brrip|bdrip/.test(t)) rank += 5;
  else if (/hdr/.test(t)) rank += 3;
  else if (/hdrip|hdtc|pre-?hd/.test(t)) rank += 2;
  if (/hevc/.test(t)) rank += 1;
  return rank;
}

export interface FileHostLink {
  url: string;
  label: string;
  rank: number;
}

/** Pull candidate file-host links out of a catalog post page. */
export function extractFileHostLinks(
  html: string,
  pageUrl: string,
): FileHostLink[] {
  const out: FileHostLink[] = [];
  const seen = new Set<string>();
  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    /* keep empty */
  }
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,220}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null && out.length < 10) {
    const href = m[1];
    const label = m[2]
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
    let abs: string;
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(abs);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(parsed.protocol)) continue;
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === pageHost) continue; // nav links stay on the catalog site
    const isFileRoute = FILE_ROUTE_RE.test(parsed.pathname);
    const isFileHost = FILE_HOST_RE.test(host);
    if (!isFileRoute && !isFileHost) continue;
    if (
      /facebook|twitter|whatsapp|telegram|instagram|youtube|t\.me/i.test(host)
    )
      continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({
      url: abs,
      label: label || host,
      rank: qualityRank(`${label} ${abs}`),
    });
  }
  // Best quality first, then original page order (stable for equal ranks).
  return out
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.rank - a.l.rank || a.i - b.i)
    .map(({ l }) => l)
    .slice(0, 4);
}

// ─── Direct-stream candidates for the watch page ────────────────────────────
export interface DirectFileCandidate {
  url: string;
  kind: "hls" | "mp4" | "webm";
  source: "api";
  label?: string;
}

// In-memory cache per serverless instance: catalog post → candidates (10 min).
const candidateCache = new Map<
  string,
  { at: number; streams: DirectFileCandidate[] }
>();
const CANDIDATE_TTL = 10 * 60_000;

/**
 * Extract DIRECT, ad-free media URLs for a catalog post page:
 *   post page (CF-smart fetch) → file-host links (HubCloud/FSL/…) →
 *   Range-probe each route → keep URLs that really serve video.
 * The probe's FINAL url (post-redirect) is what plays — those are signed
 * direct-file endpoints, not embeds.
 */
export async function extractCatalogDirectStreams(
  pageUrl: string,
): Promise<DirectFileCandidate[]> {
  const key = pageUrl.split("?")[0];
  const cached = candidateCache.get(key);
  if (cached && Date.now() - cached.at < CANDIDATE_TTL) return cached.streams;

  const streams: DirectFileCandidate[] = [];

  // 1) The post page itself (direct → reader fallback for CF walls).
  const page = await fetchPageSmart(pageUrl);
  if (page?.html) {
    // 1a. Inline media URLs in the page (rare but real).
    const inline =
      page.html.match(
        /https?:\/\/[^\s"'<>()\\]{10,400}?\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>()\\]{0,200})?/gi,
      ) || [];
    for (const raw of inline.slice(0, 5)) {
      const v = await probeDirectMedia(raw, pageUrl);
      if (v.ok && v.kind) {
        streams.push({ url: v.finalUrl, kind: v.kind, source: "api" });
      }
    }
    // 1b. File-host buttons (HubCloud/FSL/GDFlix routes) — the main prize.
    const links = extractFileHostLinks(page.html, pageUrl);
    for (const link of links.slice(0, 3)) {
      // The file-host PAGE may itself redirect straight to the file, or may
      // be an interstitial listing its own /file routes — probe it first.
      const v = await probeDirectMedia(link.url, pageUrl);
      if (v.ok && v.kind) {
        streams.push({
          url: v.finalUrl,
          kind: v.kind,
          source: "api",
          label: link.label,
        });
        continue;
      }
      // Interstitial: fetch the host page (direct works for file hosts) and
      // probe ITS file routes.
      const inner = await fetchPageSmart(link.url);
      if (!inner?.html) continue;
      const innerLinks = extractFileHostLinks(inner.html, link.url);
      // Prefer inner routes on the SAME host (signed gateways), best-first.
      for (const innerLink of innerLinks.slice(0, 3)) {
        const v2 = await probeDirectMedia(innerLink.url, link.url);
        if (v2.ok && v2.kind) {
          streams.push({
            url: v2.finalUrl,
            kind: v2.kind,
            source: "api",
            label: `${link.label} • ${innerLink.label}`.slice(0, 90),
          });
        }
        if (streams.length >= 6) break;
      }
      if (streams.length >= 6) break;
    }
  }

  // Dedupe by final URL.
  const seen = new Set<string>();
  const unique = streams.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  candidateCache.set(key, { at: Date.now(), streams: unique });
  return unique;
}
