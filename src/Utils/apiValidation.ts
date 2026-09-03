import type { NextApiRequest, NextApiResponse } from "next";

export function rejectUnsupportedMethod(
  req: NextApiRequest,
  res: NextApiResponse,
  method = "POST",
): boolean {
  if (req.method !== method) {
    res.setHeader("Allow", method);
    res
      .status(405)
      .json({ error: `Method ${req.method || "unknown"} not allowed` });
    return true;
  }
  return false;
}

export function setPrivateApiHeaders(res: NextApiResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function asBoundedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = "Request timed out",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
