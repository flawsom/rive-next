import type { NextApiRequest, NextApiResponse } from "next";
import { generateContentInsights } from "@/Utils/ai";
import { selectBestSourceForContent } from "@/Utils/sourceSelector";
import {
  asBoundedString,
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

  const body = req.body || {};
  const title = asBoundedString(body.title, 200);
  const type =
    body.type === "tv" ? "tv" : body.type === "movie" ? "movie" : null;
  if (!title || !type) {
    return res
      .status(400)
      .json({ error: "A valid title and type are required" });
  }

  const overview =
    typeof body.overview === "string" ? body.overview.slice(0, 4_000) : "";
  const genres = Array.isArray(body.genres)
    ? body.genres
        .slice(0, 15)
        .map((genre: unknown) => String(genre).slice(0, 80))
    : [];
  const cast = Array.isArray(body.cast)
    ? body.cast
        .slice(0, 10)
        .map((person: unknown) => String(person).slice(0, 120))
    : undefined;
  const year =
    typeof body.year === "string" ? body.year.slice(0, 10) : undefined;
  const rating =
    typeof body.rating === "number" && Number.isFinite(body.rating)
      ? Math.max(0, Math.min(10, body.rating))
      : undefined;

  try {
    const [insights, sourceSelection] = await withTimeout(
      Promise.all([
        generateContentInsights({
          title,
          type,
          overview,
          genres,
          rating,
          year,
          cast,
        }),
        selectBestSourceForContent(title, type),
      ]),
      90_000, // free-tier gateway models can be slow; fallback chain multiplies latency
    );

    return res.status(200).json({
      ...insights,
      source: sourceSelection
        ? {
            provider: {
              id: sourceSelection.provider.id,
              name: sourceSelection.provider.name,
              description: sourceSelection.provider.description,
              language: sourceSelection.provider.language,
              capabilities: sourceSelection.provider.capabilities,
              iconUrl: sourceSelection.provider.iconUrl,
            },
            latency: sourceSelection.latency,
            alternativesCount: sourceSelection.alternatives.length,
          }
        : null,
    });
  } catch {
    return res
      .status(502)
      .json({ error: "Insights service is temporarily unavailable" });
  }
}
