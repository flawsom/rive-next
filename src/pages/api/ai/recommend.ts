import type { NextApiRequest, NextApiResponse } from "next";
import { generateRecommendations } from "@/Utils/ai";
import {
  rejectUnsupportedMethod,
  setPrivateApiHeaders,
  withTimeout,
} from "@/Utils/apiValidation";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (rejectUnsupportedMethod(req, res)) return;

  const { viewingHistory } = req.body || {};
  if (!viewingHistory || typeof viewingHistory !== "object") {
    return res.status(400).json({ error: "Viewing history is required" });
  }

  const recentlyWatched = Array.isArray(viewingHistory.recentlyWatched)
    ? viewingHistory.recentlyWatched.slice(0, 30).map((item: any) => ({
        title: String(item?.title || "").slice(0, 200),
        type: item?.type === "tv" ? "tv" : "movie",
        genres: Array.isArray(item?.genres)
          ? item.genres
              .slice(0, 10)
              .map((genre: unknown) => String(genre).slice(0, 80))
          : [],
      }))
    : [];
  const favoriteGenres = Array.isArray(viewingHistory.favoriteGenres)
    ? viewingHistory.favoriteGenres
        .slice(0, 20)
        .map((genre: unknown) => String(genre).slice(0, 80))
    : [];
  const preferences =
    typeof viewingHistory.preferences === "string"
      ? viewingHistory.preferences.slice(0, 1_000)
      : undefined;

  try {
    const result = await withTimeout(
      generateRecommendations({ recentlyWatched, favoriteGenres, preferences }),
      90_000, // free-tier gateway models can be slow; TMDB verification adds latency
    );
    return res.status(200).json(result);
  } catch {
    return res
      .status(502)
      .json({ error: "AI service is temporarily unavailable" });
  }
}
