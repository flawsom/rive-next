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
import { setPrivateApiHeaders } from "@/Utils/apiValidation";

const READ_ACTIONS = new Set([
  "list",
  "search",
  "best",
  "bestForContent",
  "health",
  "detail",
]);
const WRITE_ACTIONS = new Set(["reportFailure", "reportSuccess", "reset"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  const action = typeof req.query.action === "string" ? req.query.action : "";
  if (READ_ACTIONS.has(action) && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (WRITE_ACTIONS.has(action) && req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action))
    return res.status(400).json({ error: `Unknown action: ${action}` });

  const category =
    typeof req.query.category === "string" ? req.query.category : undefined;
  const queryProviderId =
    typeof req.query.providerId === "string" ? req.query.providerId : undefined;
  const bodyProviderId =
    typeof req.body?.providerId === "string" ? req.body.providerId : undefined;
  const providerId = bodyProviderId || queryProviderId;

  try {
    switch (action) {
      case "list":
        return res
          .status(200)
          .json(
            category ? getProvidersByCategory(category as any) : ALL_PROVIDERS,
          );
      case "search": {
        const query =
          typeof req.query.query === "string"
            ? req.query.query.trim().slice(0, 100)
            : "";
        if (!query)
          return res.status(400).json({ error: "query parameter is required" });
        return res.status(200).json(searchProviders(query));
      }
      case "best":
        if (!category)
          return res
            .status(400)
            .json({ error: "category parameter is required" });
        // Edge-cache selection per category: health state changes slowly,
        // and a cached verdict makes watch pages open instantly. Latency
        // probes still run server-side underneath on cache misses.
        res.setHeader(
          "Cache-Control",
          "s-maxage=120, stale-while-revalidate=600",
        );
        return res
          .status(200)
          .json(await selectBestSource(category as any, queryProviderId));
      case "bestForContent": {
        const title =
          typeof req.query.title === "string"
            ? req.query.title.trim().slice(0, 200)
            : "";
        if (!title)
          return res.status(400).json({ error: "title parameter is required" });
        return res
          .status(200)
          .json(
            await selectBestSourceForContent(
              title,
              req.query.type === "tv" ? "tv" : "movie",
              category as any,
            ),
          );
      }
      case "health":
        return res.status(200).json(getHealthStatus());
      case "reportFailure":
        if (!providerId || !findProviderById(providerId))
          return res
            .status(400)
            .json({ error: "Valid providerId is required" });
        recordFailure(providerId);
        return res.status(200).json({ success: true });
      case "reportSuccess": {
        const latency = Number(req.body?.latency ?? req.query.latency);
        if (
          !providerId ||
          !findProviderById(providerId) ||
          !Number.isFinite(latency) ||
          latency < 0 ||
          latency > 120_000
        )
          return res
            .status(400)
            .json({ error: "Valid providerId and latency are required" });
        recordSuccess(providerId, latency);
        return res.status(200).json({ success: true });
      }
      case "reset":
        resetHealth(providerId);
        return res.status(200).json({ success: true });
      case "detail": {
        if (!queryProviderId)
          return res
            .status(400)
            .json({ error: "providerId parameter is required" });
        const provider = findProviderById(queryProviderId);
        return provider
          ? res.status(200).json(provider)
          : res.status(404).json({ error: "Provider not found" });
      }
      default:
        return res.status(400).json({ error: "Unsupported action" });
    }
  } catch {
    return res
      .status(502)
      .json({ error: "Provider service is temporarily unavailable" });
  }
}
