import type { NextApiRequest, NextApiResponse } from "next";
import axiosFetch from "@/Utils/fetch";
import { getCache, setCache } from "@/Utils/cache";
import { setPrivateApiHeaders, withTimeout } from "@/Utils/apiValidation";

const ALLOWED_REQUESTS = new Set([
  "latestMovie",
  "latestTv",
  "upcomingMovie",
  "popularMovie",
  "popularTv",
  "topRatedMovie",
  "topRatedTv",
  "filterMovie",
  "filterTv",
  "onTheAirTv",
  "trending",
  "trendingMovie",
  "trendingTv",
  "trendingMovieDay",
  "trendingTvDay",
  "searchMulti",
  "searchKeyword",
  "searchMovie",
  "searchTv",
  "movieData",
  "tvData",
  "personData",
  "movieVideos",
  "tvVideos",
  "movieImages",
  "tvImages",
  "personImages",
  "movieCasts",
  "tvCasts",
  "movieReviews",
  "tvReviews",
  "movieRelated",
  "tvRelated",
  "tvEpisodes",
  "tvEpisodeDetail",
  "movieSimilar",
  "tvSimilar",
  "personMovie",
  "personTv",
  "genresMovie",
  "genresTv",
  "countries",
  "languages",
  "random",
  "collection",
  "searchCollection",
  "withKeywordsTv",
  "withKeywordsMovie",
]);

const bounded = (value: string | string[] | undefined, max = 200) =>
  typeof value === "string" ? value.slice(0, max) : undefined;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>,
) {
  setPrivateApiHeaders(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestID = bounded(req.query.requestID, 40);
  if (!requestID || !ALLOWED_REQUESTS.has(requestID)) {
    return res.status(400).json({ error: "Unsupported request" });
  }

  const query = Object.fromEntries(
    Object.entries(req.query).map(([key, value]) => [key, bounded(value)]),
  );
  const cacheKey = JSON.stringify(query);
  const cachedResult = getCache(cacheKey);
  if (cachedResult) return res.status(200).json(cachedResult);

  try {
    const result = await withTimeout(
      axiosFetch({
        requestID,
        id: bounded(req.query.id),
        language: bounded(req.query.language, 20),
        page: Math.max(1, Math.min(500, Number(req.query.page) || 1)),
        genreKeywords: bounded(req.query.genreKeywords, 100),
        sortBy: bounded(req.query.sortBy, 50),
        year: Number.isFinite(Number(req.query.year))
          ? Math.max(1800, Math.min(2200, Number(req.query.year)))
          : undefined,
        country: bounded(req.query.country, 20),
        query: bounded(req.query.query, 200),
        season: Number.isFinite(Number(req.query.season))
          ? Math.max(1, Math.min(100, Number(req.query.season)))
          : undefined,
        episode: Number.isFinite(Number(req.query.episode))
          ? Math.max(1, Math.min(10_000, Number(req.query.episode)))
          : undefined,
      }),
      15_000,
    );
    if (result === undefined || result === null)
      return res.status(502).json({ error: "Metadata service unavailable" });
    setCache(cacheKey, result);
    return res.status(200).json(result);
  } catch {
    return res.status(502).json({ error: "Metadata service unavailable" });
  }
}
