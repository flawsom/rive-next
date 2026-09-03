/**
 * Smart source selection policy.
 * Provider entries are metadata; availability is only reported for configured endpoints.
 */

import { Provider, getProvidersByCategory } from "./providers";
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

const healthMap = new Map<string, SourceHealth>();
const LATENCY_CACHE_TTL = 5 * 60 * 1000;
const MAX_FAILURES = 3;
const FAILURE_COOLDOWN = 10 * 60 * 1000;

export function recordFailure(providerId: string): void {
  const existing = healthMap.get(providerId);
  healthMap.set(providerId, {
    providerId,
    latency: existing?.latency ?? Infinity,
    available: false,
    lastChecked: Date.now(),
    failureCount: (existing?.failureCount || 0) + 1,
  });
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

function canRetry(health: SourceHealth): boolean {
  return (
    health.failureCount >= MAX_FAILURES &&
    Date.now() - health.lastChecked > FAILURE_COOLDOWN
  );
}

async function measureLatency(url: string, timeoutMs = 4_000): Promise<number> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok || response.type === "opaque"
      ? Date.now() - start
      : Infinity;
  } catch {
    return Infinity;
  } finally {
    clearTimeout(timer);
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
  if (!candidates.length)
    throw new Error(`No providers available for category: ${category}`);

  const results = await Promise.all(
    candidates.map(async (provider): Promise<SourceHealth> => {
      const cached = healthMap.get(provider.id);
      if (
        cached &&
        Date.now() - cached.lastChecked < LATENCY_CACHE_TTL &&
        (cached.available || !canRetry(cached))
      )
        return cached;

      const domain = getCachedDomain(provider.id);
      if (!domain && !provider.embedBase) {
        const unavailable = {
          providerId: provider.id,
          latency: Infinity,
          available: false,
          lastChecked: Date.now(),
          failureCount: (cached?.failureCount || 0) + 1,
        };
        healthMap.set(provider.id, unavailable);
        return unavailable;
      }

      const base = domain || provider.embedBase;
      const latency = await measureLatency(
        base!.startsWith("http") ? base! : `https://${base}`,
      );
      const health = {
        providerId: provider.id,
        latency,
        available: latency < Infinity,
        lastChecked: Date.now(),
        failureCount: latency < Infinity ? 0 : (cached?.failureCount || 0) + 1,
      };
      healthMap.set(provider.id, health);
      if (health.available) recordDomainSuccess(provider.id, base!, latency);
      else recordDomainFailure(provider.id, base!);
      return health;
    }),
  );

  const ranked = candidates
    .map((provider) => ({
      provider,
      health: results.find((item) => item.providerId === provider.id)!,
    }))
    .filter(({ health }) => health.available)
    .sort((a, b) => {
      if (preferredId && a.provider.id !== b.provider.id)
        return a.provider.id === preferredId
          ? -1
          : b.provider.id === preferredId
            ? 1
            : 0;
      if (a.provider.isDefault !== b.provider.isDefault)
        return a.provider.isDefault ? -1 : 1;
      return (
        a.health.latency - b.health.latency ||
        a.provider.priority - b.provider.priority
      );
    });

  const fallback =
    candidates.find((provider) => provider.id === preferredId) || candidates[0];
  const selected = ranked[0];
  return {
    provider: selected?.provider || fallback,
    latency: selected?.health.latency ?? Infinity,
    alternatives: ranked.slice(1).map(({ provider }) => provider),
    allAvailable: results,
  };
}

export async function selectBestSourceForContent(
  title: string,
  type: "movie" | "tv",
  category?: "anime" | "cartoon" | "asianDrama",
): Promise<SourceSelection> {
  const value = title.toLowerCase();
  const detected =
    category ||
    (/anime|manga|naruto|one piece|demon slayer|jujutsu|dragon ball/i.test(
      value,
    )
      ? "anime"
      : /cartoon|doraemon|ben 10|spongebob|shin chan/i.test(value)
        ? "cartoon"
        : /k-?drama|korean|japanese|chinese drama/i.test(value)
          ? "asianDrama"
          : type);
  // For movies/TV the default is HDHub4U or MoviesDrive, decided purely by
  // latency and availability. Anime prefers Anichi only as the fallback anchor.
  return selectBestSource(
    detected,
    detected === "anime" ? "anichi" : undefined,
  );
}

export function getHealthStatus(): SourceHealth[] {
  return Array.from(healthMap.values());
}
export function resetHealth(providerId?: string): void {
  providerId ? healthMap.delete(providerId) : healthMap.clear();
}
