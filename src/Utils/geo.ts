// Geo detection — the server reads the visitor's country from Vercel's edge
// geo headers (x-vercel-ip-country) so the client never needs a third-party
// IP lookup. Result is cached per browser session: home rows fetch it once
// and reuse it for regional TMDB queries and localized labels.
export interface GeoInfo {
  /** ISO 3166-1 alpha-2, e.g. "IN", "DE", "CN". Never null — defaults to US. */
  country: string;
  /** Human-readable country/region name when the edge provides one. */
  regionName?: string;
  source: "edge" | "fallback";
}

let memo: GeoInfo | null = null;
let inflight: Promise<GeoInfo> | null = null;

const SESSION_KEY = "OpenStreamGeo";

function readSession(): GeoInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.country === "string" &&
      parsed.country.length === 2
    )
      return parsed as GeoInfo;
  } catch {
    // sessionStorage unavailable — just fetch again
  }
  return null;
}

function writeSession(info: GeoInfo) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
  } catch {
    // non-fatal
  }
}

export async function fetchGeo(): Promise<GeoInfo> {
  if (memo) return memo;
  if (typeof window === "undefined")
    return { country: "US", source: "fallback" };
  const cached = readSession();
  if (cached) {
    memo = cached;
    return cached;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/geo", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`geo ${res.status}`);
      const data = (await res.json()) as GeoInfo;
      if (!data?.country || data.country.length !== 2)
        throw new Error("bad geo");
      memo = data;
      writeSession(data);
      return data;
    } catch {
      // Offline / API hiccup: fall back to worldwide rows, never block the UI.
      memo = { country: "US", source: "fallback" };
      return memo;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Synchronous best-effort read (session cache only). */
export function getCachedGeo(): GeoInfo | null {
  if (memo) return memo;
  const cached = readSession();
  if (cached) memo = cached;
  return memo;
}
