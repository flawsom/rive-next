import type { NextApiRequest, NextApiResponse } from "next";
import {
  discoverDomains,
  discoverAllDomains,
  getBestDomain,
  autoUpdateStreamingUrl,
  getDiscoveryStatus,
  forceRefresh,
  addDomainPatterns,
  getDomainPatterns,
  recordDomainFailure,
  recordDomainSuccess,
  resolveStreamUrl,
  resolveDownloadUrl,
  getActiveStreamUrl,
  getLiveDomainMap,
  getCachedDomain,
} from "@/Utils/domainDiscovery";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { action, providerId, patterns } = req.query;

  try {
    switch (action) {
      case "discover": {
        const pid = providerId as string;
        if (!pid) {
          return res.status(400).json({ error: "providerId is required" });
        }
        const result = await discoverDomains(pid);
        return res.status(200).json(result);
      }

      case "discoverAll": {
        const results = await discoverAllDomains();
        const status: Record<string, any> = {};
        const resultKeys = Object.keys(results);
        for (let i = 0; i < resultKeys.length; i++) {
          const id = resultKeys[i];
          const result = results[id];
          status[id] = {
            workingDomains: result.workingDomains.length,
            bestDomain: result.workingDomains[0]?.url || null,
            lastDiscovery: result.lastDiscovery,
          };
        }
        return res.status(200).json(status);
      }

      case "bestDomain": {
        const pid = providerId as string;
        if (!pid) {
          return res.status(400).json({ error: "providerId is required" });
        }
        const domain = await getBestDomain(pid);
        return res.status(200).json({ provider: pid, domain });
      }

      case "autoUpdate": {
        const result = await autoUpdateStreamingUrl();
        return res.status(200).json(result);
      }

      case "status": {
        const status = getDiscoveryStatus();
        return res.status(200).json(status);
      }

      case "refresh": {
        const pid = providerId as string;
        if (!pid) {
          return res.status(400).json({ error: "providerId is required" });
        }
        const result = await forceRefresh(pid);
        return res.status(200).json(result);
      }

      case "addPatterns": {
        const pid = providerId as string;
        const newPatterns = patterns ? JSON.parse(patterns as string) : [];
        if (!pid || !newPatterns.length) {
          return res
            .status(400)
            .json({ error: "providerId and patterns are required" });
        }
        addDomainPatterns(pid, newPatterns);
        return res
          .status(200)
          .json({
            success: true,
            provider: pid,
            patternsAdded: newPatterns.length,
          });
      }

      case "getPatterns": {
        const patterns = getDomainPatterns();
        return res.status(200).json(patterns);
      }

      case "liveMap": {
        const liveMap = getLiveDomainMap();
        return res.status(200).json(liveMap);
      }

      case "resolveStream": {
        const pid = providerId as string;
        const streamType = (req.query.type as "movie" | "tv") || "movie";
        const contentId = req.query.id as string;
        const s = req.query.season
          ? parseInt(req.query.season as string)
          : undefined;
        const e = req.query.episode
          ? parseInt(req.query.episode as string)
          : undefined;
        if (!pid || !contentId) {
          return res
            .status(400)
            .json({ error: "providerId and id are required" });
        }
        const url = resolveStreamUrl(pid, streamType, contentId, s, e);
        return res.status(200).json({ url, provider: pid });
      }

      case "resolveDownload": {
        const pid = providerId as string;
        const dlType = (req.query.type as "movie" | "tv") || "movie";
        const contentId = req.query.id as string;
        const s = req.query.season
          ? parseInt(req.query.season as string)
          : undefined;
        const e = req.query.episode
          ? parseInt(req.query.episode as string)
          : undefined;
        if (!pid || !contentId) {
          return res
            .status(400)
            .json({ error: "providerId and id are required" });
        }
        const url = resolveDownloadUrl(pid, dlType, contentId, s, e);
        return res.status(200).json({ url, provider: pid });
      }

      case "reportFailure": {
        const pid = providerId as string;
        const failedUrl = req.query.url as string;
        if (!pid || !failedUrl) {
          return res
            .status(400)
            .json({ error: "providerId and url are required" });
        }
        recordDomainFailure(pid, failedUrl);
        return res.status(200).json({ success: true });
      }

      case "reportSuccess": {
        const pid = providerId as string;
        const successUrl = req.query.url as string;
        const latency = Number(req.query.latency) || 100;
        if (!pid || !successUrl) {
          return res
            .status(400)
            .json({ error: "providerId and url are required" });
        }
        recordDomainSuccess(pid, successUrl, latency);
        return res.status(200).json({ success: true });
      }

      case "activeStreamUrl": {
        const url = getActiveStreamUrl();
        return res.status(200).json({ url });
      }

      case "cachedDomain": {
        const pid = providerId as string;
        if (!pid) {
          return res.status(400).json({ error: "providerId is required" });
        }
        const domain = getCachedDomain(pid);
        return res.status(200).json({ provider: pid, domain });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error("Domain Discovery API error:", error?.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
