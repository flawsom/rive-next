import type { NextApiRequest, NextApiResponse } from "next";
import { generateContentInsights } from "@/Utils/ai";
import { selectBestSourceForContent } from "@/Utils/sourceSelector";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, type, overview, genres, rating, year, cast } = req.body;

  if (!title || !type) {
    return res.status(400).json({ error: "Title and type are required" });
  }

  try {
    const [insights, sourceSelection] = await Promise.all([
      generateContentInsights({
        title,
        type,
        overview: overview || "",
        genres: genres || [],
        rating,
        year,
        cast,
      }).catch(() => null),
      selectBestSourceForContent(title, type as "movie" | "tv").catch(
        () => null,
      ),
    ]);

    const response: any = {
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
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error("AI Insights error:", error?.message);
    res.status(500).json({
      error: "Failed to generate insights. Please try again.",
    });
  }
}
