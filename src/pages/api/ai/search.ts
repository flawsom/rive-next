import type { NextApiRequest, NextApiResponse } from "next";
import {
  ALL_PROVIDERS,
  getProvidersByCategory,
  searchProviders,
} from "@/Utils/providers";
import { selectBestSourceForContent } from "@/Utils/sourceSelector";

interface SearchResult {
  query: string;
  bestSource: {
    provider: {
      id: string;
      name: string;
      description: string;
      language: string;
      capabilities: any;
    };
    latency: number;
  };
  availableSources: {
    id: string;
    name: string;
    description: string;
    language: string;
    capabilities: any;
    priority: number;
  }[];
  categoryDetected: string;
  totalProviders: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, type, category } = req.body;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const contentType = (type as "movie" | "tv") || "movie";
    const contentCategory = category as
      "anime" | "cartoon" | "asianDrama" | undefined;

    // Detect content type from query
    let detectedCategory = contentCategory;
    const q = query.toLowerCase();

    if (!detectedCategory) {
      if (
        /\banime\b|\bmanga\b|\bnaruto\b|\bone piece\b|\bdemon slayer\b|\battack on titan\b|\bjujutsu\b|\bdragon ball\b|\bmy hero\b|\bchainsaw man\b/i.test(
          q,
        )
      ) {
        detectedCategory = "anime";
      } else if (
        /\bcartoon\b|\bdoraemon\b|\bben 10\b|\bspongebob\b|\bshin chan\b|\btom and jerry\b/i.test(
          q,
        )
      ) {
        detectedCategory = "cartoon";
      } else if (
        /\bk[- ]?drama\b|\bkorean\b|\bkdrama\b|\bjapanese drama\b|\bchinese drama\b/i.test(
          q,
        )
      ) {
        detectedCategory = "asianDrama";
      }
    }

    // Get best source
    const selection = await selectBestSourceForContent(
      query,
      contentType,
      detectedCategory,
    );

    // Get all available sources for this category
    const categoryKey = detectedCategory || contentType;
    const availableSources = getProvidersByCategory(categoryKey as any).map(
      (p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        language: p.language,
        capabilities: p.capabilities,
        priority: p.priority,
      }),
    );

    const result: SearchResult = {
      query,
      bestSource: {
        provider: {
          id: selection.provider.id,
          name: selection.provider.name,
          description: selection.provider.description,
          language: selection.provider.language,
          capabilities: selection.provider.capabilities,
        },
        latency: selection.latency,
      },
      availableSources,
      categoryDetected: detectedCategory || contentType,
      totalProviders: ALL_PROVIDERS.length,
    };

    res.status(200).json(result);
  } catch (error: any) {
    console.error("AI Search error:", error?.message);
    res.status(500).json({
      error: "Failed to process search. Please try again.",
    });
  }
}
