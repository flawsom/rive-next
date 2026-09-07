// VidLink direct-stream adapter (server-side only).
//
// Reverse-engineered Sept 7, 2026 from vidlink.pro's public player bundle,
// after their player began refusing ANY sandboxed iframe ("Sandbox is not
// allowed" — their code probes plugin availability, which browsers disable
// inside every sandboxed frame). Unsandboxing their embed would reintroduce
// the popup/redirect ad vectors we deliberately removed, so instead we no
// longer need their player at all: we mint their streams server-side and
// play them in OUR ad-free custom player.
//
// The mint chain (verified live against production):
//   1. `GET https://vidlink.pro/fu.wasm` — a Go program whose exported
//      `getAdv(tmdbId)` derives an opaque id token. It calls
//      `sodium.crypto_secretbox_easy(message, nonce, key)` (XSalsa20-Poly1305)
//      through the wasm_exec glue — we provide a pure-JS sodium shim
//      (goWasmRuntime.js → installGoSodiumShim), so no native crypto is needed.
//   2. `GET /api/b/movie/{token}?multiLang=0`
//      (tv: `/api/b/tv/{token}/{season}/{episode}?multiLang=0`)
//      with header `X-Playback-Environment: standard` → the stream map.
//   3. mp4 qualities marked `requiresProxy` are served through
//      `https://noon.mooncase.online/mp{path}?{signed params}&headers={json}&host={origin}`
//      (their own client does this rewrite). That proxy is Cloudflare-gated:
//      datacenter IPs get 403, residential browsers pass — so the player must
//      mount it browser-direct (`cors-allowed` in the mint metadata) and every
//      server-side liveness probe is meaningless → `noServerProbe`.
//
// Because the .wasm is fetched live per boot, upstream secret rotations are
// absorbed automatically — the same property that keeps the videm tier alive.
import { GoWasm, installGoSodiumShim } from "@/Utils/goWasmRuntime";

const VIDLINK_ORIGIN = "https://vidlink.pro";
const WASM_URL = `${VIDLINK_ORIGIN}/fu.wasm`;
const STREAM_PROXY_ORIGIN = "https://noon.mooncase.online";
// Their client only forwards these playlist params through the proxy; the
// rest (utm junk, cache busters) is stripped. `sign`/`t` are the CDN signature.
const PRESERVED_QUERY_KEYS = new Set([
  "auth",
  "expires",
  "hash",
  "key",
  "sign",
  "t",
  "token",
]);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface VidlinkStream {
  url: string;
  /** hls | dash | mp4 */
  kind: string;
  source: "api";
  label: string;
  bytes?: number;
  rank?: number;
  /** Upstream is Cloudflare-gated to browser IPs — a server HEAD would
   *  falsely kill it. The player mounts it directly; the client skips both
   *  the extraction liveness pass and its own proxy HEAD for these. */
  noServerProbe?: boolean;
}

export interface VidlinkDirectResult {
  streams: VidlinkStream[];
  embedUrl: string | null;
}

type GetAdv = (id: string) => string | null;

interface BootedRuntime {
  getAdv: GetAdv;
  bootedAt: number;
}

let runtimeBoot: Promise<BootedRuntime | null> | null = null;
let wasmBytes: Uint8Array | null = null;
let wasmFetchedAt = 0;
// Refetch the wasm once a day (warm lambdas keep the compiled instance; a
// fresh process picks up a rotated build on its next cold start anyway).
const WASM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: "*/*",
        referer: `${VIDLINK_ORIGIN}/`,
        ...(headers || {}),
      },
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

async function loadWasmBytes(): Promise<Uint8Array | null> {
  if (wasmBytes && Date.now() - wasmFetchedAt < WASM_MAX_AGE_MS) {
    return wasmBytes;
  }
  const res = await fetchWithTimeout(WASM_URL, 12_000);
  if (!res || !res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 100_000) return null; // error page, not the 2.4MB program
  wasmBytes = buf;
  wasmFetchedAt = Date.now();
  return wasmBytes;
}

async function waitForGetAdv(timeoutMs = 8_000): Promise<GetAdv | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fn = (globalThis as { getAdv?: GetAdv }).getAdv;
    if (typeof fn === "function") return fn;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function bootRuntime(): Promise<BootedRuntime | null> {
  installGoSodiumShim();
  const bytes = await loadWasmBytes();
  if (!bytes) return null;
  try {
    const go = new GoWasm();
    const { instance } = await WebAssembly.instantiate(
      bytes as unknown as BufferSource,
      go.importObject,
    );
    // Go's runtime hands control back when main() parks; the exported
    // getAdv appears on globalThis shortly after.
    const runPromise = go.run(instance);
    const getAdv = await waitForGetAdv();
    void runPromise.catch(() => {
      // The program parks forever; a normal exit only happens on teardown.
    });
    if (!getAdv) return null;
    return { getAdv, bootedAt: Date.now() };
  } catch {
    return null;
  }
}

async function getRuntime(): Promise<BootedRuntime | null> {
  if (!runtimeBoot) {
    runtimeBoot = bootRuntime().catch(() => null);
  }
  const booted = await runtimeBoot;
  if (!booted) {
    // A failed boot (CDN hiccup, partial fetch) must not poison the warm
    // lambda forever — clear it so the next request retries.
    runtimeBoot = null;
    return null;
  }
  return booted;
}

/**
 * Faithful port of vidlink's client URL rewrite (their module 5196): signed
 * CDN files are only servable through their relay
 * `{origin}/{kind}{path}?{preserved params}&headers={json}&host={origin}`.
 * Returns null for anything that is not a plain http(s) URL.
 */
function buildStreamProxyUrl(
  rawUrl: string,
  headers: Record<string, string> | null | undefined,
  kind: "mp" | "proxy" | "sacdn",
): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.username || u.password || u.hash) return null;
    const preserved = u.search
      .slice(1)
      .split("&")
      .filter(Boolean)
      .filter((pair) => {
        const key = pair.split("=")[0];
        try {
          return PRESERVED_QUERY_KEYS.has(
            decodeURIComponent(key.replaceAll("+", " ")).toLowerCase(),
          );
        } catch {
          return PRESERVED_QUERY_KEYS.has(key.toLowerCase());
        }
      });
    const headersJson = JSON.stringify(headers || {});
    const search = [
      ...preserved,
      `headers=${encodeURIComponent(headersJson)}`,
      `host=${encodeURIComponent(u.origin)}`,
    ].join("&");
    return `${STREAM_PROXY_ORIGIN}/${kind}${u.pathname}?${search}`;
  } catch {
    return null;
  }
}

interface VidlinkQuality {
  type?: string;
  url?: string;
  codecName?: string;
  size?: string;
  headers?: Record<string, string>;
  requiresProxy?: boolean;
}

interface VidlinkApiResponse {
  sourceId?: string;
  stream?: {
    id?: string;
    type?: string;
    deliveryType?: string;
    qualities?: Record<string, VidlinkQuality>;
    playlist?: string;
    playlistHeaders?: Record<string, string>;
    requiresProxy?: boolean;
    alternates?: Array<{
      qualities?: Record<string, VidlinkQuality>;
      playlist?: string;
      playlistHeaders?: Record<string, string>;
      requiresProxy?: boolean;
      deliveryType?: string;
    }>;
  };
}

/** Mint VidLink's direct streams for a TMDB id (movies) or id/s/e (TV). */
export async function fetchVidlinkDirect(
  type: "movie" | "tv",
  id: string,
  season?: number,
  episode?: number,
): Promise<VidlinkDirectResult> {
  const embedUrl =
    type === "movie"
      ? `${VIDLINK_ORIGIN}/movie/${id}`
      : `${VIDLINK_ORIGIN}/tv/${id}/${season || 1}/${episode || 1}`;
  try {
    const runtime = await getRuntime();
    if (!runtime) return { streams: [], embedUrl };
    const token = runtime.getAdv(String(id));
    if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
      return { streams: [], embedUrl };
    }
    const apiPath =
      type === "movie"
        ? `/api/b/movie/${token}?multiLang=0`
        : `/api/b/tv/${token}/${season || 1}/${episode || 1}?multiLang=0`;
    const res = await fetchWithTimeout(`${VIDLINK_ORIGIN}${apiPath}`, 10_000, {
      "x-playback-environment": "standard",
    });
    if (!res || !res.ok) return { streams: [], embedUrl };
    const text = await res.text();
    if (!text || text === "null") return { streams: [], embedUrl };
    let payload: VidlinkApiResponse;
    try {
      payload = JSON.parse(text) as VidlinkApiResponse;
    } catch {
      return { streams: [], embedUrl };
    }
    const stream = payload?.stream;
    if (!stream) return { streams: [], embedUrl };

    const out: VidlinkStream[] = [];
    const pushQualities = (q: VidlinkApiResponse["stream"]) => {
      const qualities = q?.qualities || {};
      for (const [qualityLabel, quality] of Object.entries(qualities)) {
        if (!quality || quality.type !== "mp4" || !quality.url) continue;
        const url = quality.requiresProxy
          ? buildStreamProxyUrl(quality.url, quality.headers, "mp")
          : quality.url;
        if (!url) continue;
        const bytes = Number(quality.size) || undefined;
        const rankNum = Number(qualityLabel) || 0;
        // Rank ONLY top-rung files (≥1080p): these lead even over the videm
        // HLS ladders. Sub-1080 rungs must NOT carry a rank — the old
        // behavior let a 360p file outrank another tier's 1080p ABR ladder
        // (the curated e2e caught Dark Knight/Inception regressing to
        // VidLink 360p). Unranked rungs fall back to kind-then-bytes order.
        out.push({
          url,
          kind: "mp4",
          source: "api",
          label: `VidLink ${qualityLabel}p${
            quality.codecName ? ` ${quality.codecName}` : ""
          }`,
          bytes,
          rank: rankNum >= 1080 ? rankNum : undefined,
          noServerProbe: true,
        });
      }
      // HLS/DASH playlists (some titles serve manifests instead of files).
      if (q?.playlist) {
        const kind = q.deliveryType === "dash" ? "dash" : "hls";
        const url = q.requiresProxy
          ? buildStreamProxyUrl(
              q.playlist,
              q.playlistHeaders,
              q.playlistHeaders?.cookie ? "sacdn" : "proxy",
            )
          : q.playlist;
        if (url) {
          out.push({
            url,
            kind,
            source: "api",
            label: "VidLink HLS",
            noServerProbe: true,
          });
        }
      }
    };
    pushQualities(stream);
    for (const alt of stream.alternates || []) {
      pushQualities(alt as VidlinkApiResponse["stream"]);
    }
    return { streams: out.slice(0, 6), embedUrl };
  } catch {
    return { streams: [], embedUrl };
  }
}
