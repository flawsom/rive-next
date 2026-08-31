/**
 * Smart Source Selector
 * Tests latency, availability, and picks the best working source automatically
 * Falls back to alternatives if the current source fails
 */

import { ALL_PROVIDERS, Provider, getProvidersByCategory } from "./providers";
import {
  getCachedDomain,
  recordDomainFailure,
  recordDomainSuccess,
} from "./domainDiscovery";

export interface SourceHealth {
  providerId: string;
  latency: number;
  available: boolean;
  lastChecked: number;
  failureCount: number;
}

export interface SourceSelection {
  provider: Provider;
  latency: number;
  alternatives: Provider[];
  allAvailable: SourceHealth[];
}

const healthMap: Map<string, SourceHealth> = new Map();
const LATENCY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_FAILURES = 3;
const FAILURE_COOLDOWN = 10 * 60 * 1000; // 10 minutes

export function recordFailure(providerId: string): void {
  const existing = healthMap.get(providerId);
  if (existing) {
    existing.failureCount += 1;
    existing.lastChecked = Date.now();
    if (existing.failureCount >= MAX_FAILURES) {
      existing.available = false;
    }
  } else {
    healthMap.set(providerId, {
      providerId,
      latency: Infinity,
      available: false,
      lastChecked: Date.now(),
      failureCount: 1,
    });
  }
}

export function recordSuccess(providerId: string, latency: number): void {
  healthMap.set(providerId, {
    providerId,
    latency,
    available: true,
    lastChecked: Date.now(),
    failureCount: 0,
  });
}

function isHealthStale(health: SourceHealth): boolean {
  return Date.now() - health.lastChecked > LATENCY_CACHE_TTL;
}

function isFailureCooldownOver(health: SourceHealth): boolean {
  return (
    health.failureCount >= MAX_FAILURES &&
    Date.now() - health.lastChecked > FAILURE_COOLDOWN
  );
}

async function measureLatency(url: string, timeoutMs = 4000): Promise<number> {
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
    return Date.now() - start;
  } catch {
    return Infinity;
  }
}

export async function selectBestSource(
  category:
    | "movie"
    | "tv"
    | "anime"
    | "cartoon"
    | "asianDrama"
    | "live"
    | "music"
    | "torrent"
    | "sports",
  preferredId?: string,
): Promise<SourceSelection> {
  const candidates = getProvidersByCategory(category);
  if (candidates.length === 0) {
    throw new Error(`No providers available for category: ${category}`);
  }

  const healthChecks: Promise<SourceHealth>[] = candidates.map(
    async (provider) => {
      const cached = healthMap.get(provider.id);

      if (cached && !isHealthStale(cached) && cached.available) {
        return cached;
      }

      if (cached && !isFailureCooldownOver(cached) && !cached.available) {
        return cached;
      }

      // Use the autonomous domain resolver to get the best URL for testing
      const liveDomain = getCachedDomain(provider.id);
      const testUrl = liveDomain
        ? `${liveDomain.startsWith("http") ? liveDomain : `https://${liveDomain}`}/`
        : provider.embedBase
          ? `${provider.embedBase}/`
          : `https://www.google.com/favicon.ico`;

      const latency = await measureLatency(testUrl);
      const health: SourceHealth = {
        providerId: provider.id,
        latency,
        available: latency < Infinity,
        lastChecked: Date.now(),
        failureCount:
          latency >= Infinity
            ? (healthMap.get(provider.id)?.failureCount || 0) + 1
            : 0,
      };

      healthMap.set(provider.id, health);

      // Also update the domain resolver with success/failure
      if (health.available && testUrl) {
        recordDomainSuccess(provider.id, testUrl, latency);
      } else if (!health.available && testUrl) {
        recordDomainFailure(provider.id, testUrl);
      }

      return health;
    },
  );

  const results = await Promise.all(healthChecks);

  const ranked = candidates
    .map((provider) => {
      const health = results.find((r) => r.providerId === provider.id)!;
      return { provider, health };
    })
    .filter((entry) => entry.health.available)
    .sort((a, b) => {
      if (preferredId) {
        if (a.provider.id === preferredId) return -1;
        if (b.provider.id === preferredId) return 1;
      }
      if (a.provider.isDefault && !b.provider.isDefault) return -1;
      if (!a.provider.isDefault && b.provider.isDefault) return 1;
      if (a.health.latency !== b.health.latency) {
        return a.health.latency - b.health.latency;
      }
      return a.provider.priority - b.provider.priority;
    });

  if (ranked.length === 0) {
    const fallback = preferredId
      ? candidates.find((p) => p.id === preferredId) || candidates[0]
      : candidates[0];
    return {
      provider: fallback,
      latency: Infinity,
      alternatives: [],
      allAvailable: results,
    };
  }

  const best = ranked[0];
  const alternatives = ranked.slice(1).map((entry) => entry.provider);

  return {
    provider: best.provider,
    latency: best.health.latency,
    alternatives,
    allAvailable: results,
  };
}

export async function selectBestSourceForContent(
  title: string,
  type: "movie" | "tv",
  category?: "anime" | "cartoon" | "asianDrama",
): Promise<SourceSelection> {
  let effectiveCategory: "movie" | "tv" | "anime" | "cartoon" | "asianDrama";
  if (category) {
    effectiveCategory = category;
  } else {
    effectiveCategory = type;
  }

  const titleLower = title.toLowerCase();
  const isAnime =
    /\banime\b|\bmanga\b|\bnaruto\b|\bone piece\b|\bdragon ball\b|\bjujutsu\b|\battack on titan\b|\bdemon slayer\b|\bmy hero\b|\bchainsaw man\b/i.test(
      titleLower,
    );
  const isCartoon =
    /\bcartoon\b|\bdoraemon\b|\bben 10\b|\bspongebob\b|\btom and jerry\b|\bhorrid henry\b|\bshin chan\b|\bpowerpuff\b/i.test(
      titleLower,
    );
  const isAsianDrama =
    /\bk[- ]?drama\b|\bkorean\b|\bkdrama\b|\bjapanese\b|\bchinese drama\b|\bthai drama\b|\bepisode\b.*\bsub\b/i.test(
      titleLower,
    );

  if (isAnime) effectiveCategory = "anime";
  else if (isCartoon) effectiveCategory = "cartoon";
  else if (isAsianDrama) effectiveCategory = "asianDrama";

  return selectBestSource(effectiveCategory, "hdhub4u");
}

export function getHealthStatus(): SourceHealth[] {
  return Array.from(healthMap.values());
}

export function resetHealth(providerId?: string): void {
  if (providerId) {
    healthMap.delete(providerId);
  } else {
    healthMap.clear();
  }
}
