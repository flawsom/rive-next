import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  setMediaMetadata,
  setMediaHandlers,
  updatePositionState,
  setPlaybackState,
} from "@/Utils/mediaSession";
import styles from "./style.module.scss";
import {
  BsPlayFill,
  BsPauseFill,
  BsVolumeUpFill,
  BsVolumeMuteFill,
  BsFullscreen,
  BsFullscreenExit,
  BsPipFill,
  BsSkipBackwardFill,
  BsSkipForwardFill,
  BsChatSquareText,
  BsSpeedometer2,
  BsHddStack,
  BsCast,
} from "react-icons/bs";

// All media flows through the SSRF-guarded proxy so CORS never blocks playback.
// Only the QUERY form is used: the path form (`/api/proxy/media/<encoded>`)
// 404s on Vercel because encoded slashes are decoded before route matching.
// The proxy rewrites every HLS child URI to an absolute upstream URL, so
// relative resolution inside playlists is never a problem.
const proxiedQuery = (url: string) =>
  `/api/proxy/media?url=${encodeURIComponent(url)}`;
const proxiedPath = (url: string) =>
  `/api/proxy/media?url=${encodeURIComponent(url)}`;

interface SubtitleTrack {
  label: string;
  src: string;
}

interface CustomPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  startSeconds?: number;
  subtitles?: SubtitleTrack[];
  startMuted?: boolean;
  onEnded?: () => void;
  onFail?: (reason: string) => void;
  onProgress?: (currentSeconds: number, durationSeconds: number) => void;
}

const isHlsUrl = (url: string) => /\.m3u8($|\?)/i.test(url);

/** minimal SRT → WebVTT conversion (timestamps + clamp) */
function srtToVtt(text: string): string {
  const block =
    "WEBVTT\n\n" +
    text
      .replace(/\r/g, "")
      .replace(/^\d+\s*$/gm, "")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
      .replace(/(\d{2}:\d{2}),(\d{3})/g, "00:$1.$2");
  return block;
}

const toSeconds = (timestamp: string): number => {
  const parts = timestamp
    .replace(",", ".")
    .split(":")
    .map((part) => parseFloat(part));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(timestamp) || 0;
};

function parseInto(textTrack: TextTrack, text: string): void {
  const vtt =
    text.trim().startsWith("WEBVTT") || text.includes("\nWEBVTT")
      ? text
      : srtToVtt(text);
  const lines = vtt.split(/\r?\n/);
  let cueStart: string | null = null;
  let cueEnd: string | null = null;
  let payload: string[] = [];

  const flush = () => {
    if (cueStart && cueEnd && toSeconds(cueEnd) > toSeconds(cueStart)) {
      try {
        const cue = new VTTCue(
          toSeconds(cueStart),
          toSeconds(cueEnd),
          payload.join("\n").trim(),
        );
        textTrack.addCue(cue);
      } catch {
        // Skip malformed cue
      }
    }
    cueStart = null;
    cueEnd = null;
    payload = [];
  };

  for (const line of lines) {
    const timing = line.match(
      /^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/,
    );
    if (timing) {
      flush();
      cueStart = timing[1].replace(",", ".");
      cueEnd = timing[2].replace(",", ".");
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (payload.length > 0 || line.trim().length > 0) {
      payload.push(line);
    }
  }
  flush();
}

async function fetchSubtitleText(url: string): Promise<string> {
  const response = await fetch(proxiedQuery(url));
  if (!response.ok) throw new Error("subtitle fetch failed");
  return response.text();
}

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const CustomPlayer = ({
  src,
  poster,
  title,
  startSeconds,
  subtitles,
  startMuted,
  onEnded,
  onFail,
  onProgress,
}: CustomPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef(0);
  const startSecondsRef = useRef(startSeconds || 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(startMuted ? 0 : 1);
  const [muted, setMuted] = useState(!!startMuted);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [levels, setLevels] = useState<{ id: number; height: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto
  const [subtitleTracks, setSubtitleTracks] = useState<
    { index: number; label: string }[]
  >([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1);
  const [menu, setMenu] = useState<"quality" | "speed" | "subs" | null>(null);

  // ─── HLS / native setup ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    startSecondsRef.current = startSeconds || 0;
    setWaiting(true);

    const applyStart = () => {
      if (startSecondsRef.current > 0 && video.duration > 0) {
        video.currentTime = Math.min(
          startSecondsRef.current,
          video.duration - 1,
        );
      }
    };

    if (isHlsUrl(src) && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        backBufferLength: 60,
      });
      hlsRef.current = hls;

      // Rebase EVERY request (master, playlists, segments) through our proxy:
      // relative children already resolve into the proxy path, and this also
      // catches absolute CDN URLs that appear inside playlists.
      hls.config.xhrSetup = (xhr: XMLHttpRequest, url: string) => {
        const rebased = url.includes("/api/proxy/media/")
          ? url
          : proxiedPath(url);
        xhr.open("GET", rebased, true);
      };
      hls.loadSource(proxiedPath(src));

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (destroyed) return;
        const parsed = (data.levels || [])
          .map((level, index) => ({
            id: index as number,
            height: (level.height || 0) as number,
          }))
          .filter((level) => level.height > 0)
          .sort((a, b) => b.height - a.height);
        setLevels(parsed);
        setWaiting(false);
        video.play().catch(() => setPlaying(false));
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          onFail?.("HLS playback failed");
        }
      });
      hls.attachMedia(video);
    } else {
      video.src = proxiedQuery(src);
      setWaiting(false);
      video.play().catch(() => setPlaying(false));
    }

    const onLoaded = () => {
      setDuration(video.duration || 0);
      applyStart();
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("loadeddata", () => setWaiting(false));
    video.addEventListener("timeupdate", () => {
      setCurrent(video.currentTime);
      updatePositionState(
        video.currentTime,
        video.playbackRate,
        video.duration || 0,
      );
      if (video.currentTime - lastProgressRef.current >= 5) {
        lastProgressRef.current = video.currentTime;
        onProgress?.(video.currentTime, video.duration || 0);
      }
    });
    video.addEventListener("durationchange", () =>
      setDuration(video.duration || 0),
    );
    video.addEventListener("play", () => setPlaying(true));
    video.addEventListener("pause", () => setPlaying(false));
    video.addEventListener("waiting", () => setWaiting(true));
    video.addEventListener("playing", () => setWaiting(false));
    video.addEventListener("ended", () => {
      setPlaying(false);
      onEnded?.();
    });
    video.addEventListener("error", () => {
      onFail?.("Playback error");
    });

    // ─── OS media integration (lockscreen / media flyout) ───────────────────
    if (title) {
      setMediaMetadata({
        title,
        artworkUrl: poster
          ? `/api/proxy/image?url=${encodeURIComponent(poster)}`
          : undefined,
      });
    }
    setMediaHandlers({
      onPlay: () => video.play().catch(() => {}),
      onPause: () => video.pause(),
      onSeekBackward: () => {
        video.currentTime = Math.max(0, video.currentTime - 10);
      },
      onSeekForward: () => {
        video.currentTime = Math.min(
          video.duration || 0,
          video.currentTime + 10,
        );
      },
      onSeekTo: (seconds) => {
        video.currentTime = Math.min(Math.max(0, seconds), video.duration || 0);
      },
    });

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setPlaybackState("none");
      setMediaHandlers({});
      video.removeAttribute("src");
      video.load();
    };
  }, [src, startSeconds, onEnded, onFail, onProgress, title, poster]);

  // ─── Subtitle tracks ──────────────────────────────────────────────────────
  const addSubtitleTrack = useCallback(async (label: string, url: string) => {
    const video = videoRef.current;
    if (!video) return;
    const track = video.addTextTrack("subtitles", label, "en");
    track.mode = "showing";
    try {
      const text = await fetchSubtitleText(url);
      parseInto(track, text);
    } catch {
      // Subtitle source unavailable; keep the track empty rather than failing.
    }
  }, []);

  const uploadSubtitleFile = useCallback((file: File) => {
    const video = videoRef.current;
    if (!video) return;
    const reader = new FileReader();
    reader.onload = () => {
      const track = video.addTextTrack(
        "subtitles",
        file.name.replace(/\.[^.]+$/, ""),
        "en",
      );
      track.mode = "showing";
      parseInto(track, String(reader.result || ""));
      setSubtitleTracks((prev) => [
        ...prev,
        { index: prev.length, label: file.name },
      ]);
      setActiveSubtitle((prev) => prev + 1);
    };
    reader.readAsText(file);
  }, []);

  // ─── Auto-hide controls ───────────────────────────────────────────────────
  const pokeControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 2600);
  }, []);

  useEffect(() => {
    pokeControls();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [pokeControls]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          video.paused ? video.play() : video.pause();
          break;
        case "f":
          event.preventDefault();
          toggleFullscreenRef.current();
          break;
        case "p":
          event.preventDefault();
          togglePipRef.current();
          break;
        case "m":
          event.preventDefault();
          setMuted((prev) => !prev);
          break;
        case "arrowleft":
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "arrowright":
          event.preventDefault();
          video.currentTime = Math.min(
            video.duration || 0,
            video.currentTime + 5,
          );
          break;
        case "arrowup":
          event.preventDefault();
          setMuted(false);
          setVolume((prev) => Math.min(1, prev + 0.1));
          break;
        case "arrowdown":
          event.preventDefault();
          setVolume((prev) => Math.max(0, prev - 0.1));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFullscreenRef = useRef<() => void>(() => {});
  useEffect(() => {
    toggleFullscreenRef.current = async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await containerRef.current?.requestFullscreen();
        }
      } catch {
        // Fullscreen unavailable
      }
    };
  }, []);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePipRef = useRef<() => void>(() => {});
  useEffect(() => {
    togglePipRef.current = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (video.requestPictureInPicture) {
          await video.requestPictureInPicture();
        }
      } catch {
        // PiP unavailable
      }
    };
  }, []);

  // ─── Volume / rate side effects ───────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = muted;
    }
  }, [volume, muted]);
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, [rate]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => setPlaying(false));
    else video.pause();
    pokeControls();
  }, [pokeControls]);

  // Reflect play/pause into the OS media session.
  useEffect(() => {
    setPlaybackState(playing ? "playing" : "paused");
  }, [playing]);

  // ─── Cast / remote playback (Chromecast + AirPlay + DIAL) ────────────────
  // The Remote Playback API covers Chromecast/DIAL devices; Safari exposes
  // AirPlay through a `webkit-cast` availability hint. We surface one button
  // that opens the browser's native device picker when available.
  const [canCast, setCanCast] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const remoteRef = useRef<any>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const check = () => {
      const remote = (video as any).remote;
      const airplayHint =
        typeof window !== "undefined" &&
        (window as any).WebKitPlaybackTargetAvailabilityEvent !== undefined;
      setCanCast(!!remote || airplayHint);
    };
    check();
    if (
      typeof window !== "undefined" &&
      (window as any).WebKitPlaybackTargetAvailabilityEvent
    ) {
      const onAvailability = (e: any) =>
        setCanCast(e.availability === "available");
      window.addEventListener(
        "WebKitPlaybackTargetAvailabilityEvent",
        onAvailability,
      );
      return () =>
        window.removeEventListener(
          "WebKitPlaybackTargetAvailabilityEvent",
          onAvailability,
        );
    }
    return undefined;
  }, []);

  const toggleCast = useCallback(async () => {
    const video = videoRef.current as any;
    if (!video) return;
    try {
      if (video.remote && video.remote.state !== "connected") {
        // Remote Playback API (Chromecast/DIAL).
        const watches = video.remote.getAvailability?.();
        await video.remote.prompt();
        remoteRef.current = video.remote;
        setIsCasting(video.remote.state === "connected");
      } else if ((window as any).WebKitPlaybackTargetAvailabilityEvent) {
        // Safari AirPlay.
        (video as any).webkitShowPlaybackTargetPicker?.();
        setIsCasting(true);
      }
    } catch {
      // User cancelled the device picker or no device available.
      setIsCasting(false);
    }
  }, []);
  const toggleCastRef = useRef(toggleCast);
  toggleCastRef.current = toggleCast;

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration || 0, video.currentTime + delta),
    );
  }, []);

  const changeQuality = (levelId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
      setCurrentLevel(levelId);
    }
    setMenu(null);
  };

  const selectSubtitle = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      tracks[i].mode = i === index ? "showing" : "disabled";
    }
    setActiveSubtitle(index);
    setMenu(null);
  };

  // Remote subtitles arrive after uploaded ones; the track indices at load
  // time are what the menu uses, so no offset bookkeeping is needed here.
  useEffect(() => {
    if (!subtitles || subtitles.length === 0) return;
    let cancelled = false;
    (async () => {
      const video = videoRef.current;
      if (!video) return;
      const base = video.textTracks.length;
      for (let i = 0; i < subtitles.length; i += 1) {
        const track = video.addTextTrack("subtitles", subtitles[i].label, "en");
        track.mode = "disabled";
        try {
          const text = await fetchSubtitleText(subtitles[i].src);
          if (!cancelled) parseInto(track, text);
        } catch {
          // Skip unavailable remote track
        }
      }
      if (!cancelled) {
        setSubtitleTracks((prev) => [
          ...prev,
          ...subtitles.map((sub, i) => ({
            index: base + i,
            label: sub.label,
          })),
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitles]);

  return (
    <div
      ref={containerRef}
      className={styles.player}
      onMouseMove={pokeControls}
      onMouseLeave={() => setShowControls(false)}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        className={styles.video}
        poster={poster || undefined}
        playsInline
        preload="auto"
      />

      {waiting && (
        <div className={styles.spinner}>
          <div className={styles.spinnerRing} />
        </div>
      )}

      {!playing && !waiting && (
        <div
          className={styles.bigPlay}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
          <BsPlayFill />
        </div>
      )}

      {title && (
        <div
          className={`${styles.titleBar} ${showControls ? "" : styles.hiddenBar}`}
        >
          <span>{title}</span>
        </div>
      )}

      {showControls && (
        <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
          {/* seek bar */}
          <div className={styles.seekRow}>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={1}
              value={Math.min(current, duration || 0)}
              onChange={(e) => {
                const video = videoRef.current;
                if (!video) return;
                video.currentTime = Number(e.target.value);
                setCurrent(Number(e.target.value));
              }}
              className={styles.seek}
              aria-label="Seek"
            />
            <span className={styles.time}>
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>

          <div className={styles.buttonRow}>
            <button
              className={styles.iconBtn}
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <BsPauseFill /> : <BsPlayFill />}
            </button>

            <button
              className={styles.iconBtn}
              onClick={() => seekBy(-10)}
              aria-label="Back 10s"
            >
              <BsSkipBackwardFill />
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => seekBy(10)}
              aria-label="Forward 10s"
            >
              <BsSkipForwardFill />
            </button>

            <button
              className={styles.iconBtn}
              onClick={() => setMuted((prev) => !prev)}
              aria-label="Mute"
            >
              {muted || volume === 0 ? (
                <BsVolumeMuteFill />
              ) : (
                <BsVolumeUpFill />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
              className={styles.volume}
              aria-label="Volume"
            />

            <div className={styles.menuWrap}>
              <button
                className={styles.iconBtn}
                onClick={() => setMenu(menu === "quality" ? null : "quality")}
                aria-label="Quality"
              >
                <BsHddStack />
              </button>
              {menu === "quality" && (
                <div className={styles.menu}>
                  <button
                    className={currentLevel === -1 ? styles.menuActive : ""}
                    onClick={() => changeQuality(-1)}
                  >
                    Auto
                  </button>
                  {levels.map((level) => (
                    <button
                      key={level.id}
                      className={
                        currentLevel === level.id ? styles.menuActive : ""
                      }
                      onClick={() => changeQuality(level.id)}
                    >
                      {level.height}p
                    </button>
                  ))}
                  {levels.length === 0 && (
                    <span className={styles.menuEmpty}>Adaptive only</span>
                  )}
                </div>
              )}
            </div>

            <div className={styles.menuWrap}>
              <button
                className={styles.iconBtn}
                onClick={() => setMenu(menu === "speed" ? null : "speed")}
                aria-label="Speed"
              >
                <BsSpeedometer2 />
              </button>
              {menu === "speed" && (
                <div className={styles.menu}>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                    <button
                      key={value}
                      className={rate === value ? styles.menuActive : ""}
                      onClick={() => {
                        setRate(value);
                        setMenu(null);
                      }}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(subtitles?.length || fileInputRef.current) && (
              <div className={styles.menuWrap}>
                <button
                  className={styles.iconBtn}
                  onClick={() => setMenu(menu === "subs" ? null : "subs")}
                  aria-label="Subtitles"
                >
                  <BsChatSquareText />
                </button>
                {menu === "subs" && (
                  <div className={styles.menu}>
                    <button
                      className={activeSubtitle === -1 ? styles.menuActive : ""}
                      onClick={() => selectSubtitle(-1)}
                    >
                      Off
                    </button>
                    {subtitleTracks.map((track) => (
                      <button
                        key={track.index}
                        className={
                          activeSubtitle === track.index
                            ? styles.menuActive
                            : ""
                        }
                        onClick={() => selectSubtitle(track.index)}
                      >
                        {track.label}
                      </button>
                    ))}
                    <button
                      className={styles.menuUpload}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload subtitles…
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1 }} />

            {canCast && (
              <button
                className={`${styles.iconBtn} ${isCasting ? styles.castActive : ""}`}
                onClick={() => toggleCastRef.current()}
                aria-label="Cast to device"
                data-tooltip-id="tooltip"
                data-tooltip-content="Cast to TV (Chromecast / AirPlay)"
              >
                <BsCast />
              </button>
            )}
            {document.pictureInPictureEnabled !== false && (
              <button
                className={styles.iconBtn}
                onClick={() => togglePipRef.current()}
                aria-label="Picture in picture"
              >
                <BsPipFill />
              </button>
            )}
            <button
              className={styles.iconBtn}
              onClick={() => toggleFullscreenRef.current()}
              aria-label="Fullscreen"
            >
              {fullscreen ? <BsFullscreenExit /> : <BsFullscreen />}
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".vtt,.srt,text/vtt,text/plain"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadSubtitleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default CustomPlayer;
