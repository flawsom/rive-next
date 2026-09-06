// ─── Playback telemetry (Bitmovin-style observability, self-hosted) ───────────
// PRD §6: startup time, rebuffer ratio, error rates, exit-before-video-start.
// The client collects; `/api/telemetry/playback` persists into an in-memory
// ring buffer (per serverless instance — zero infra) and a tiny GET endpoint
// exposes the aggregate QoE summary. Failure is always soft: telemetry must
// never affect playback.

export interface PlaybackSession {
  startedAt: number;
  contentId?: string;
  providerId?: string;
  mode: "hls" | "dash" | "file";
  startupMs: number | null;
  rebuffers: number;
  errors: number;
  exitedBeforeStart: boolean;
  watchSeconds: number;
}

const SESSION_KEY = "OpenStreamPlaybackSession";

export const startPlaybackSession = (
  mode: PlaybackSession["mode"],
  contentId?: string,
  providerId?: string,
) => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        startedAt: Date.now(),
        contentId,
        providerId,
        mode,
        startupMs: null,
        rebuffers: 0,
        errors: 0,
        exitedBeforeStart: false,
        watchSeconds: 0,
      } satisfies PlaybackSession),
    );
  } catch {
    // storage unavailable
  }
};

export const trackFirstFrame = (startupMs: number) => {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as PlaybackSession;
    session.startupMs = startupMs;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
};

export const trackRebuffer = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as PlaybackSession;
    session.rebuffers += 1;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
};

export const trackError = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as PlaybackSession;
    session.errors += 1;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
};

export const trackWatchSeconds = (seconds: number) => {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as PlaybackSession;
    session.watchSeconds += seconds;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
};

/**
 * Flush the session to the telemetry endpoint on unmount. Uses
 * `navigator.sendBeacon` when available (survives tab close), else fetch
 * keepalive. Never throws. `watchSeconds` overrides the accumulated watch
 * time (the player tracks it in a ref to avoid per-second storage writes).
 */
export const flushPlaybackSession = (watchSeconds?: number) => {
  if (typeof window === "undefined") return;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as PlaybackSession;
    if (typeof watchSeconds === "number" && watchSeconds > 0) {
      session.watchSeconds = Math.round(watchSeconds);
    }
    if (
      session.startupMs === null &&
      session.rebuffers === 0 &&
      session.errors === 0
    ) {
      session.exitedBeforeStart = true;
    }
    const body = JSON.stringify(session);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/telemetry/playback",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/telemetry/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never let telemetry break playback
  }
};
