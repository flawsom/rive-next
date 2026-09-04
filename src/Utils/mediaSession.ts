// MediaSession integration — lockscreen / notification-center controls for
// direct playback (custom player). Sets artwork, title, and wires play/pause/
// seek/next-episode handlers so the OS media UI works like native apps.
// Also enables background audio on mobile via the position state API.

export interface MediaSessionInfo {
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
}

function supported(): boolean {
  return typeof window !== "undefined" && "mediaSession" in navigator;
}

/** Publish current media metadata to the OS (lockscreen, media flyout). */
export function setMediaMetadata(info: MediaSessionInfo): void {
  if (!supported()) return;
  try {
    const artwork = info.artworkUrl
      ? [
          { src: info.artworkUrl, sizes: "342x513", type: "image/jpeg" },
          { src: info.artworkUrl, sizes: "512x768", type: "image/jpeg" },
        ]
      : [{ src: "/images/logo512.png", sizes: "512x512", type: "image/png" }];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: info.title,
      artist: info.artist || "Open Stream",
      album: info.album || "Open Stream",
      artwork,
    });
  } catch {
    // MediaMetadata unavailable — controls still work without metadata.
  }
}

export interface MediaSessionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onSeekBy?: (deltaSeconds: number) => void;
  onSeekTo?: (seconds: number) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
}

/** (Re)wire lockscreen action handlers. Pass null handlers to clear. */
export function setMediaHandlers(handlers: MediaSessionHandlers): void {
  if (!supported()) return;
  const set = (action: MediaSessionAction, cb: (() => void) | undefined) => {
    try {
      if (cb) {
        navigator.mediaSession.setActionHandler(action, cb);
      } else {
        navigator.mediaSession.setActionHandler(action, null);
      }
    } catch {
      // Action unsupported on this platform — skip.
    }
  };
  set("play", handlers.onPlay);
  set("pause", handlers.onPause);
  set("seekbackward", handlers.onSeekBackward);
  set("seekforward", handlers.onSeekForward);
  set("previoustrack", handlers.onPrevious);
  set("nexttrack", handlers.onNext);
  if (handlers.onSeekTo) {
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number")
          handlers.onSeekTo!(details.seekTime);
      });
    } catch {
      // seekto unsupported
    }
  }
}

/** Report playback position so lockscreen shows an accurate scrubber. */
export function updatePositionState(
  currentSeconds: number,
  rate: number,
  durationSeconds: number,
): void {
  if (!supported() || !navigator.mediaSession.setPositionState) return;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: durationSeconds,
      playbackRate: rate || 1,
      position: Math.min(Math.max(0, currentSeconds), durationSeconds),
    });
  } catch {
    // Position state can reject during transitions — non-fatal.
  }
}

export function setPlaybackState(state: "playing" | "paused" | "none"): void {
  if (!supported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // ignore
  }
}
