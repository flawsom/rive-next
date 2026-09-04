import type { NextApiRequest, NextApiResponse } from "next";

// Vercel Hobby caps serverless functions at 60s — declare it so the platform
// does not kill the request mid-stream.
export const maxDuration = 60;
import { generateChatResponse } from "@/Utils/ai";
import {
  asBoundedString,
  rejectUnsupportedMethod,
  setPrivateApiHeaders,
  withTimeout,
} from "@/Utils/apiValidation";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (rejectUnsupportedMethod(req, res)) return;

  const { messages, viewingContext } = req.body || {};
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES
  ) {
    return res
      .status(400)
      .json({ error: `Messages must contain 1-${MAX_MESSAGES} items` });
  }

  const safeMessages = messages.map((message) => {
    const role = message?.role;
    const content = asBoundedString(message?.content, MAX_MESSAGE_LENGTH);
    return role === "user" || role === "assistant" || role === "system"
      ? { role, content }
      : null;
  });
  if (safeMessages.some((message) => !message || !message.content)) {
    return res
      .status(400)
      .json({ error: "Each message needs a valid role and content" });
  }

  const safeContext = viewingContext
    ? asBoundedString(viewingContext, 4_000) || undefined
    : undefined;

  try {
    const response = await withTimeout(
      generateChatResponse(
        safeMessages as {
          role: "user" | "assistant" | "system";
          content: string;
        }[],
        safeContext,
      ),
      55_000, // fits the Vercel Hobby function cap (60s) with headroom
    );
    return res.status(200).json({ response });
  } catch (error: any) {
    if (error?.status === 401 || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI service is not configured" });
    }
    return res
      .status(502)
      .json({ error: "AI service is temporarily unavailable" });
  }
}
