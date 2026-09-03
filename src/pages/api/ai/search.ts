import type { NextApiRequest, NextApiResponse } from "next";
import { ALL_PROVIDERS, getProvidersByCategory } from "@/Utils/providers";
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
  const query = asBoundedString(body.query, 200);
  if (!query)
    return res.status(400).json({ error: "A valid query is required" });

  const contentType = body.type === "tv" ? "tv" : "movie";
  const category = ["anime", "cartoon", "asianDrama"].includes(body.category)
    ? body.category
    : undefined;
  const q = query.toLowerCase();
  const detectedCategory =
    category ||
    (/\banime\b|\bmanga\b|\bnaruto\b|\bone piece\b|\bdemon slayer\b|\battack on titan\b|\bjujutsu\b|\bdragon ball\b/i.test(
      q,
    )
      ? "anime"
      : /\bcartoon\b|\bdoraemon\b|\bben 10\b|\bspongebob\b|\bshin chan\b|\btom and jerry\b/i.test(
            q,
          )
        ? "cartoon"
        : /\bk[- ]?drama\b|\bkorean\b|\bkdrama\b|\bjapanese drama\b|\bchinese drama\b/i.test(
              q,
            )
          ? "asianDrama"
          : undefined);

  try {
    const selection = await withTimeout(
      selectBestSourceForContent(query, contentType, detectedCategory as any),
      15_000,
    );
    const providers = getProvidersByCategory(
      (detectedCategory || contentType) as any,
    );
    return res.status(200).json({
      query,
      bestSource: {
        provider: selection.provider,
        latency: selection.latency,
      },
      availableSources: providers,
      categoryDetected: detectedCategory || contentType,
      totalProviders: ALL_PROVIDERS.length,
    });
  } catch {
    return res
      .status(502)
      .json({ error: "Provider search is temporarily unavailable" });
  }
}
