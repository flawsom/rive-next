/**
 * Download utility - provides instant download links from available sources
 * Uses the same provider registry and smart selection as streaming
 */

import { getProvidersByCategory, findProviderById } from "./providers";
import { recordSuccess, recordFailure } from "./sourceSelector";
import {
  resolveDownloadUrl,
  getCachedDomain,
  recordDomainSuccess,
} from "./domainDiscovery";

export interface DownloadLink {
  providerId: string;
  providerName: string;
  quality: string;
  language: string;
  url: string;
}

export function getDownloadUrl(
  providerId: string,
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): string | null {
  const provider = findProviderById(providerId);
  if (!provider) return null;

  // Use autonomous domain resolver for the best working URL
  return resolveDownloadUrl(providerId, type, id, season, episode);
}

export async function getAvailableDownloads(
  type: "movie" | "tv",
  id: string | number,
  category?: "anime" | "cartoon" | "asianDrama",
  season?: number,
  episode?: number,
): Promise<DownloadLink[]> {
  const cat = category || type;
  const providers = getProvidersByCategory(cat as any);

  const downloads: DownloadLink[] = [];

  for (const provider of providers.slice(0, 5)) {
    const url = getDownloadUrl(provider.id, type, id, season, episode);
    if (url) {
      downloads.push({
        providerId: provider.id,
        providerName: provider.name,
        quality: provider.capabilities.hq ? "HD" : "SD",
        language: provider.language.toUpperCase(),
        url,
      });
    }
  }

  return downloads;
}

export function initiateDownload(
  providerId: string,
  type: "movie" | "tv",
  id: string | number,
  title: string,
  season?: number,
  episode?: number,
): void {
  const url = getDownloadUrl(providerId, type, id, season, episode);
  if (url) {
    recordSuccess(providerId, 50);
    recordDomainSuccess(providerId, url, 50);
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    recordFailure(providerId);
  }
}
