// Geo detection endpoint.
//
// On Vercel the edge injects `x-vercel-ip-country` (ISO 3166-1 alpha-2) on
// every request, so this is free, fast (no upstream call), and accurate for
// the visitor's real location. Falls back to a client-IP lookup against
// ipapi.co for local development and self-hosted deployments, then to a
// neutral "worldwide" default that renders the global rows.
import type { NextApiRequest, NextApiResponse } from "next";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";

export const maxDuration = 8;

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  BR: "Brazil",
  MX: "Mexico",
  AU: "Australia",
  NG: "Nigeria",
  PH: "Philippines",
  ID: "Indonesia",
  PK: "Pakistan",
  BD: "Bangladesh",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  RU: "Russia",
  TR: "Turkey",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  ZA: "South Africa",
  AR: "Argentina",
  TH: "Thailand",
  VN: "Vietnam",
};

function countryName(code: string): string | undefined {
  return COUNTRY_NAMES[code.toUpperCase()];
}

function normalize(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

async function lookupByIp(ip: string): Promise<string | null> {
  const attempt = async (url: string, pick: (data: any) => any) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_500);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return normalize(String(pick(await res.json()) ?? ""));
    } catch {
      return null;
    }
  };
  // Primary: ipwho.is (1k req/day, HTTPS, no key). Fallback: ipapi.co.
  return (
    (await attempt(
      `https://ipwho.is/${encodeURIComponent(ip)}`,
      (d) => d?.country_code,
    )) ||
    (await attempt(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      (d) => d?.country_code,
    ))
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1) Vercel edge geo (production) — no network call needed.
  const edgeCountry =
    normalize(req.headers["x-vercel-ip-country"] as string | undefined) ||
    normalize(req.headers["cf-ipcountry"] as string | undefined);
  if (edgeCountry) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      country: edgeCountry,
      regionName: countryName(edgeCountry),
      source: "edge",
    });
  }

  // 2) Fallback for dev/self-hosted: resolve the client IP (honoring proxies).
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : req.socket?.remoteAddress || "";
  if (
    ip &&
    !/^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  ) {
    const resolved = await lookupByIp(ip);
    if (resolved) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        country: resolved,
        regionName: countryName(resolved),
        source: "edge",
      });
    }
  }

  // 3) Worldwide default — home renders global rows.
  res.setHeader("Cache-Control", "no-store");
  return res
    .status(200)
    .json({ country: "US", regionName: "Worldwide", source: "fallback" });
}
