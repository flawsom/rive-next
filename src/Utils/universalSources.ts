// Universal TMDB-id embed builders for the watch page.
//
// These embeds play ANY title instantly from its TMDB id — no site search,
// no Cloudflare-blocked scraping — so playback never depends on whether a
// title happens to exist on a specific provider site. They return plain
// iframe URLs (the watch page decides embed vs direct via content sniffing).
import { findProviderById, buildEmbedUrl } from "./providers";

export interface UniversalSource {
  id: string;
  name: string;
  url: string;
}

// 2Embed first — the only universal whose availability is server-verifiable;
// videm is the direct-HLS tier behind 2Embed's default server, vidlink the
// id-routed fallback, vidsrc stays last (unreachable from serverless, so it
// fails fast through the standard verify pipeline).
const UNIVERSAL_IDS = ["twoembed", "videm", "vidlink", "vidsrc"];

export function getUniversalSources(
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): UniversalSource[] {
  const out: UniversalSource[] = [];
  for (const pid of UNIVERSAL_IDS) {
    const provider = findProviderById(pid);
    if (!provider) continue;
    const url = buildEmbedUrl(provider, type, id, season, episode);
    if (url) out.push({ id: pid, name: provider.name, url });
  }
  return out;
}

export function getUniversalSource(id: string): UniversalSource | null {
  const provider = findProviderById(id);
  if (!provider || !provider.urlPattern || !provider.embedBase) return null;
  return { id, name: provider.name, url: provider.embedBase };
}
