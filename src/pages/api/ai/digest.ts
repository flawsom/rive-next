// AI weekly digest — recaps the viewer's week and suggests one weekend pick.
// Reading the profile happens client-side (scoped per profile); this endpoint
// only does the AI generation, so it works for guests too.
import type { NextApiRequest, NextApiResponse } from "next";
import { setPrivateApiHeaders } from "@/Utils/apiValidation";
import { isAiConfigured, generateWeeklyDigest } from "@/Utils/ai";

export const maxDuration = 60;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAiConfigured()) {
    return res.status(503).json({ error: "AI is not configured" });
  }

  const body = req.body || {};
  const watchedTitles: any[] = Array.isArray(body.watchedTitles)
    ? body.watchedTitles.slice(0, 10)
    : [];
  const totalMinutes = Math.max(0, Number(body.totalMinutes) || 0);
  const topGenres: string[] = Array.isArray(body.topGenres)
    ? body.topGenres
        .filter((g: any) => typeof g === "string")
        .slice(0, 5)
        .map((g: string) => g.slice(0, 40))
    : [];

  if (watchedTitles.length === 0) {
    return res.status(400).json({ error: "watchedTitles is required" });
  }

  try {
    const digest = await generateWeeklyDigest({
      watchedTitles: watchedTitles.map((t) => ({
        title: String(t?.title || "").slice(0, 120),
        type: t?.type === "tv" ? "tv" : "movie",
        genres: Array.isArray(t?.genres)
          ? t.genres
              .filter((g: any) => typeof g === "string")
              .slice(0, 4)
              .map((g: string) => String(g).slice(0, 40))
          : [],
      })),
      totalMinutes,
      topGenres,
    });
    return res.status(200).json(digest);
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message || "Digest generation failed" });
  }
}
