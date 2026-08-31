import type { NextApiRequest, NextApiResponse } from "next";
import {
  ALL_PROVIDERS,
  getProvidersByCategory,
  searchProviders,
  findProviderById,
} from "@/Utils/providers";
import {
  selectBestSource,
  selectBestSourceForContent,
  getHealthStatus,
  recordFailure,
  recordSuccess,
  resetHealth,
} from "@/Utils/sourceSelector";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { action, category, type, title, query, providerId } = req.query;

  try {
    switch (action) {
      case "list": {
        const cat = category as any;
        if (cat) {
          return res.status(200).json(getProvidersByCategory(cat));
        }
        return res.status(200).json(ALL_PROVIDERS);
      }

      case "search": {
        const q = query as string;
        if (!q) {
          return res.status(400).json({ error: "query parameter is required" });
        }
        return res.status(200).json(searchProviders(q));
      }

      case "best": {
        const cat = category as any;
        if (!cat) {
          return res
            .status(400)
            .json({ error: "category parameter is required" });
        }
        const preferredId = providerId as string | undefined;
        const selection = await selectBestSource(cat, preferredId);
        return res.status(200).json(selection);
      }

      case "bestForContent": {
        const contentTitle = title as string;
        const contentType = (type as "movie" | "tv") || "movie";
        if (!contentTitle) {
          return res.status(400).json({ error: "title parameter is required" });
        }
        const contentCategory = category as
          "anime" | "cartoon" | "asianDrama" | undefined;
        const selection = await selectBestSourceForContent(
          contentTitle,
          contentType,
          contentCategory,
        );
        return res.status(200).json(selection);
      }

      case "health": {
        return res.status(200).json(getHealthStatus());
      }

      case "reportFailure": {
        const pid = providerId as string;
        if (!pid) {
          return res
            .status(400)
            .json({ error: "providerId parameter is required" });
        }
        recordFailure(pid);
        return res.status(200).json({ success: true });
      }

      case "reportSuccess": {
        const pid = providerId as string;
        const latency = Number(req.query.latency) || 0;
        if (!pid) {
          return res
            .status(400)
            .json({ error: "providerId parameter is required" });
        }
        recordSuccess(pid, latency);
        return res.status(200).json({ success: true });
      }

      case "reset": {
        const pid = providerId as string | undefined;
        resetHealth(pid);
        return res.status(200).json({ success: true });
      }

      case "detail": {
        const pid = providerId as string;
        if (!pid) {
          return res
            .status(400)
            .json({ error: "providerId parameter is required" });
        }
        const provider = findProviderById(pid);
        if (!provider) {
          return res.status(404).json({ error: "Provider not found" });
        }
        return res.status(200).json(provider);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error("Provider API error:", error?.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
