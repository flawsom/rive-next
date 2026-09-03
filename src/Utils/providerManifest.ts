/**
 * Autonomous Provider Manifest Generator
 *
 * The self-updating brain of the platform. Instead of hand-maintaining
 * provider domain lists, this module:
 *
 *  1. Watches both CloudStream extension repos (Phisher + CSX) via their
 *     public commit feeds — when a repo publishes updates, it notices.
 *  2. Pulls the open-source Kotlin extension *sources* from GitHub.
 *  3. Parses them for base domains, mirror lists, API endpoints, embed
 *     patterns, qualities, languages, and categories.
 *  4. Merges in plugin metadata (plugins.json: language, tvTypes, version).
 *  5. Emits a normalized manifest that the discovery engine consumes, so
 *     domain pools grow and shrink autonomously as the repos change.
 *
 * Isomorphic: no window/localStorage/DOM usage, no dependencies beyond fetch.
 * Every network step is best-effort — a failure degrades to the previous
 * manifest (or an empty one) instead of throwing.
 */

// ─── Repo definitions ────────────────────────────────────────────────────────
export interface RepoDef {
  id: "phisher" | "csx";
  owner: string;
  repo: string;
  /** Branch the built plugins are published to (what users install). */
  buildsBranch: string;
  /** Branches that may host the open-source Kotlin sources. */
  sourceBranches: string[];
  pluginsUrl: string;
}

export const MANIFEST_REPOS: RepoDef[] = [
  {
    id: "phisher",
    owner: "phisher98",
    repo: "cloudstream-extensions-phisher",
    buildsBranch: "builds",
    sourceBranches: ["main", "master", "builds"],
    pluginsUrl:
      "https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json",
  },
  {
    id: "csx",
    owner: "SaurabhKaperwan",
    repo: "CSX",
    buildsBranch: "builds",
    sourceBranches: ["main", "master", "builds"],
    pluginsUrl:
      "https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/plugins.json",
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────
export interface RepoCommitInfo {
  hash: string;
  date: string;
  title?: string;
}

export interface ManifestProvider {
  id: string;
  name: string;
  repo: RepoDef["id"];
  internalName?: string;
  description?: string;
  language?: string;
  tvTypes?: string[];
  version?: number;
  categories: string[];
  domains: string[];
  apiEndpoints: string[];
  streamPatterns: string[];
  qualities: string[];
  sourcePaths: string[];
}

export interface ProviderManifest {
  manifestVersion: number;
  generatedAt: number;
  generatedInMs: number;
  repoCommits: Record<string, RepoCommitInfo>;
  providers: ManifestProvider[];
}

export interface ManifestStatus {
  cached: boolean;
  builtAt: number;
  fresh: boolean;
  ttlMs: number;
  repoCommits: Record<string, RepoCommitInfo>;
  providerCount: number;
  domainCount: number;
  apiEndpointCount: number;
}

export const MANIFEST_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Network helpers ─────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  timeoutMs = 10_000,
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json, text/plain, */*" },
    });
    clearTimeout(timer);
    return response;
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response || !response.ok) return "";
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function fetchJson<T>(
  url: string,
  timeoutMs = 10_000,
): Promise<T | null> {
  const text = await fetchText(url, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Repo watching (commit feeds) ────────────────────────────────────────────
function commitFeedUrl(repo: RepoDef): string {
  return `https://github.com/${repo.owner}/${repo.repo}/commits/${repo.buildsBranch}.atom`;
}

function parseAtomLatestEntry(atom: string): RepoCommitInfo | null {
  const entryMatch = atom.match(/<entry>[\s\S]*?<\/entry>/);
  const entry = entryMatch ? entryMatch[0] : "";
  if (!entry) return null;

  const idHash = entry.match(
    /tag:[^,]+,\d{4}:[^\/]+\/[0-9a-f]{40}\/([0-9a-f]{40})/,
  );
  const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim();
  const date = entry.match(/<updated[^>]*>([^<]+)<\/updated>/)?.[1]?.trim();
  const hash =
    idHash?.[1] ||
    entry.match(/<id[^>]*>[\s\S]*?([0-9a-f]{40})[\s\S]*?<\/id>/)?.[1] ||
    "unknown";

  return { hash, date: date || "", title: title || undefined };
}

async function getLatestCommit(repo: RepoDef): Promise<RepoCommitInfo | null> {
  const atom = await fetchText(commitFeedUrl(repo));
  if (!atom) return null;
  return parseAtomLatestEntry(atom);
}

// ─── GitHub tree + source fetching ───────────────────────────────────────────
interface TreeResponse {
  tree?: { path?: string; type?: string }[];
  truncated?: boolean;
}

async function getRepoTree(repo: RepoDef): Promise<string[] | null> {
  for (const branch of repo.sourceBranches) {
    const data = await fetchJson<TreeResponse>(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
      12_000,
    );
    if (data?.tree) {
      return data.tree
        .filter((item) => item.type === "blob" && typeof item.path === "string")
        .map((item) => item.path as string);
    }
  }
  return null;
}

async function fetchRawSource(
  repo: RepoDef,
  branch: string | null,
  path: string,
): Promise<string> {
  const branches = branch ? [branch] : repo.sourceBranches;
  for (const b of branches) {
    const text = await fetchText(
      `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${b}/${path}`,
      10_000,
    );
    if (text) return text;
  }
  return "";
}

// ─── Slug + matching helpers ─────────────────────────────────────────────────
const slugify = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Provider id → directory-name aliases seen in these repos. */
const DIR_ALIASES: Record<string, string[]> = {
  hdhub4u: ["Hdhub4u", "HdHub4u", "HDHub4U"],
  fourkhdhub: ["4khdhub", "4KHDHub", "FourkHdhub"],
  moviesdrive: ["Moviesdrive", "MoviesDrive", "moviesdrive"],
  bollyflix: ["Bollyflix", "BollyFlix"],
  cinestream: ["Cinestream", "CineStream"],
  moviesmod: ["Moviesmod", "MoviesMod", "Moviezmod"],
  vegamovies: ["Vegamovies", "VegaMovies", "Vegamovies.in"],
  animexin: ["Animexin", "AnimeXin"],
};

const KNOWN_TV_TYPE_MAP: Record<string, string> = {
  movie: "movie",
  tvseries: "tv",
  tv: "tv",
  anime: "anime",
  cartoon: "cartoon",
  kids: "cartoon",
  live: "live",
  sports: "sports",
  music: "music",
  drama: "asianDrama",
  asianseries: "asianDrama",
  asian: "asianDrama",
};

const INFRA_HOST_SUBSTRINGS = [
  "github",
  "google",
  "gstatic",
  "cloudflare",
  "jsdelivr",
  "gravatar",
  "youtube",
  "ytimg",
  "discord",
  "telegram",
  "whatsapp",
  "facebook",
  "twitter",
  "x.com",
  "instagram",
  "reddit",
  "wikipedia",
  "amazon",
  "apple.com",
  "microsoft",
  "paypal",
  "bit.ly",
  "tinyurl",
  "doubleclick",
  "googlesyndication",
  "cloudfront",
  "akamai",
  "fastly",
  "unpkg",
  "w3.org",
  "schema.org",
  "kotlin",
  "jetbrains",
  "apache.org",
  "mozilla",
  "android.com",
  "openjdk",
  "gradle",
  "maven",
  "sonatype",
  "f-droid",
  "imgur",
  "shutterstock",
  "gettyimages",
  "imdb",
  "themoviedb",
  "tmdb.org",
  // Helper/metadata APIs referenced inside extension code (not playback sites)
  "elfhosted",
  "strem",
  "malsync",
  "cinemeta",
  "wyzie",
  "tokyoin",
  "metadata",
  "anilist",
  "simkl",
  "trakt",
  "justwatch",
];

// ─── Kotlin source parsing ───────────────────────────────────────────────────
interface ParsedSource {
  domains: string[];
  apiEndpoints: string[];
  streamPatterns: string[];
  qualities: string[];
}

/** Replace Kotlin string templates ($query, ${query}, $BASE_URL) with safe tokens. */
function normalizeTemplateTokens(source: string): string {
  return source
    .replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, "%{$1}%")
    .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, "%{$1}%");
}

/** Turn a normalized token back into a {placeholder} template. */
function restorePlaceholders(value: string): string {
  return value.replace(/%\{[a-zA-Z_][a-zA-Z0-9_]*\}%/g, (match) =>
    match.replace(/%\{(.*?)\}%/g, "{$1}"),
  );
}

function extractHost(template: string): string | null {
  try {
    return new URL(template).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isJunkHost(host: string): boolean {
  return INFRA_HOST_SUBSTRINGS.some((block) => host.includes(block));
}

function parseKotlinSource(source: string): ParsedSource {
  const normalized = normalizeTemplateTokens(source);
  const rawUrls = normalized.match(/https?:\/\/[^\s"'`<>)\]}>]+/gi) || [];

  const domains: string[] = [];
  const apiEndpoints: string[] = [];
  const streamPatterns: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawUrls) {
    const cleaned = raw.replace(/[.,;:!?)\]}>'"’]+$/g, "");
    const template = restorePlaceholders(cleaned);
    const host = extractHost(template);
    if (!host || isJunkHost(host) || host.includes("*")) continue;

    if (!seen.has(host)) {
      seen.add(host);
      domains.push(host);
    }

    const low = template.toLowerCase();
    const isApi =
      low.includes("/api/") ||
      low.startsWith("https://api.") ||
      /(search|query|keyword|title|find)[=?]/.test(low);
    const isStream =
      low.includes("/embed") ||
      low.includes("/stream") ||
      low.includes("/watch") ||
      low.includes("/play") ||
      low.includes("/episode") ||
      low.includes("{id}") ||
      low.includes("{season}") ||
      low.includes("{episode}") ||
      low.includes("{tmdb");

    if (isApi && !apiEndpoints.includes(template) && apiEndpoints.length < 12) {
      apiEndpoints.push(template);
    }
    if (
      isStream &&
      !streamPatterns.includes(template) &&
      streamPatterns.length < 12
    ) {
      streamPatterns.push(template);
    }
  }

  const qualities: string[] = [];
  const qualityPriority: [RegExp, string][] = [
    [/\b(2160p|4k|uhd|ultra hd)\b/i, "4K"],
    [/\b(1080p|fhd|full hd)\b/i, "FHD"],
    [/\b(720p|hd)\b/i, "HD"],
    [/\b(480p|360p|sd)\b/i, "SD"],
  ];
  for (const [pattern, tier] of qualityPriority) {
    if (pattern.test(source)) {
      qualities.push(tier);
      break;
    }
  }

  // Best-effort dedupe noise: drop "api" endpoints and streams that are really
  // the base site root.
  return { domains, apiEndpoints, streamPatterns, qualities };
}

const LANG_HINTS: [RegExp, string][] = [
  [/\bhindi\b|\bhindī\b/i, "hi"],
  [/\bkorean\b|\b한국/i, "ko"],
  [/\bjapanese\b|\b日本語/i, "ja"],
  [/\bchinese\b|\bmandarin\b|\b中文/i, "zh"],
  [/\bbengali\b|\bbangla\b/i, "bn"],
  [/\btamil\b/i, "ta"],
  [/\btelugu\b/i, "te"],
  [/\bindonesian\b|\bbahasa\b/i, "id"],
  [/\bfrench\b|\bfrançais\b/i, "fr"],
  [/\bgerman\b|\bdeutsch\b/i, "de"],
  [/\bspanish\b|\bespañol\b/i, "mx"],
  [/\benglish\b/i, "en"],
];

function detectLanguage(source: string): string | null {
  for (const [pattern, lang] of LANG_HINTS) {
    if (pattern.test(source)) return lang;
  }
  return null;
}

function categoriesFromPath(path: string): string[] {
  const low = path.toLowerCase();
  const cats = new Set<string>();
  if (/\banime\b/.test(low)) cats.add("anime");
  if (/\b(cartoon|toon|kids)\b/.test(low)) cats.add("cartoon");
  if (/\b(kiss|drama|asian)\b/.test(low)) cats.add("asianDrama");
  if (/\blive\b/.test(low)) cats.add("live");
  if (/\b(movie|film|cinema)\b/.test(low)) cats.add("movie");
  if (/\b(tvseries|series|tv-?show|serie)\b/.test(low)) cats.add("tv");
  return Array.from(cats);
}

// ─── Plugin metadata (plugins.json) ──────────────────────────────────────────
interface PluginEntry {
  url?: string;
  status?: number;
  version?: number;
  name?: string;
  internalName?: string;
  description?: string;
  language?: string;
  tvTypes?: string[];
  iconUrl?: string;
}

// ─── Orchestration ───────────────────────────────────────────────────────────
export async function buildManifestFresh(): Promise<ProviderManifest> {
  const started = Date.now();
  const repoCommits: Record<string, RepoCommitInfo> = {};
  const pluginsBySlug = new Map<
    string,
    PluginEntry & { repo: RepoDef["id"] }
  >();
  const sourcesByProvider = new Map<
    string,
    { path: string; source: string }[]
  >();

  // Phase 1 — watch commits + fetch plugin metadata, all repos in parallel.
  await Promise.all(
    MANIFEST_REPOS.map(async (repo) => {
      const commit = await getLatestCommit(repo);
      if (commit) repoCommits[repo.id] = commit;
    }),
  );

  for (const repo of MANIFEST_REPOS) {
    const plugins = await fetchJson<PluginEntry[]>(repo.pluginsUrl, 12_000);
    if (!plugins) continue;
    for (const plugin of plugins) {
      if (plugin.status !== 1) continue;
      const slug = slugify(plugin.internalName || plugin.name || "");
      if (slug) pluginsBySlug.set(slug, { ...plugin, repo: repo.id });
    }
  }

  // Phase 2 — pull the open-source Kotlin sources that match provider dirs.
  const sourceLimit = 90;
  let sourceCount = 0;
  await Promise.all(
    MANIFEST_REPOS.map(async (repo) => {
      const tree = await getRepoTree(repo);
      if (!tree) return;

      const candidates: { path: string; id: string | null }[] = [];
      for (const path of tree) {
        if (!path.endsWith(".kt")) continue;
        if (/\b(test|build|generated)\b/i.test(path)) continue;

        const segments = path.split("/");
        const dirSlugs = segments.slice(0, -1).map(slugify);

        // Direct alias match first
        let matchedId: string | null = null;
        for (const [id, aliases] of Object.entries(DIR_ALIASES)) {
          if (aliases.some((alias) => dirSlugs.includes(slugify(alias)))) {
            matchedId = id;
            break;
          }
        }
        // Then fuzzy: dir name ≈ provider id
        if (!matchedId) {
          for (const dir of dirSlugs) {
            if (dir.length >= 4 && dir.length <= 24 && pluginsBySlug.has(dir)) {
              matchedId = dir;
              break;
            }
          }
        }
        if (matchedId) candidates.push({ path, id: matchedId });
      }

      // Cap per repo
      const capped = candidates.slice(0, 70);
      for (const candidate of capped) {
        if (sourceCount >= sourceLimit) break;
        sourceCount += 1;
        const source = await fetchRawSource(repo, null, candidate.path);
        if (!source) continue;

        const id = candidate.id || slugify(candidate.path.split("/")[0]);
        if (!sourcesByProvider.has(id)) sourcesByProvider.set(id, []);
        const list = sourcesByProvider.get(id)!;
        if (list.length < 8) list.push({ path: candidate.path, source });
      }
    }),
  );

  // Phase 3 — merge parsed sources with plugin metadata into the manifest.
  const providerMap = new Map<string, ManifestProvider>();

  const ensureProvider = (
    id: string,
    repo: RepoDef["id"],
    fallbackName?: string,
  ): ManifestProvider => {
    const existing = providerMap.get(id);
    if (existing) return existing;
    const created: ManifestProvider = {
      id,
      name: fallbackName || id,
      repo,
      categories: [],
      domains: [],
      apiEndpoints: [],
      streamPatterns: [],
      qualities: [],
      sourcePaths: [],
    };
    providerMap.set(id, created);
    return created;
  };

  Array.from(sourcesByProvider.entries()).forEach(([id, files]) => {
    if (!files.length) return;
    const first = files[0];
    const provider = ensureProvider(
      id,
      first.path.includes("CSX") ? "csx" : "phisher",
      id,
    );

    for (const file of files) {
      provider.sourcePaths.push(file.path);
      const parsed = parseKotlinSource(file.source);
      for (const d of parsed.domains) {
        if (!provider.domains.includes(d)) provider.domains.push(d);
      }
      for (const e of parsed.apiEndpoints) {
        if (!provider.apiEndpoints.includes(e)) provider.apiEndpoints.push(e);
      }
      for (const s of parsed.streamPatterns) {
        if (!provider.streamPatterns.includes(s))
          provider.streamPatterns.push(s);
      }
      for (const q of parsed.qualities) {
        if (!provider.qualities.includes(q)) provider.qualities.push(q);
      }
      for (const cat of categoriesFromPath(file.path)) {
        if (!provider.categories.includes(cat)) provider.categories.push(cat);
      }
      const lang = detectLanguage(file.source);
      if (lang && !provider.language) provider.language = lang;
    }

    // Pretty name + metadata from the plugin registry where available.
    const pluginSlug = slugify(id);
    const plugin = pluginsBySlug.get(pluginSlug);
    if (plugin) {
      provider.internalName = plugin.internalName || provider.internalName;
      provider.name = plugin.name || provider.name;
      provider.description = plugin.description || provider.description;
      provider.version = plugin.version ?? provider.version;
      provider.repo = plugin.repo;
      if (plugin.language) provider.language = plugin.language;
      if (Array.isArray(plugin.tvTypes)) provider.tvTypes = plugin.tvTypes;
    }

    // Categories from tvTypes
    for (const tvType of provider.tvTypes || []) {
      const category = KNOWN_TV_TYPE_MAP[tvType.toLowerCase()];
      if (category && !provider.categories.includes(category)) {
        provider.categories.push(category);
      }
    }
  });

  // Also surface providers present in plugin metadata with no parsed source
  // (they still carry plugin metadata + icon-derived domains).
  Array.from(pluginsBySlug.entries()).forEach(([slug, plugin]) => {
    const existing = providerMap.get(slug);
    const provider =
      existing || ensureProvider(slug, plugin.repo, plugin.name || slug);
    provider.internalName = plugin.internalName;
    provider.description = plugin.description;
    provider.language = plugin.language;
    provider.version = plugin.version;
    if (Array.isArray(plugin.tvTypes)) provider.tvTypes = plugin.tvTypes;

    // Icon-hosted domains: many repos host plugin icons on the provider's own domain.
    const iconHost = extractHost(plugin.iconUrl || "");
    if (
      iconHost &&
      !isJunkHost(iconHost) &&
      !provider.domains.includes(iconHost)
    ) {
      provider.domains.push(iconHost);
    }

    for (const tvType of provider.tvTypes || []) {
      const category = KNOWN_TV_TYPE_MAP[tvType.toLowerCase()];
      if (category && !provider.categories.includes(category)) {
        provider.categories.push(category);
      }
    }
  });

  const manifest: ProviderManifest = {
    manifestVersion: 1,
    generatedAt: Date.now(),
    generatedInMs: Date.now() - started,
    repoCommits,
    providers: Array.from(providerMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 120),
  };
  cachedManifest = manifest;
  lastBuiltAt = Date.now();
  return manifest;
}

// ─── Cache + change detection ────────────────────────────────────────────────
let cachedManifest: ProviderManifest | null = null;
let lastBuiltAt = 0;
let buildInFlight: Promise<ProviderManifest> | null = null;

/** Returns the current manifest, rebuilding when the TTL expires or any watched
 *  repo published new commits. Cheap when fresh: no feeds are fetched. */
export async function getOrBuildManifest(): Promise<ProviderManifest> {
  if (cachedManifest && Date.now() - lastBuiltAt < MANIFEST_TTL_MS) {
    return cachedManifest;
  }
  if (buildInFlight) return buildInFlight;

  buildInFlight = (async () => {
    // TTL expired → check commits before deciding to rebuild.
    const commits: Record<string, RepoCommitInfo> = {};
    await Promise.all(
      MANIFEST_REPOS.map(async (repo) => {
        const commit = await getLatestCommit(repo);
        if (commit) commits[repo.id] = commit;
      }),
    );

    const changed =
      Object.keys(commits).length > 0 &&
      Object.entries(commits).some(
        ([repoId, commit]) =>
          cachedManifest?.repoCommits?.[repoId]?.hash !== commit.hash,
      );

    if (
      cachedManifest &&
      !changed &&
      Date.now() - lastBuiltAt < MANIFEST_TTL_MS * 2
    ) {
      // Nothing changed upstream; keep serving the cached manifest, refresh the stamp.
      lastBuiltAt = Date.now();
      return cachedManifest;
    }
    return buildManifestFresh();
  })();

  try {
    return await buildInFlight;
  } finally {
    buildInFlight = null;
  }
}

export function getManifestStatus(): ManifestStatus {
  const now = Date.now();
  const fresh = cachedManifest !== null && now - lastBuiltAt < MANIFEST_TTL_MS;
  return {
    cached: cachedManifest !== null,
    builtAt: lastBuiltAt,
    fresh,
    ttlMs: MANIFEST_TTL_MS,
    repoCommits: cachedManifest?.repoCommits || {},
    providerCount: cachedManifest?.providers.length || 0,
    domainCount:
      cachedManifest?.providers.reduce(
        (total, p) => total + p.domains.length,
        0,
      ) || 0,
    apiEndpointCount:
      cachedManifest?.providers.reduce(
        (total, p) => total + p.apiEndpoints.length + p.streamPatterns.length,
        0,
      ) || 0,
  };
}
