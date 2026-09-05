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
import { setPrivateApiHeaders } from "@/Utils/apiValidation";
import { findProviderById } from "@/Utils/providers";
import { getOrBuildManifest } from "@/Utils/providerManifest";
import { hydrateDomainsFromManifest } from "@/Utils/domainDiscovery";

const GET_ACTIONS = new Set([
  "bestDomain",
  "status",
  "getPatterns",
  "liveMap",
  "activeStreamUrl",
  "cachedDomain",
]);
const POST_ACTIONS = new Set([
  "discover",
  "discoverAll",
  "autoUpdate",
  "refresh",
  "addPatterns",
  "resolveStream",
  "resolveDownload",
  "reportFailure",
  "reportSuccess",
  "probe",
]);

// Only public http(s) hosts may be probed; block private/loopback targets.
function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("[")
  )
    return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  const action = typeof req.query.action === "string" ? req.query.action : "";
  if (GET_ACTIONS.has(action) && req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (POST_ACTIONS.has(action) && req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (!GET_ACTIONS.has(action) && !POST_ACTIONS.has(action))
    return res.status(400).json({ error: "Unknown action" });

  const providerId =
    typeof req.query.providerId === "string" ? req.query.providerId : undefined;
  try {
    switch (action) {
      case "bestDomain":
        return providerId
          ? res.status(200).json({
              provider: providerId,
              domain: await getBestDomain(providerId),
            })
          : res.status(400).json({ error: "providerId is required" });
      case "status":
        return res.status(200).json(getDiscoveryStatus());
      case "getPatterns":
        return res.status(200).json(getDomainPatterns());
      case "liveMap":
        return res.status(200).json(getLiveDomainMap());
      case "activeStreamUrl":
        return res.status(200).json({ url: getActiveStreamUrl() });
      case "cachedDomain":
        return providerId
          ? res.status(200).json({
              provider: providerId,
              domain: getCachedDomain(providerId),
            })
          : res.status(400).json({ error: "providerId is required" });
      case "discover":
      case "refresh": {
        if (!providerId || !findProviderById(providerId))
          return res
            .status(400)
            .json({ error: "Valid providerId is required" });
        // Sync the autonomous manifest first so discovery probes the freshest domain pool.
        const manifest = await getOrBuildManifest();
        hydrateDomainsFromManifest(manifest);
        return res
          .status(200)
          .json(
            await (action === "discover"
              ? discoverDomains(providerId)
              : forceRefresh(providerId)),
          );
      }
      case "discoverAll": {
        const manifest = await getOrBuildManifest();
        hydrateDomainsFromManifest(manifest);
        return res.status(200).json(await discoverAllDomains());
      }
      case "autoUpdate": {
        const manifest = await getOrBuildManifest();
        hydrateDomainsFromManifest(manifest);
        return res.status(200).json(await autoUpdateStreamingUrl());
      }
      case "addPatterns": {
        const patterns =
          typeof req.body?.patterns === "string"
            ? JSON.parse(req.body.patterns)
            : req.body?.patterns;
        if (
          !providerId ||
          !findProviderById(providerId) ||
          !Array.isArray(patterns) ||
          patterns.length === 0 ||
          patterns.length > 20 ||
          patterns.some(
            (value) => typeof value !== "string" || value.length > 200,
          )
        )
          return res
            .status(400)
            .json({ error: "Valid providerId and patterns are required" });
        addDomainPatterns(providerId, patterns);
        return res
          .status(200)
          .json({ success: true, patternsAdded: patterns.length });
      }
      case "resolveStream":
      case "resolveDownload": {
        const id =
          typeof req.body?.id === "string" ? req.body.id.slice(0, 100) : "";
        const type = req.body?.type === "tv" ? "tv" : "movie";
        if (!providerId || !findProviderById(providerId) || !id)
          return res
            .status(400)
            .json({ error: "Valid providerId and id are required" });
        const resolver =
          action === "resolveStream" ? resolveStreamUrl : resolveDownloadUrl;
        return res.status(200).json({
          url: resolver(
            providerId,
            type,
            id,
            Number(req.body.season) || undefined,
            Number(req.body.episode) || undefined,
          ),
          provider: providerId,
        });
      }
      case "probe": {
        const url =
          typeof req.body?.url === "string" ? req.body.url.trim() : "";
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return res.status(400).json({ error: "Invalid url" });
        }
        if (
          url.length > 500 ||
          !/^https?:$/i.test(parsed.protocol) ||
          !isPublicHostname(parsed.hostname)
        ) {
          return res.status(400).json({ error: "Url not allowed" });
        }
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8_000);
          const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: { "user-agent": "OpenStreamProbe/1.0" },
          });
          clearTimeout(timer);
          try {
            await response.body?.cancel();
          } catch {
            /* best effort */
          }
          // Real-site signal: does the origin serve a sitemap? Parked landers
          // and challenge stubs don't; WordPress movie sites do.
          let sitemap = false;
          if (response.ok && !response.redirected) {
            try {
              const origin = new URL("/sitemap.xml", url).toString();
              const c2 = new AbortController();
              const t2 = setTimeout(() => c2.abort(), 4_000);
              const sm = await fetch(origin, {
                method: "GET",
                redirect: "follow",
                signal: c2.signal,
                headers: { "user-agent": "OpenStreamProbe/1.0" },
              });
              clearTimeout(t2);
              if (sm.ok) {
                const ct = sm.headers.get("content-type") || "";
                sitemap = ct.includes("xml") || ct.includes("text/plain");
              }
              try {
                await sm.body?.cancel();
              } catch {
                /* best effort */
              }
            } catch {
              /* no sitemap */
            }
          }
          return res.status(200).json({
            url,
            status: response.status,
            ok: response.ok,
            latency: Date.now() - start,
            sitemap,
          });
        } catch {
          return res
            .status(200)
            .json({ url, status: 0, ok: false, latency: -1 });
        }
      }
      case "reportFailure":
        if (
          !providerId ||
          !findProviderById(providerId) ||
          typeof req.body?.url !== "string"
        )
          return res
            .status(400)
            .json({ error: "Valid providerId and url are required" });
        recordDomainFailure(providerId, req.body.url.slice(0, 500));
        return res.status(200).json({ success: true });
      case "reportSuccess": {
        const latency = Number(req.body?.latency);
        if (
          !providerId ||
          !findProviderById(providerId) ||
          typeof req.body?.url !== "string" ||
          !Number.isFinite(latency) ||
          latency < 0 ||
          latency > 120_000
        )
          return res
            .status(400)
            .json({ error: "Valid providerId, url, and latency are required" });
        recordDomainSuccess(providerId, req.body.url.slice(0, 500), latency);
        return res.status(200).json({ success: true });
      }
      default:
        return res.status(400).json({ error: "Unsupported action" });
    }
  } catch {
    return res
      .status(502)
      .json({ error: "Domain service is temporarily unavailable" });
  }
}
