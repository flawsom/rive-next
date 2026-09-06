import type { NextApiRequest, NextApiResponse } from "next";
import {
  rejectUnsupportedMethod,
  setPrivateApiHeaders,
} from "@/Utils/apiValidation";

// ─── Playback telemetry sink (self-hosted observability, PRD §6) ─────────────
// Accepts one PlaybackSession JSON per flush. Sessions accumulate in a
// per-instance ring buffer (serverless-safe, zero infra) and `?action=summary`
// exposes the aggregate QoE numbers that back the Sources-page observability
// card. Write path is hard-capped: a request larger than 2KB is dropped, and
// the buffer keeps the most recent 500 sessions.

interface TelemetrySession {
  startedAt?: number;
  contentId?: string;
  providerId?: string;
  mode?: string;
  startupMs?: number | null;
  rebuffers?: number;
  errors?: number;
  exitedBeforeStart?: boolean;
  watchSeconds?: number;
}

const RING_SIZE = 500;
// Module scope = per serverless instance. Good enough for a self-hosted QoE
// pulse; a durable pipeline (ClickHouse/Grafana in the PRD) is deliberately
// out of scope for Open Stream.
const ring: TelemetrySession[] = [];

const clampNum = (value: unknown, fallback: number, max: number): number => {
  const n =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(max, n));
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  setPrivateApiHeaders(res);

  if (req.method === "GET") {
    if (req.query.action === "summary") {
      const sessions = ring;
      const started = sessions.filter((s) => typeof s.startupMs === "number");
      const summary = {
        sessions: sessions.length,
        medianStartupMs: started.length
          ? Math.round(
              started.map((s) => s.startupMs as number).sort((a, b) => a - b)[
                Math.floor(started.length / 2)
              ] || 0,
            )
          : null,
        p95StartupMs: started.length
          ? Math.round(
              started.map((s) => s.startupMs as number).sort((a, b) => a - b)[
                Math.min(started.length - 1, Math.floor(started.length * 0.95))
              ] || 0,
            )
          : null,
        totalRebuffers: sessions.reduce(
          (acc, s) => acc + (s.rebuffers || 0),
          0,
        ),
        totalErrors: sessions.reduce((acc, s) => acc + (s.errors || 0), 0),
        exitBeforeStart: sessions.filter((s) => s.exitedBeforeStart).length,
        watchSeconds: Math.round(
          sessions.reduce((acc, s) => acc + (s.watchSeconds || 0), 0),
        ),
        generatedAt: new Date().toISOString(),
      };
      return res.status(200).json(summary);
    }
    return res.status(200).json({ sessions: ring.length });
  }

  if (req.method === "POST") {
    // sendBeacon sends text/plain sometimes; accept both content types.
    const body: TelemetrySession =
      typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "invalid payload" });
    }
    // Never store free-form strings longer than a sane id.
    const session: TelemetrySession = {
      startedAt: clampNum(body.startedAt, Date.now(), Date.now() + 1000),
      contentId: String(body.contentId || "").slice(0, 64) || undefined,
      providerId: String(body.providerId || "").slice(0, 64) || undefined,
      mode:
        body.mode === "hls" || body.mode === "dash" || body.mode === "file"
          ? body.mode
          : undefined,
      startupMs:
        body.startupMs === null || body.startupMs === undefined
          ? null
          : clampNum(body.startupMs, 0, 120_000),
      rebuffers: clampNum(body.rebuffers, 0, 10_000),
      errors: clampNum(body.errors, 0, 10_000),
      exitedBeforeStart: Boolean(body.exitedBeforeStart),
      watchSeconds: clampNum(body.watchSeconds, 0, 24 * 3600),
    };
    ring.push(session);
    if (ring.length > RING_SIZE) ring.shift();
    return res.status(204).end();
  }

  return rejectUnsupportedMethod(req, res, "POST, GET");
}

function safeParse(raw: string): TelemetrySession | null {
  try {
    return JSON.parse(raw) as TelemetrySession;
  } catch {
    return null;
  }
}
