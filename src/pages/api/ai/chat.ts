import type { NextApiRequest, NextApiResponse } from "next";
import { generateChatResponse } from "@/Utils/ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, viewingContext } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  try {
    const response = await generateChatResponse(messages, viewingContext);
    res.status(200).json({ response });
  } catch (error: any) {
    console.error("AI Chat error:", error?.message);

    if (error?.status === 401) {
      return res.status(500).json({
        error:
          "AI service not configured. Please add your OPENAI_API_KEY in Settings → Environment.",
      });
    }

    res.status(500).json({
      error: "Failed to generate response. Please try again.",
    });
  }
}
