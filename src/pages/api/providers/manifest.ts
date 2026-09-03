import type { NextApiRequest, NextApiResponse } from "next";
import {
  getOrBuildManifest,
  buildManifestFresh,
  getManifestStatus,
} from "@/Utils/providerManifest";
import { hydrateDomainsFromManifest } from "@/Utils/domainDiscovery";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";

const GET_ACTIONS = new Set(["get", "status"]);
const POST_ACTIONS = new Set(["sync"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  const action =
    typeof req.query.action === "string" ? req.query.action : "get";
  if (GET_ACTIONS.has(action) && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (POST_ACTIONS.has(action) && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!GET_ACTIONS.has(action) && !POST_ACTIONS.has(action)) {
    return res.status(400).json({ error: "Unknown action" });
  }

  try {
    switch (action) {
      case "get": {
        const manifest = await getOrBuildManifest();
        // Seed the discovery engine immediately with the fresh manifest.
        hydrateDomainsFromManifest(manifest);
        return res.status(200).json(manifest);
      }
      case "sync": {
        const manifest = await buildManifestFresh();
        hydrateDomainsFromManifest(manifest);
        return res.status(200).json(manifest);
      }
      case "status": {
        return res.status(200).json(getManifestStatus());
      }
      default:
        return res.status(400).json({ error: "Unsupported action" });
    }
  } catch {
    return res
      .status(502)
      .json({ error: "Manifest service is temporarily unavailable" });
  }
}
