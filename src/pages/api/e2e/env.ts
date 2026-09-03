import type { NextApiRequest, NextApiResponse } from "next";
import {
  rejectUnsupportedMethod,
  setPrivateApiHeaders,
} from "@/Utils/apiValidation";

/**
 * E2E preflight — tells the test suites which integrations are configured so
 * they can assert live-data behavior instead of graceful degradation.
 *
 * Security: returns boolean capability flags ONLY. It never exposes secret
 * values, key names beyond their presence, or anything writable.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);
  if (rejectUnsupportedMethod(req, res, "GET")) return;

  const tmdb = Boolean(
    process.env.NEXT_PUBLIC_TMDB_API_KEY &&
    process.env.NEXT_PUBLIC_TMDB_API_KEY.length > 0,
  );
  const openai = Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0,
  );
  const streamSeed = Boolean(
    process.env.NEXT_PUBLIC_STREAM_URL &&
    process.env.NEXT_PUBLIC_STREAM_URL.length > 0,
  );

  return res.status(200).json({
    tmdb,
    openai,
    streamSeed,
    generatedAt: new Date().toISOString(),
  });
}
