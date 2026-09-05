// Direct-stream extraction for the videm.xyz universal player.
//
// videm.xyz is the HLS player behind 2Embed's default server (the 2embed
// /embed page hands off to https://videm.xyz/embed/movie|tv/{tmdb}). Unlike
// the iframe path — click-gated, ad-layered, impossible to verify server-side
// — videm exposes a small API that returns REAL multi-quality HLS manifests
// with CORS wide open:
//
//   1. GET /embed/{type}/{tmdb}[/{s}/{e}]  → HTML containing `var Q = {...}`
//      with a signed token `t` and the server list (refs).
//   2. GET /api.php?a=play&ref={ref}&t={t} → {"url":"/_stream?id=…","type":"hls"}
//      (or a cap.php signed gateway URL — same shape, CORS-open masters).
//   3. The returned master playlist carries 720p/1080p variants and plays
//      directly in our CustomPlayer (hls.js) through /api/proxy/media.
//
// Everything here is plain fetch + AbortController timeouts so it runs in
// serverless (the /api/providers/extract endpoint) without a browser.

const VIDEM_BASE = "https://videm.xyz";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface VidemStream {
  url: string;
  kind: "hls" | "mp4" | "unknown";
  source: "api";
  label?: string;
}

export interface VidemDirectResult {
  streams: VidemStream[];
  /** resolved embed page url that was used (for diagnostics) */
  embedUrl: string | null;
}

/** Providers whose watch-page URL is id-routed and that can therefore use
 *  the videm direct extractor as their real-stream source. */
export const VIDEM_DIRECT_PROVIDERS = new Set([
  "videm",
  "twoembed",
  "vidlink",
  "vidsrc",
]);

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

async function fetchText(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<string | null> {
  const res = await fetchWithTimeout(url, timeoutMs, { headers });
  if (!res || !res.ok) return null;
  return res.text();
}

/** Fetch the player page and pull the embedded `var Q = {…}` state. */
async function fetchPlayerState(
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): Promise<{
  token: string;
  imdbId: string;
  qType: string;
  s: number;
  e: number;
  refs: { ref: string; name?: string }[];
  embedUrl: string;
} | null> {
  const embedUrl =
    type === "movie"
      ? `${VIDEM_BASE}/embed/movie/${id}`
      : `${VIDEM_BASE}/embed/tv/${id}/${season || 1}/${episode || 1}`;
  const html = await fetchText(embedUrl, 10_000, {
    "user-agent": UA,
    accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
  });
  if (!html) return null;

  // The player page embeds its state as:  var Q = {…};
  const qMatch = html.match(/\bvar Q\s*=\s*(\{[\s\S]*?\});/);
  if (!qMatch) return null;

  let Q: any = null;
  try {
    Q = JSON.parse(qMatch[1]);
  } catch {
    // tolerate malformed embedded JSON — fall back to regex fields below
  }

  const grab = (re: RegExp) => html.match(re)?.[1] ?? "";
  const token = (Q && typeof Q.t === "string" && Q.t) || grab(/"t":"([^"]+)"/);
  const qType = (Q && Q.type) || grab(/"type":"([^"]+)"/) || type;
  const imdbId = (Q && Q.id) || grab(/"id":"([^"]+)"/) || String(id);
  const s = Q && typeof Q.s === "number" ? Q.s : 0;
  const e = Q && typeof Q.e === "number" ? Q.e : 0;

  let refs: { ref: string; name?: string }[] = [];
  if (Q && Array.isArray(Q.ssr?.servers)) {
    refs = Q.ssr.servers
      .filter((srv: any) => srv && typeof srv.ref === "string")
      .map((srv: any) => ({ ref: srv.ref, name: srv.name }));
  }
  // Fallback: scan the raw HTML for the first refs if Q parsing failed.
  if (refs.length === 0) {
    const re = /"ref":"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && refs.length < 3) {
      refs.push({ ref: m[1] });
    }
  }

  if (!token || refs.length === 0) return null;
  return { token, imdbId, qType, s, e, refs, embedUrl };
}

/** Refresh the server list when the embedded SSR payload has none. */
async function fetchServerRefs(state: {
  token: string;
  imdbId: string;
  qType: string;
  s: number;
  e: number;
  embedUrl: string;
}): Promise<{ ref: string; name?: string }[] | null> {
  const qs = `type=${state.qType}&id=${encodeURIComponent(state.imdbId)}&s=${state.s}&e=${state.e}`;
  const body = await fetchText(`${VIDEM_BASE}/api.php?a=sources&${qs}`, 8_000, {
    "user-agent": UA,
    accept: "application/json, text/javascript, */*; q=0.01",
    origin: VIDEM_BASE,
    referer: state.embedUrl,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  });
  if (!body) return null;
  try {
    const data = JSON.parse(body);
    if (data?.status === "ok" && Array.isArray(data.servers)) {
      return data.servers
        .filter((srv: any) => srv && typeof srv.ref === "string")
        .map((srv: any) => ({ ref: srv.ref, name: srv.name }));
    }
  } catch {
    // not JSON — no servers available
  }
  return null;
}

/** Mint a playable URL for one server ref. */
async function fetchPlayUrl(
  state: { token: string; embedUrl: string },
  ref: string,
): Promise<{ url: string; type: string } | null> {
  const body = await fetchText(
    `${VIDEM_BASE}/api.php?a=play&ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(state.token)}`,
    10_000,
    {
      "user-agent": UA,
      accept: "application/json, text/javascript, */*; q=0.01",
      origin: VIDEM_BASE,
      referer: state.embedUrl,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
  );
  if (!body) return null;
  try {
    const data = JSON.parse(body);
    if (data && typeof data.url === "string" && data.url) {
      return {
        url: data.url,
        type: typeof data.type === "string" ? data.type : "hls",
      };
    }
  } catch {
    // not JSON — no playable url for this ref
  }
  return null;
}

/**
 * Resolve direct HLS/mp4 stream URLs for a title through the videm player.
 * Returns an empty streams array (never throws) when the title has no
 * playable source — callers fall back to their existing embed path.
 */
export async function fetchVidemDirect(
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): Promise<VidemDirectResult> {
  const state = await fetchPlayerState(type, id, season, episode);
  if (!state) return { streams: [], embedUrl: null };

  let refs = state.refs;
  if (refs.length === 0) {
    const fresh = await fetchServerRefs(state);
    if (fresh) refs = fresh;
  }
  if (refs.length === 0) return { streams: [], embedUrl: state.embedUrl };

  // Mint URLs for up to 3 servers in parallel; the first success usually
  // wins the watch page's HEAD content-type check.
  const results: (VidemStream | null)[] = await Promise.all(
    refs.slice(0, 3).map(async (srv, i) => {
      const play = await fetchPlayUrl(state, srv.ref);
      if (!play) return null;
      let url: string;
      try {
        url = new URL(play.url, `${VIDEM_BASE}/`).toString();
      } catch {
        return null;
      }
      const kind: VidemStream["kind"] =
        play.type === "hls" ? "hls" : play.type === "mp4" ? "mp4" : "unknown";
      const stream: VidemStream = {
        url,
        kind,
        source: "api",
        label: srv.name || `VidEm Server ${i + 1}`,
      };
      return stream;
    }),
  );

  const streams = results.filter((r): r is VidemStream => r !== null);
  return { streams, embedUrl: state.embedUrl };
}
