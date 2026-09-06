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
  BsGearFill,
  BsQuestionCircle,
  BsGraphUp,
  BsSunFill,
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
  /** Fired the first time the user brings sound back after a muted start. */
  onUnmute?: () => void;
}

// Direct-mode URLs are either real media files or HLS endpoints. Providers
// like 2Embed/VidEm serve HLS from extension-less URLs (_stream?id=…,
// cap.php?…), so only known native-video extensions take the <video> path;
// everything else goes through hls.js (which proxies every request).
const isHlsUrl = (url: string) =>
  !/\\.(mp4|webm|ogv|ogg|mov|m4v|mkv|avi)(\\?|$)/i.test(url);

/** minimal SRT → WebVTT conversion (timestamps + clamp) */
function srtToVtt(text: string): string {
  const block =
    "WEBVTT\\n\\n" +
    text
      .replace(/\\r/g, "")
      .replace(/^\\d+\\s*$/gm, "")
      .replace(/(\\d{2}:\\d{2}:\\d{2}),(\\d{3})/g, "$1.$2")
      .replace(/(\\d{2}:\\d{2}),(\\d{3})/g, "00:$1.$2");
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
    text.trim().startsWith("WEBVTT") || text.includes("\\nWEBVTT")
      ? text
      : srtToVtt(text);
  const lines = vtt.split(/\\r?\\n/);
  let cueStart: string | null = null;
  let cueEnd: string | null = null;
  let payload: string[] = [];

  const flush = () => {
    if (cueStart && cueEnd && toSeconds(cueEnd) > toSeconds(cueStart)) {
      try {
        const cue = new VTTCue(
          toSeconds(cueStart),
          toSeconds(cueEnd),
          payload.join("\\n").trim(),
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
      /^(\\d{2}:\\d{2}:\\d{2}[.,]\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2}[.,]\\d{3})/,
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

const SPEED_RATES = [1, 1.25, 1.5, 2];

interface PlayerPrefs {
  volume: number;
  rate: number;
  ambient: boolean;
}

const DEFAULT_PREFS: PlayerPrefs = { volume: 1, rate: 1, ambient: true };
const PREFS_KEY = "OpenStreamPlayerPrefs";

const loadPrefs = (): PlayerPrefs => {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // malformed prefs — defaults
  }
  return DEFAULT_PREFS;
};

const savePrefs = (prefs: PlayerPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatMbps = (bps: number) =>
  bps > 0 ? `${(bps / 1_000_000).toFixed(1)} Mbps` : "—";

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
  onUnmute,
}: CustomPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef(0);
  const startSecondsRef = useRef(startSeconds || 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Resume continuity across stream rotations: when the SAME title's stream
  // rotates (expired token → next server), the player remounts with a fresh
  // src. Carry the last reported position so the user doesn't jump back to
  // the start on every server switch (directRetriedRef recovers the same
  // source with fresh tokens — position must survive that).
  const lastPositionRef = useRef(0);

  const prefsRef = useRef<PlayerPrefs>(loadPrefs());

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  // Hydration-safe: server and first client render agree on defaults; stored
  // prefs are applied right after mount (never during hydration).
  const [volume, setVolume] = useState(DEFAULT_PREFS.volume);
  const [muted, setMuted] = useState(!!startMuted);
  const [rate, setRate] = useState(DEFAULT_PREFS.rate);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [levels, setLevels] = useState<{ id: number; height: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto
  const [subtitleTracks, setSubtitleTracks] = useState<
    { index: number; label: string }[]
  >([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1);
  const [menu, setMenu] = useState<
    "quality" | "speed" | "subs" | "settings" | null
  >(null);

  // ─── Ultra-player additions ──────────────────────────────────────────────
  const [ambient, setAmbient] = useState(prefsRef.current.ambient);
  const [ambientFrame, setAmbientFrame] = useState<string | null>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showStats, setShowStats] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [bufferedRanges, setBufferedRanges] = useState<
    { start: number; end: number }[]
  >([]);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [seekToast, setSeekToast] = useState<{
    id: number;
    delta: number;
  } | null>(null);
  const seekToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSoundChip, setShowSoundChip] = useState(!!startMuted);
  const soundChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback observability (PRD: time-to-first-frame, rebuffers, dropped frames).
  const t0Ref = useRef(0);
  const rebuffersRef = useRef(0);
  const [startupMs, setStartupMs] = useState<number | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [liveStats, setLiveStats] = useState({
    levelHeight: 0,
    bandwidth: 0,
    bufferAhead: 0,
    dropped: 0,
    total: 0,
    rebuffers: 0,
  });

  // Custom seekbar scrubbing + double-tap/click suppression.
  const scrubbingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  // Apply stored prefs once after mount (client-only, post-hydration).
  useEffect(() => {
    const stored = loadPrefs();
    setVolume(stored.volume);
    setRate(stored.rate);
    setAmbient(stored.ambient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist user prefs (volume, speed, ambient).
  useEffect(() => {
    savePrefs({ volume, rate, ambient });
  }, [volume, rate, ambient]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // ─── HLS / native setup ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    // A rotation for the same title keeps the last known position; a genuinely
    // new session honors the passed startSeconds.
    if (startSeconds === 0 && lastPositionRef.current > 5) {
      startSecondsRef.current = lastPositionRef.current;
    } else {
      startSecondsRef.current = startSeconds || 0;
    }
    setWaiting(true);
    setStartupMs(null);
    setVideoSize({ width: 0, height: 0 });
    setLiveStats((prev) => ({ ...prev, levelHeight: 0, bandwidth: 0 }));
    rebuffersRef.current = 0;
    t0Ref.current = performance.now();

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
        const level = hls.levels[data.level];
        if (level) {
          setLiveStats((prev) => ({
            ...prev,
            levelHeight: level.height || 0,
            bandwidth: level.bitrate || 0,
          }));
        }
      });
      hls.on(Hls.Events.LEVEL_UPDATED, (_event, data) => {
        const level = hls.levels[data.level];
        if (level) {
          setLiveStats((prev) => ({
            ...prev,
            levelHeight: level.height || 0,
            bandwidth: level.bitrate || 0,
          }));
        }
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
      if (video.currentTime > 0) lastPositionRef.current = video.currentTime;
    });
    video.addEventListener("durationchange", () =>
      setDuration(video.duration || 0),
    );
    video.addEventListener("play", () => setPlaying(true));
    video.addEventListener("pause", () => setPlaying(false));
    video.addEventListener("waiting", () => {
      setWaiting(true);
      if (playingRef.current) {
        rebuffersRef.current += 1;
        setLiveStats((prev) => ({ ...prev, rebuffers: rebuffersRef.current }));
      }
    });
    video.addEventListener("playing", () => {
      setWaiting(false);
      if (startupMs === null) {
        setStartupMs(Math.round(performance.now() - t0Ref.current));
      }
    });
    video.addEventListener("ended", () => {
      setPlaying(false);
      onEnded?.();
    });
    video.addEventListener("error", () => {
      onFail?.("Playback error");
    });
    const updateBuffered = () => {
      const ranges: { start: number; end: number }[] = [];
      try {
        for (let i = 0; i < video.buffered.length; i += 1) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i),
          });
        }
      } catch {
        // buffered access can throw during teardown
      }
      setBufferedRanges(ranges);
      let ahead = 0;
      for (const range of ranges) {
        if (
          video.currentTime >= range.start &&
          video.currentTime <= range.end
        ) {
          ahead = range.end - video.currentTime;
          break;
        }
      }
      const quality = video.getVideoPlaybackQuality?.();
      setLiveStats((prev) => ({
        ...prev,
        bufferAhead: ahead,
        dropped: quality?.droppedVideoFrames ?? prev.dropped,
        total: quality?.totalVideoFrames ?? prev.total,
      }));
    };
    video.addEventListener("progress", updateBuffered);
    video.addEventListener("loadedmetadata", () => {
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      updateBuffered();
    });
    video.addEventListener("seeked", () => {
      // Ambient backdrop refreshes on jump too (pause won't trigger the loop).
      if (ambientRef.current) captureAmbientFrame();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, startSeconds, onEnded, onFail, onProgress, title, poster]);

  // ─── Ambient glow backdrop ────────────────────────────────────────────────
  // A tiny 64px canvas snapshot of the current frame, blurred to fill the
  // screen behind the video. Costs nothing (2s cadence, 64px) and gives the
  // premium cinema glow while letterboxed content plays.
  const ambientRef = useRef(ambient);
  ambientRef.current = ambient;
  const captureAmbientFrame = () => {
    const video = videoRef.current;
    const canvas = ambientCanvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 64;
    canvas.height = Math.max(
      1,
      Math.round((64 * video.videoHeight) / (video.videoWidth || 16)),
    );
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setAmbientFrame(canvas.toDataURL("image/jpeg", 0.55));
    } catch {
      // frame capture can throw during teardown
    }
  };

  useEffect(() => {
    if (!ambient) return;
    const video = videoRef.current;
    if (!video) return;
    captureAmbientFrame();
    const interval = setInterval(() => {
      if (!video.paused) captureAmbientFrame();
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient]);

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

  // ─── Seek toast (Netflix-style "+10s" chip) ───────────────────────────────
  const showSeekToast = useCallback((delta: number) => {
    setSeekToast({ id: Date.now(), delta });
    if (seekToastTimerRef.current) clearTimeout(seekToastTimerRef.current);
    seekToastTimerRef.current = setTimeout(() => setSeekToast(null), 750);
  }, []);

  // ─── Sound handling (muted instant start → tap for sound) ────────────────
  const unmute = useCallback(() => {
    const video = videoRef.current;
    setMuted(false);
    setShowSoundChip(false);
    if (soundChipTimerRef.current) clearTimeout(soundChipTimerRef.current);
    if (video && video.paused) video.play().catch(() => setPlaying(false));
    onUnmute?.();
  }, [onUnmute]);
  const unmuteRef = useRef(unmute);
  unmuteRef.current = unmute;

  // Auto-hide the sound chip after a few seconds even without interaction.
  useEffect(() => {
    if (!startMuted) return;
    soundChipTimerRef.current = setTimeout(() => setShowSoundChip(false), 6000);
    return () => {
      if (soundChipTimerRef.current) clearTimeout(soundChipTimerRef.current);
    };
  }, [startMuted]);

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
          if (video.muted) {
            unmuteRef.current();
          } else {
            setMuted(true);
          }
          break;
        case "j":
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          showSeekToast(-10);
          break;
        case "l":
          event.preventDefault();
          video.currentTime = Math.min(
            video.duration || 0,
            video.currentTime + 10,
          );
          showSeekToast(10);
          break;
        case "arrowleft":
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          showSeekToast(-5);
          break;
        case "arrowright":
          event.preventDefault();
          video.currentTime = Math.min(
            video.duration || 0,
            video.currentTime + 5,
          );
          showSeekToast(5);
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
        case "t":
          event.preventDefault();
          setRate((prev) => {
            const index = SPEED_RATES.indexOf(prev);
            return SPEED_RATES[(index + 1) % SPEED_RATES.length];
          });
          break;
        case "d":
          event.preventDefault();
          setShowStats((prev) => !prev);
          setMenu(null);
          break;
        case "?":
          event.preventDefault();
          setShowShortcuts((prev) => !prev);
          setMenu(null);
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

  // ─── Custom seekbar ───────────────────────────────────────────────────────
  const seekFromEvent = useCallback(
    (clientX: number) => {
      const video = videoRef.current;
      const wrap = seekWrapRef.current;
      if (!video || !wrap || !duration) return;
      const rect = wrap.getBoundingClientRect();
      const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
      const target = frac * duration;
      video.currentTime = target;
      setCurrent(target);
    },
    [duration],
  );
  const seekWrapRef = useRef<HTMLDivElement>(null);

  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported — drag still works over the bar
    }
    seekFromEvent(e.clientX);
    pokeControls();
  };
  const onSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current) {
      seekFromEvent(e.clientX);
      return;
    }
    const wrap = seekWrapRef.current;
    if (!wrap || !duration) return;
    const rect = wrap.getBoundingClientRect();
    const frac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setHoverSec(frac * duration);
  };
  const onSeekPointerUp = () => {
    scrubbingRef.current = false;
  };

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

  // ─── Double-click fullscreen / double-tap seek ────────────────────────────
  const onContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) return;
    togglePlay();
  };
  const onContainerDoubleClick = () => {
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 400);
    toggleFullscreenRef.current();
    pokeControls();
  };
  const onContainerTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const now = Date.now();
    const prev = lastTapRef.current;
    lastTapRef.current = { t: now, x: touch.clientX, y: touch.clientY };
    if (
      prev &&
      now - prev.t < 300 &&
      Math.abs(touch.clientX - prev.x) < 48 &&
      Math.abs(touch.clientY - prev.y) < 48
    ) {
      // Double tap → seek by side of screen.
      const rect = containerRef.current?.getBoundingClientRect();
      const side = rect && touch.clientX > rect.left + rect.width / 2 ? 1 : -1;
      const delta = 10 * side;
      seekBy(delta);
      showSeekToast(delta);
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 400);
    }
  };

  const playedFraction = duration > 0 ? clamp(current / duration, 0, 1) : 0;

  return (
    <div
      ref={containerRef}
      className={`${styles.player} ${showControls ? "" : styles.hideCursor}`}
      onMouseMove={pokeControls}
      onMouseLeave={() => setShowControls(false)}
      onClick={onContainerClick}
      onDoubleClick={onContainerDoubleClick}
      onTouchEnd={onContainerTouchEnd}
    >
      <video
        ref={videoRef}
        className={styles.video}
        poster={poster || undefined}
        playsInline
        preload="auto"
      />

      {ambient && ambientFrame && (
        <div
          className={styles.ambient}
          style={{ backgroundImage: `url(${ambientFrame})` }}
        />
      )}
      <canvas ref={ambientCanvasRef} style={{ display: "none" }} />

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

      {showSoundChip && muted && (
        <button
          className={styles.soundChip}
          onClick={(e) => {
            e.stopPropagation();
            unmuteRef.current();
          }}
          aria-label="Unmute"
        >
          <BsVolumeMuteFill /> Sound off — tap for sound
        </button>
      )}

      {seekToast && (
        <div key={seekToast.id} className={styles.seekToast}>
          {seekToast.delta > 0 ? "+" : ""}
          {seekToast.delta}s
        </div>
      )}

      {showStats && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            e.stopPropagation();
            setShowStats(false);
          }}
        >
          <div className={styles.overlayTitle}>Playback stats</div>
          <div className={styles.statGrid}>
            <span>Startup</span>
            <strong>{startupMs !== null ? `${startupMs} ms` : "…"}</strong>
            <span>Resolution</span>
            <strong>
              {videoSize.width > 0
                ? `${videoSize.width}×${videoSize.height}`
                : "…"}
            </strong>
            <span>Quality</span>
            <strong>
              {currentLevel === -1
                ? `Auto${liveStats.levelHeight ? ` (${liveStats.levelHeight}p)` : ""}`
                : `${liveStats.levelHeight || "?"}p`}
            </strong>
            <span>Bitrate</span>
            <strong>{formatMbps(liveStats.bandwidth)}</strong>
            <span>Buffer ahead</span>
            <strong>{liveStats.bufferAhead.toFixed(1)}s</strong>
            <span>Dropped frames</span>
            <strong>
              {liveStats.total > 0
                ? `${liveStats.dropped} / ${liveStats.total}`
                : "—"}
            </strong>
            <span>Rebuffers</span>
            <strong>{liveStats.rebuffers}</strong>
            <span>Mode</span>
            <strong>{isHlsUrl(src) ? "HLS (hls.js)" : "Direct file"}</strong>
            <span>Speed</span>
            <strong>{rate}×</strong>
            <span>Volume</span>
            <strong>{muted ? "Muted" : `${Math.round(volume * 100)}%`}</strong>
          </div>
          <div className={styles.overlayHint}>Press D to close</div>
        </div>
      )}

      {showShortcuts && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            e.stopPropagation();
            setShowShortcuts(false);
          }}
        >
          <div className={styles.overlayTitle}>Keyboard shortcuts</div>
          <div className={styles.shortcutGrid}>
            {[
              ["Space / K", "Play / Pause"],
              ["← / →", "Back / Forward 5s"],
              ["J / L", "Back / Forward 10s"],
              ["↑ / ↓", "Volume"],
              ["M", "Mute / Unmute"],
              ["F", "Fullscreen"],
              ["P", "Picture-in-Picture"],
              ["T", "Playback speed"],
              ["D", "Playback stats"],
              ["? / Shift + /", "This panel"],
            ].map(([key, action]) => (
              <div key={key} className={styles.shortcutRow}>
                <kbd>{key}</kbd>
                <span>{action}</span>
              </div>
            ))}
          </div>
          <div className={styles.overlayHint}>Press ? to close</div>
        </div>
      )}

      {showControls && (
        <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
          {/* seek bar */}
          <div className={styles.seekRow}>
            <div
              ref={seekWrapRef}
              className={styles.seekWrap}
              onPointerDown={onSeekPointerDown}
              onPointerMove={onSeekPointerMove}
              onPointerUp={onSeekPointerUp}
              onPointerLeave={() => {
                scrubbingRef.current = false;
                setHoverSec(null);
              }}
            >
              <div className={styles.seekTrack}>
                {bufferedRanges.map((range, index) => (
                  <div
                    key={index}
                    className={styles.seekBuffer}
                    style={{
                      left: `${(range.start / (duration || 1)) * 100}%`,
                      width: `${((range.end - range.start) / (duration || 1)) * 100}%`,
                    }}
                  />
                ))}
                <div
                  className={styles.seekPlayed}
                  style={{ width: `${playedFraction * 100}%` }}
                />
              </div>
              <div
                className={styles.seekThumb}
                style={{ left: `${playedFraction * 100}%` }}
              />
              {hoverSec !== null && (
                <div
                  className={styles.seekTooltip}
                  style={{ left: `${(hoverSec / (duration || 1)) * 100}%` }}
                >
                  {formatTime(hoverSec)}
                </div>
              )}
            </div>
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
              onClick={() => {
                if (muted) {
                  unmuteRef.current();
                } else {
                  setMuted(true);
                }
              }}
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
                if (muted) {
                  setMuted(false);
                  onUnmute?.();
                }
                setShowSoundChip(false);
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

            {/* Settings: ambient glow, stats, shortcuts */}
            <div className={styles.menuWrap}>
              <button
                className={styles.iconBtn}
                onClick={() => setMenu(menu === "settings" ? null : "settings")}
                aria-label="Settings"
              >
                <BsGearFill />
              </button>
              {menu === "settings" && (
                <div className={styles.menu}>
                  <button
                    className={ambient ? styles.menuActive : ""}
                    onClick={() => setAmbient((prev) => !prev)}
                  >
                    <BsSunFill /> Ambient glow {ambient ? "on" : "off"}
                  </button>
                  <button
                    onClick={() => {
                      setShowStats(true);
                      setMenu(null);
                    }}
                  >
                    <BsGraphUp /> Playback stats
                  </button>
                  <button
                    onClick={() => {
                      setShowShortcuts(true);
                      setMenu(null);
                    }}
                  >
                    <BsQuestionCircle /> Shortcut hints
                  </button>
                </div>
              )}
            </div>

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
