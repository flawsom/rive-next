import type { NextApiRequest, NextApiResponse } from "next";
import { generateRecommendations } from "@/Utils/ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { viewingHistory } = req.body;

  if (!viewingHistory) {
    return res.status(400).json({ error: "Viewing history is required" });
  }

  try {
    const result = await generateRecommendations(viewingHistory);
    res.status(200).json(result);
  } catch (error: any) {
    console.error("AI Recommend error:", error?.message);
    res.status(500).json({
      error: "Failed to generate recommendations. Please try again.",
    });
  }
}
