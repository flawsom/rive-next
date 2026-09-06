import { APPROVED_PROVIDER_IDS } from "./providers";
import type { ProviderManifest } from "./providerManifest";

/**
 * Autonomous Domain Discovery & Resolution Service
 *
 * Fetches live extension data from CloudStream repos (Phisher + CSX),
 * discovers working domains through HTTP probing + subdomain enumeration,
 * persists to localStorage, and auto-refreshes on a background interval.
 *
 * The system ensures streaming/download URLs always point to working domains
 * even when providers change domains or subdomains.
 */

// ─── Types ──────────────────────────────────────────────────────────────────
export interface DomainCandidate {
  url: string;
  provider: string;
  latency: number;
  available: boolean;
  /** True when the domain serves a real /sitemap.xml (strong real-site signal). */
  sitemap?: boolean;
  lastVerified: number;
  source: "repo" | "pattern" | "subdomain" | "fallback";
}

export interface DomainDiscoveryResult {
  provider: string;
  workingDomains: DomainCandidate[];
  lastDiscovery: number;
  nextCheck: number;
  repoVersion?: number;
}

export interface ProviderDomainMap {
  [providerId: string]: DomainDiscoveryResult;
}

// ─── CloudStream Repo URLs ───────────────────────────────────────────────────
const REPOS = [
  {
    name: "Phisher",
    pluginsUrl:
      "https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json",
    repoJsonUrl:
      "https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/repo.json",
  },
  {
    name: "CSX",
    pluginsUrl:
      "https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/plugins.json",
    repoJsonUrl:
      "https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/CS.json",
  },
];

// ─── Known base domains for each provider ────────────────────────────────────
// These are the canonical domains plus known mirrors/alternatives
// Current live hdhub4u base URLs (operator-verified). These are only ever
// used as *seeds*: every page URL built from them still passes the resolver's
// server-side verification (real movie page, not a parked/CF shell) before
// anything mounts, so an unreachable seed degrades to auto-switch, never to a
// dead player.
const HDHUB4U_SEED_DOMAINS = [
  // .ms is the live catalog domain as of Sept 6, 2026 (the site's own SEO
  // pages point at it; CF-walled to datacenter IPs — the resolver's reader
  // fallback handles that). .tv/.bi remain as alternates; hdhub.cfd is live
  // but challenge-hangs on deep pages, so it stays last.
  "hdhub4u.ms",
  "hdhub4u.tv",
  "hdhub4u.bi",
  "new1.hdhub4u.cl",
  "hdhub4u.com",
];

const PROVIDER_DOMAINS: Record<string, string[]> = {
  hdhub4u: [
    "hdhub4u.ms",
    "hdhub4u.tv",
    "hdhub4u.bi",
    "new1.hdhub4u.cl",
    "hdhub4u.how",
    "hdhub4u.com",
    "www.hdhub4u.com",
    "hdhub4u.mx",
    "hdhub.cfd",
    "hdhub4u.nocensor.cloud",
    "hdhub4u.unblockninja.com",
    "hdhub4u.mrunblock.buzz",
    "hdhub4u Unblock",
    "hdhub4u.proxy",
  ],
  fourkhdhub: [
    "4khdhub.com",
    "www.4khdhub.com",
    "4khdhub.nocensor.cloud",
    "4khdhub.unblockit.pages.dev",
  ],
  moviesdrive: [
    "moviesdrive.com",
    "www.moviesdrive.com",
    "moviesdrive.nocensor.cloud",
    "moviesdrive.unblockit.pages.dev",
    "moviesdrive.unblockninja.com",
    "moviesdrive.mrunblock.buzz",
  ],
  bollyflix: [
    "bollyflix.com",
    "www.bollyflix.com",
    "bollyflix.nocensor.cloud",
    "bollyflix.unblockit.pages.dev",
  ],
  vegamovies: [
    "vegamovies.com",
    "www.vegamovies.com",
    "vegamovies.nocensor.cloud",
    "vegamovies.unblockit.pages.dev",
    "luxmovies.com",
    "www.luxmovies.com",
    "rogmovies.com",
    "www.rogmovies.com",
  ],
  cinestream: [
    "cinestream.com",
    "www.cinestream.com",
    "cinestream.nocensor.cloud",
  ],
  multimovies: [
    "multimovies.com",
    "www.multimovies.com",
    "multimovies.nocensor.cloud",
  ],
  moviebox: ["moviebox.com", "www.moviebox.com", "moviebox.nocensor.cloud"],
  streamplay: [
    "streamplay.com",
    "www.streamplay.com",
    "streamplay.nocensor.cloud",
  ],
  kisskh: ["kisskh.co", "www.kisskh.co", "kisskh.nocensor.cloud"],
  showbox: ["showbox.com", "www.showbox.com", "showbox.nocensor.cloud"],
  idlix: ["idlix.com", "www.idlix.com", "idlix.nocensor.cloud"],
  anichi: [
    "anichi.to",
    "www.anichi.to",
    "anichi.nocensor.cloud",
    "allanime.to",
    "www.allanime.to",
    "allanime.day",
  ],
  anidb: ["anidb.net", "www.anidb.net"],
  anikage: ["anikage.cc", "www.anikage.cc"],
  anikoto: ["anikototv.to", "www.anikototv.to", "anikoto.tv"],
  anilight: ["anilight.com", "www.anilight.com"],
  animepahe: [
    "animepahe.ru",
    "animepahe.com",
    "www.animepahe.com",
    "animepahe.nocensor.cloud",
  ],
  anineko: ["anineko.net", "www.anineko.net"],
  anizone: ["anizone.to", "www.anizone.to"],
  kickassanime: [
    "kickassanime.sx",
    "www.kickassanime.sx",
    "kickassanime.rs",
    "www.kickassanime.rs",
  ],
  onepace: ["onepace.net", "www.onepace.net"],
  allwish: ["all-wish.me", "www.all-wish.me"],
  animedekho: ["animedekho.app", "www.animedekho.app"],
  animedubhindi: ["animedubhindi.cc", "www.animedubhindi.cc"],
  animekhor: ["animekhor.org", "www.animekhor.org"],
  animesalt: ["animesalt.ac", "www.animesalt.ac"],
  animenosub: ["animenosub.to", "www.animenosub.to"],
  animexin: ["animexin.dev", "www.animexin.dev"],
  dorabash: ["dorabash.in", "www.dorabash.in"],
  kartoons: ["kartoons.me", "www.kartoons.me"],
  desicinemas: ["desicinemas.to", "www.desicinemas.to"],
  goojara: ["goojara.com", "www.goojara.com", "goojara.to"],
  banglaplex: ["banglaplex.click", "www.banglaplex.click"],
  cinefreak: ["cinefreak.com", "www.cinefreak.com"],
  layarkaca: ["layarkaca21.lk21.do", "lk21.am.in"],
  movierulz: ["movierulz.com", "www.movierulz.com"],
  fivemovierulz: ["5movierulz.com", "www.5movierulz.com"],
  netcinez: ["netcinez.com", "www.netcinez.com"],
  megakino: ["megakino.vip", "www.megakino.vip"],
  aniworld: ["aniworld.to", "www.aniworld.to"],
  pencurimovie: ["pencurimovie.cc", "www.pencurimovie.cc"],
  pinoymoviepedia: ["pinoymoviepedia.com", "www.pinoymoviepedia.com"],
  moviesmod: [
    "moviesmod.com",
    "www.moviesmod.com",
    "topmovies.com",
    "www.topmovies.com",
  ],
};

// ─── Storage keys ────────────────────────────────────────────────────────────
const STORAGE_KEY = "openstream_domain_discovery";
const STORAGE_VERSION_KEY = "openstream_domain_discovery_version";
const STORAGE_DOMAIN_MAP_KEY = "openstream_live_domain_map";

// ─── Cache ───────────────────────────────────────────────────────────────────
const discoveryCache: ProviderDomainMap = {};
let lastFullScan = 0;
let scanInProgress = false;
const FULL_SCAN_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DOMAIN_TEST_TIMEOUT = 4000; // 4 seconds per domain test
const STORAGE_VERSION = 2;

// ─── Live domain map (provider ID → working URL) ─────────────────────────────
let liveDomainMap: Record<string, string> = {};

// ─── Subdomain enumeration patterns ──────────────────────────────────────────
const SUBDOMAIN_PREFIXES = [
  "",
  "www.",
  "m.",
  "app.",
  "api.",
  "stream.",
  "watch.",
  "play.",
  "embed.",
  "cdn.",
  "static.",
  "media.",
  "s1.",
  "s2.",
  "s3.",
  "v1.",
  "v2.",
];

const TLD_EXTENSIONS = [
  ".com",
  ".net",
  ".org",
  ".to",
  ".cc",
  ".app",
  ".me",
  ".in",
];

// ─── localStorage persistence ────────────────────────────────────────────────
function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(STORAGE_DOMAIN_MAP_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === STORAGE_VERSION) {
        liveDomainMap = parsed.domains || {};
        lastFullScan = parsed.lastScan || 0;
      }
    }
    // Also load individual discovery caches
    const cacheData = localStorage.getItem(STORAGE_KEY);
    if (cacheData) {
      const parsed = JSON.parse(cacheData);
      Object.entries(parsed).forEach(([key, value]) => {
        discoveryCache[key] = value as DomainDiscoveryResult;
      });
    }
  } catch {
    // Silently ignore storage errors
  }
}

function saveToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    // Save live domain map
    localStorage.setItem(
      STORAGE_DOMAIN_MAP_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        domains: liveDomainMap,
        lastScan: lastFullScan,
      }),
    );
    // Save individual caches
    localStorage.setItem(STORAGE_KEY, JSON.stringify(discoveryCache));
  } catch {
    // Silently ignore storage errors (quota exceeded, etc.)
  }
}

// Initialize on load
if (typeof window !== "undefined") {
  loadFromStorage();
}

// ─── Manifest hydration (autonomous domain pool updates) ────────────────────
// The provider manifest is generated server-side from the CloudStream repos
// (commit watcher + Kotlin source parser). These functions merge newly
// discovered domains into the probe pool and invalidate stale probe caches.
let manifestHydrationPromise: Promise<void> | null = null;
let manifestHydratedAt = 0;
const MANIFEST_HYDRATE_INTERVAL = 10 * 60 * 1000;

/**
 * Merge manifest-discovered domains into the probe pool.
 * Only providers in the approved registry are accepted.
 * New domains invalidate that provider's probe cache so the next discovery
 * round re-probes with the expanded pool, then re-promotes the best domain.
 */
export function hydrateDomainsFromManifest(
  manifest: ProviderManifest | null,
): void {
  if (!manifest || !Array.isArray(manifest.providers)) return;
  let changed = false;

  for (const provider of manifest.providers) {
    if (!APPROVED_PROVIDER_IDS.has(provider.id)) continue;
    if (!Array.isArray(provider.domains) || provider.domains.length === 0) {
      continue;
    }
    if (!PROVIDER_DOMAINS[provider.id]) {
      PROVIDER_DOMAINS[provider.id] = [];
    }
    const existing = new Set(PROVIDER_DOMAINS[provider.id]);
    let added = 0;
    for (const domain of provider.domains) {
      const normalized = domain.toLowerCase().replace(/\/+$/, "");
      if (
        !normalized ||
        !normalized.includes(".") ||
        normalized.includes(" ")
      ) {
        continue;
      }
      if (!existing.has(normalized)) {
        PROVIDER_DOMAINS[provider.id].push(normalized);
        existing.add(normalized);
        added += 1;
      }
    }
    if (added > 0) {
      changed = true;
      // Force re-probe with the expanded domain pool.
      delete discoveryCache[provider.id];
    }
  }

  if (changed) {
    saveToStorage();
    // Re-promote the best verified domain now that the pool changed.
    autoUpdateStreamingUrl().catch(() => {});
  }
}

async function syncManifestFromRoute(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const response = await fetch("/api/providers/manifest?action=get", {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return;
    const manifest: ProviderManifest | null = await response.json();
    if (!manifest) return;
    hydrateDomainsFromManifest(manifest);
    manifestHydratedAt = Date.now();
  } catch {
    // Network failure — the next call will retry.
  }
}

/**
 * Pull the latest manifest into the probe pool at most once per interval.
 * Concurrent callers share a single in-flight sync.
 */
export function ensureManifestHydrated(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (Date.now() - manifestHydratedAt < MANIFEST_HYDRATE_INTERVAL) {
    return Promise.resolve();
  }
  if (manifestHydrationPromise) return manifestHydrationPromise;
  manifestHydrationPromise = syncManifestFromRoute().finally(() => {
    manifestHydrationPromise = null;
  });
  return manifestHydrationPromise;
}

// ─── HTTP Probing ────────────────────────────────────────────────────────────
/**
 * Direct reachability probe (used server-side or when the verified probe
 * endpoint is unavailable). With no-cors the response is opaque, so this only
 * proves the host answered at all.
 */
async function directProbe(
  url: string,
  timeoutMs: number,
): Promise<{ available: boolean; latency: number; sitemap?: boolean }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return { available: true, latency: Date.now() - start };
  } catch {
    return { available: false, latency: Infinity };
  }
}

/**
 * Verified probe: in the browser this goes through the server-side probe API,
 * which follows redirects and reports the real HTTP status + latency, so
 * parked/error pages and unresponsive hosts are not treated as "available".
 */
async function testDomain(
  url: string,
  timeoutMs = DOMAIN_TEST_TIMEOUT,
): Promise<{ available: boolean; latency: number; sitemap?: boolean }> {
  if (typeof window !== "undefined") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs + 3_000);
      const response = await fetch("/api/providers/domains?action=probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) {
        const data: any = await response.json();
        const reachable =
          typeof data.status === "number" &&
          data.status >= 200 &&
          data.status < 400 &&
          typeof data.latency === "number" &&
          data.latency > 0;
        return {
          available: reachable,
          latency: reachable ? data.latency : Infinity,
          // Real WordPress movie sites expose sitemaps; parked landers and
          // challenge stubs don't. Prefer sitemap-bearing domains.
          sitemap: reachable ? !!data.sitemap : false,
        };
      }
    } catch {
      // Fall back to a direct reachability probe
    }
  }
  return directProbe(url, timeoutMs);
}

// ─── Repo Fetching ───────────────────────────────────────────────────────────
interface PluginEntry {
  url: string;
  status: number;
  version: number;
  name: string;
  internalName: string;
  description?: string;
  language?: string;
  tvTypes?: string[];
  iconUrl?: string;
}

async function fetchPluginsFromRepo(repoUrl: string): Promise<PluginEntry[]> {
  try {
    const response = await fetch(repoUrl, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Extract domain from a URL string
 */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Extract domains from plugin icon URLs and metadata
 */
function extractDomainsFromPlugins(
  plugins: PluginEntry[],
): Record<string, string[]> {
  const domainsByProvider: Record<string, string[]> = {};

  for (const plugin of plugins) {
    if (plugin.status !== 1) continue; // Skip inactive plugins

    const domains: string[] = [];

    // Extract domain from iconUrl
    if (plugin.iconUrl) {
      const domain = extractDomain(plugin.iconUrl);
      if (
        domain &&
        !domain.includes("google.com") &&
        !domain.includes("github.com") &&
        !domain.includes("raw.githubusercontent.com")
      ) {
        domains.push(domain);
      }
    }

    if (domains.length > 0) {
      const key =
        plugin.internalName?.toLowerCase() || plugin.name?.toLowerCase() || "";
      if (key) {
        domainsByProvider[key] = domains;
      }
    }
  }

  return domainsByProvider;
}

// ─── Subdomain Enumeration ───────────────────────────────────────────────────
function generateSubdomainCandidates(baseDomain: string): string[] {
  const candidates: string[] = [];
  const parts = baseDomain.split(".");

  if (parts.length < 2) return candidates;

  const domain = parts[parts.length - 2];
  const tld = parts[parts.length - 1];

  // Generate subdomain variations
  for (const prefix of SUBDOMAIN_PREFIXES) {
    const subdomain = `${prefix}${domain}.${tld}`;
    if (subdomain !== baseDomain) {
      candidates.push(subdomain);
    }
  }

  return candidates;
}

// ─── Main Discovery Engine ───────────────────────────────────────────────────

/**
 * Discover all working domains for a specific provider
 */
export async function discoverDomains(
  providerId: string,
): Promise<DomainDiscoveryResult> {
  // Hydrate the domain pool from the autonomous manifest before probing.
  // Bounded so a slow first manifest build never blocks a discovery round.
  await Promise.race([
    ensureManifestHydrated(),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);

  // Check cache first (valid for 15 minutes)
  const cached = discoveryCache[providerId];
  if (cached && Date.now() - cached.lastDiscovery < FULL_SCAN_INTERVAL) {
    return cached;
  }

  const allCandidates: string[] = [];

  // 1. Get known domain patterns
  const knownDomains = PROVIDER_DOMAINS[providerId] || [];
  allCandidates.push(...knownDomains);

  // 2. Try to extract from repo plugin data
  try {
    for (const repo of REPOS) {
      const plugins = await fetchPluginsFromRepo(repo.pluginsUrl);
      const pluginDomains = extractDomainsFromPlugins(plugins);

      // Match by provider ID or name
      const pluginKeys = Object.keys(pluginDomains);
      for (let ki = 0; ki < pluginKeys.length; ki++) {
        const key = pluginKeys[ki];
        if (key.includes(providerId) || providerId.includes(key)) {
          allCandidates.push(...pluginDomains[key]);
        }
      }
    }
  } catch {
    // Repo fetch failed, continue with known domains
  }

  // 3. Generate subdomain candidates for each known domain
  const subdomainCandidates: string[] = [];
  for (const domain of knownDomains) {
    const hostname = extractDomain(
      domain.startsWith("http") ? domain : `https://${domain}`,
    );
    if (hostname) {
      subdomainCandidates.push(...generateSubdomainCandidates(hostname));
    }
  }
  allCandidates.push(...subdomainCandidates);

  // Deduplicate
  const uniqueCandidates = Array.from(new Set(allCandidates)).filter(
    (d) => d && !d.includes(" ") && d.includes("."),
  );

  // Test all candidates in parallel (with concurrency limit)
  const workingDomains: DomainCandidate[] = [];
  const BATCH_SIZE = 8;

  for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
    const batch = uniqueCandidates.slice(i, i + BATCH_SIZE);
    const tests = batch.map(async (domain) => {
      const url = domain.startsWith("http") ? domain : `https://${domain}`;
      const { available, latency, sitemap } = await testDomain(url);
      return {
        url,
        provider: providerId,
        latency,
        available,
        sitemap,
        lastVerified: Date.now(),
        source: knownDomains.includes(domain)
          ? ("pattern" as const)
          : subdomainCandidates.includes(domain)
            ? ("subdomain" as const)
            : ("repo" as const),
      };
    });

    const results = await Promise.all(tests);
    results
      .filter((r) => r.available)
      // Real sites with sitemaps rank above anonymous 200 shells.
      .sort((a, b) => {
        if (!!a.sitemap !== !!b.sitemap) return a.sitemap ? -1 : 1;
        return a.latency - b.latency;
      })
      .forEach((r) => workingDomains.push(r));
  }

  const result: DomainDiscoveryResult = {
    provider: providerId,
    workingDomains,
    lastDiscovery: Date.now(),
    nextCheck: Date.now() + FULL_SCAN_INTERVAL,
  };

  // Update cache
  discoveryCache[providerId] = result;

  // Update live domain map
  if (workingDomains.length > 0) {
    liveDomainMap[providerId] = workingDomains[0].url;
  }

  // Persist
  saveToStorage();

  return result;
}

/**
 * Get the best working domain for a provider
 * Falls back to cached live domain map, then to defaults
 */
export async function getBestDomain(
  providerId: string,
): Promise<string | null> {
  // 1. Fresh discovery with verified probes
  try {
    const discovery = await discoverDomains(providerId);
    if (discovery.workingDomains.length > 0) {
      return discovery.workingDomains[0].url;
    }
  } catch {
    // Discovery failed
  }

  // 2. Fall back to cached live domain map
  if (liveDomainMap[providerId]) {
    return liveDomainMap[providerId];
  }

  // 3. Only the operator-configured default may be used without a probe
  if (providerId === "hdhub4u") {
    return normalizeConfiguredBaseUrl(process.env.NEXT_PUBLIC_STREAM_URL);
  }

  return null;
}

/**
 * Get cached domain instantly (no async, for synchronous code paths)
 */
/**
 * Normalize an operator-configured base URL (https://…, no trailing slash).
 * Static known-domain lists are used as probe candidates for discovery,
 * never as verified playback endpoints.
 */
function normalizeConfiguredBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim();
  if (!/^https?:\/\//i.test(normalized)) return null;
  return normalized.replace(/\/+$/, "");
}

/**
 * Operator-configured base URL (NEXT_PUBLIC_STREAM_URL), falling back to the
 * current verified hdhub4u seed mirrors. Everything built from these is still
 * verification-gated before mounting (see /api/providers/resolve), so a stale
 * seed can never mount a dead player — it just feeds the auto-switch pipeline.
 */
export function getConfiguredSeedBaseUrl(providerId: string): string | null {
  const configured = normalizeConfiguredBaseUrl(
    process.env.NEXT_PUBLIC_STREAM_URL,
  );
  if (configured) return configured;
  if (providerId === "hdhub4u") {
    return normalizeConfiguredBaseUrl(HDHUB4U_SEED_DOMAINS[0]);
  }
  return null;
}

export function getCachedDomain(providerId: string): string | null {
  if (liveDomainMap[providerId]) {
    return liveDomainMap[providerId];
  }
  const cached = discoveryCache[providerId];
  if (cached?.workingDomains?.length > 0) {
    return cached.workingDomains[0].url;
  }
  // Seeds are verification-gated upstream, so they're safe as a last resort.
  return getConfiguredSeedBaseUrl(providerId);
}

/**
 * Discover all providers' domains in background
 */
export async function discoverAllDomains(): Promise<ProviderDomainMap> {
  const providerIds = Object.keys(PROVIDER_DOMAINS);
  const results: ProviderDomainMap = {};

  // Test all providers with concurrency
  const discoveries = providerIds.map(async (id) => {
    const result = await discoverDomains(id);
    return { id, result };
  });

  const settled = await Promise.all(
    discoveries.map((d) =>
      d
        .then((v) => ({ ok: true as const, id: v.id, result: v.result }))
        .catch(() => ({ ok: false as const, id: "", result: null })),
    ),
  );

  settled.forEach((settlement) => {
    if (settlement.ok) {
      results[settlement.id] = settlement.result!;
    }
  });

  lastFullScan = Date.now();
  saveToStorage();

  return results;
}

/**
 * Auto-update the active streaming URL from live repo discovery.
 * Checks the default pair (HDHub4U then MoviesDrive) and promotes the best
 * verified domain into the live map, persisting it for the whole app.
 * Called on page load, on failure fallback, and by the background refresher.
 */
export async function autoUpdateStreamingUrl(): Promise<{
  updated: boolean;
  newUrl: string | null;
  provider: string;
  previousUrl: string | null;
}> {
  const providers = ["hdhub4u", "moviesdrive"];

  for (const pid of providers) {
    const previousUrl = getCachedDomain(pid);
    const bestDomain = await getBestDomain(pid);

    if (bestDomain && bestDomain !== previousUrl) {
      liveDomainMap[pid] = bestDomain;
      saveToStorage();
      return {
        updated: true,
        newUrl: bestDomain,
        provider: pid,
        previousUrl: previousUrl || null,
      };
    }
  }

  const active = getCachedDomain("hdhub4u");
  return {
    updated: false,
    newUrl: active,
    provider: "hdhub4u",
    previousUrl: active,
  };
}

/**
 * Get domain discovery status for all providers
 */
export function getDiscoveryStatus(): Record<
  string,
  {
    workingDomains: number;
    lastCheck: number;
    nextCheck: number;
    bestDomain: string | null;
    liveUrl: string | null;
  }
> {
  const status: Record<string, any> = {};

  // Include both cached and live map
  const allProviderIds = new Set([
    ...Object.keys(discoveryCache),
    ...Object.keys(liveDomainMap),
    ...Object.keys(PROVIDER_DOMAINS),
  ]);

  allProviderIds.forEach((providerId) => {
    const cached = discoveryCache[providerId];
    status[providerId] = {
      workingDomains: cached?.workingDomains?.length || 0,
      lastCheck: cached?.lastDiscovery || 0,
      nextCheck: cached?.nextCheck || 0,
      bestDomain: cached?.workingDomains?.[0]?.url || null,
      liveUrl: liveDomainMap[providerId] || null,
    };
  });

  return status;
}

/**
 * Force refresh domain discovery for a provider
 */
export async function forceRefresh(
  providerId: string,
): Promise<DomainDiscoveryResult> {
  // Clear cache for this provider
  delete discoveryCache[providerId];
  delete liveDomainMap[providerId];
  saveToStorage();
  return discoverDomains(providerId);
}

/**
 * Record that a domain failed (for fallback tracking)
 */
export function recordDomainFailure(
  providerId: string,
  failedUrl: string,
): void {
  const cached = discoveryCache[providerId];
  if (cached) {
    // Mark this specific domain as failed
    cached.workingDomains = cached.workingDomains.filter(
      (d) => d.url !== failedUrl,
    );

    // Update live domain map if the failed one was the active one
    if (liveDomainMap[providerId] === failedUrl) {
      liveDomainMap[providerId] = cached.workingDomains[0]?.url || "";
    }

    saveToStorage();
  }
}

/**
 * Record that a domain succeeded (update latency)
 */
export function recordDomainSuccess(
  providerId: string,
  url: string,
  latency: number,
): void {
  const cached = discoveryCache[providerId];
  if (cached) {
    const domain = cached.workingDomains.find((d) => d.url === url);
    if (domain) {
      domain.latency = latency;
      domain.lastVerified = Date.now();
      domain.available = true;
    } else {
      // Add as a new working domain
      cached.workingDomains.push({
        url,
        provider: providerId,
        latency,
        available: true,
        lastVerified: Date.now(),
        source: "fallback",
      });
    }

    // Sort by latency
    cached.workingDomains.sort((a, b) => a.latency - b.latency);

    // Update live domain map
    if (cached.workingDomains.length > 0) {
      liveDomainMap[providerId] = cached.workingDomains[0].url;
    }

    saveToStorage();
  }
}

/**
 * Add new domain patterns for a provider (called when new mirrors are discovered)
 */
export function addDomainPatterns(
  providerId: string,
  patterns: string[],
): void {
  if (!PROVIDER_DOMAINS[providerId]) {
    PROVIDER_DOMAINS[providerId] = [];
  }

  // Add unique patterns
  patterns.forEach((pattern) => {
    if (!PROVIDER_DOMAINS[providerId].includes(pattern)) {
      PROVIDER_DOMAINS[providerId].push(pattern);
    }
  });

  // Clear cache to force re-discovery
  delete discoveryCache[providerId];
  saveToStorage();
}

/**
 * Get all known domain patterns
 */
export function getDomainPatterns(): Record<string, string[]> {
  return { ...PROVIDER_DOMAINS };
}

/**
 * Start background auto-refresh interval
 * Called once on app startup
 */
let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoRefresh(intervalMs = FULL_SCAN_INTERVAL): void {
  if (typeof window === "undefined") return;
  if (refreshInterval) return; // Already running

  refreshInterval = setInterval(async () => {
    if (scanInProgress) return;
    scanInProgress = true;

    try {
      // Refresh the primary providers (hdhub4u and moviesdrive)
      const priorityProviders = [
        "hdhub4u",
        "moviesdrive",
        "fourkhdhub",
        "bollyflix",
      ];
      for (const pid of priorityProviders) {
        delete discoveryCache[pid];
        await discoverDomains(pid);
      }
      // Promote the best verified domain into the live map
      await autoUpdateStreamingUrl();
    } catch {
      // Silent fail for background refresh
    } finally {
      scanInProgress = false;
    }
  }, intervalMs);
}

/**
 * Stop background auto-refresh
 */
export function stopAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

/**
 * Get the live domain map (provider ID → best working URL)
 * This is the fastest way to get a URL for any provider
 */
export function getLiveDomainMap(): Record<string, string> {
  return { ...liveDomainMap };
}

/**
 * Resolve the best URL for streaming content
 * Returns the working embed URL for a given provider + content type + IDs
 */
export function resolveStreamUrl(
  providerId: string,
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): string | null {
  const domain = getCachedDomain(providerId);
  if (!domain) return null;

  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  if (type === "movie") {
    return `${baseUrl}/movie/${id}`;
  } else if (season && episode) {
    return `${baseUrl}/tv/${id}/${season}/${episode}`;
  }
  return null;
}

/**
 * Resolve the best URL for downloading content
 */
export function resolveDownloadUrl(
  providerId: string,
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): string | null {
  const domain = getCachedDomain(providerId);
  if (!domain) return null;

  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  if (type === "movie") {
    return `${baseUrl}/download/${id}`;
  } else if (season && episode) {
    return `${baseUrl}/download/${id}/season/${season}/episode/${episode}`;
  }
  return null;
}

/**
 * Return the best currently configured/verified streaming URL,
 * or null when the operator has not configured a source.
 */
export function getActiveStreamUrl(): string | null {
  return getCachedDomain("hdhub4u");
}

// Auto-start refresh when module loads in browser
if (typeof window !== "undefined") {
  // Start with a small delay to avoid blocking initial page load
  setTimeout(() => {
    startAutoRefresh(FULL_SCAN_INTERVAL);
    autoUpdateStreamingUrl().catch(() => {});
  }, 5000);
}
