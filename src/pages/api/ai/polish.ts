import type { NextApiRequest, NextApiResponse } from "next";
import { polishRecommendationReasons } from "@/Utils/ai";
import {
  rejectUnsupportedMethod,
  setPrivateApiHeaders,
} from "@/Utils/apiValidation";

/**
 * AI polish — rewrites recommendation reasons via the gateway. Titles are
 * already real (TMDB-provided); the model only writes the personal "why".
 * Fails soft: algorithmic reasons stand when the gateway is unavailable.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (rejectUnsupportedMethod(req, res)) return;

  const { items, searchTerms } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return res.status(400).json({ error: "items (1-20) are required" });
  }

  const safeItems = items.slice(0, 20).map((item: any) => ({
    title: String(item?.title || "").slice(0, 200),
    type: item?.type === "tv" ? "tv" : "movie",
    overview: String(item?.overview || "").slice(0, 400),
    reason: String(item?.reason || "").slice(0, 300),
    rating: typeof item?.rating === "number" ? item.rating : undefined,
    year: typeof item?.year === "number" ? item.year : undefined,
  }));

  const safeTerms = Array.isArray(searchTerms)
    ? searchTerms.slice(0, 6).map((t: unknown) => String(t).slice(0, 80))
    : [];

  try {
    const upgraded = await polishRecommendationReasons(safeItems, {
      searchTerms: safeTerms,
    });
    return res.status(200).json({
      items: safeItems.map((item: any, i: number) => ({
        i,
        reason: item.reason,
      })),
      aiUsed: upgraded,
    });
  } catch {
    return res.status(200).json({ items: [], aiUsed: false });
  }
}
