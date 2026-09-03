import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "@/styles/Watch.module.scss";
import {
  setContinueWatching,
  removeContinueWatching,
  getContinueWatchingEntries,
} from "@/Utils/continueWatching";
import { toast } from "sonner";
import { IoReturnDownBack } from "react-icons/io5";
import { FaForwardStep, FaBackwardStep } from "react-icons/fa6";
import {
  BsHddStack,
  BsHddStackFill,
  BsArrowClockwise,
  BsDownload,
  BsSkipForwardFill,
} from "react-icons/bs";
import axiosFetch from "@/Utils/fetchBackend";
import WatchDetails from "@/components/WatchDetails";
import SourceSelector from "@/components/SourceSelector";
import SourceMetadata from "@/components/SourceMetadata";
import CustomPlayer from "@/components/CustomPlayer";
import { recordWatch, getHistoryEntries } from "@/Utils/watchHistory";
import {
  Provider,
  findProviderById,
  getProviderQualityTier,
} from "@/Utils/providers";
import {
  resolveStreamUrl,
  recordDomainFailure,
  recordDomainSuccess,
  getCachedDomain,
  autoUpdateStreamingUrl,
  forceRefresh,
} from "@/Utils/domainDiscovery";

const Watch = () => {
  const params = useSearchParams();
  const { back, push } = useRouter();
  const [type, setType] = useState<string | null>("");
  const [id, setId] = useState<any>();
  const [season, setSeason] = useState<any>();
  const [episode, setEpisode] = useState<any>();
  const [minEpisodes, setMinEpisodes] = useState(1);
  const [maxEpisodes, setMaxEpisodes] = useState(2);
  const [maxSeason, setMaxSeason] = useState(1);
  const [nextSeasonMinEpisodes, setNextSeasonMinEpisodes] = useState(1);
  const [loading, setLoading] = useState(true);
  const [watchDetails, setWatchDetails] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [data, setdata] = useState<any>();
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  const [selectedProviderId, setSelectedProviderId] =
    useState<string>("hdhub4u");
  const [isAutoSwitched, setIsAutoSwitched] = useState(false);
  const [previousProviderName, setPreviousProviderName] = useState<string>("");
  const userPickedProvider = useRef(false);
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [domainVersion, setDomainVersion] = useState(0);
  const [isDownloadMode, setIsDownloadMode] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"embed" | "direct">("embed");
  const nextBtn: any = useRef(null);
  const backBtn: any = useRef(null);
  const moreBtn: any = useRef(null);
  const sourceBtn: any = useRef(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Check for download mode
  useEffect(() => {
    setIsDownloadMode(params.get("source") === "download");
  }, [params]);

  // Determine category for source selection
  const getSourceCategory = useCallback(():
    "movie" | "tv" | "anime" | "cartoon" | "asianDrama" => {
    if (!data) return type === "tv" ? "tv" : "movie";
    const title = (data.name || data.title || "").toLowerCase();
    if (
      /\banime\b|\bnaruto\b|\bone piece\b|\bdemon slayer\b|\battack on titan\b|\bjujutsu\b|\bdragon ball\b|\bmy hero\b|\bchainsaw man\b/i.test(
        title,
      )
    ) {
      return "anime";
    }
    if (
      /\bcartoon\b|\bdoraemon\b|\bben 10\b|\bspongebob\b|\bshin chan\b/i.test(
        title,
      )
    ) {
      return "cartoon";
    }
    if (
      /\bk[- ]?drama\b|\bkorean\b|\bkdrama\b|\bjapanese\b|\bchinese drama\b/i.test(
        title,
      )
    ) {
      return "asianDrama";
    }
    return type === "tv" ? "tv" : "movie";
  }, [data, type]);

  // Load default provider instantly
  useEffect(() => {
    setType(params.get("type"));
    setId(params.get("id"));
    setSeason(params.get("season"));
    setEpisode(params.get("episode"));
  }, [params]);

  // Autonomously promote the best verified domain (HDHub4U/MoviesDrive) on load
  useEffect(() => {
    let cancelled = false;
    autoUpdateStreamingUrl()
      .then((result) => {
        if (!cancelled && result.updated) setDomainVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  useEffect(() => {
    const loadProvider = async () => {
      try {
        const category = getSourceCategory();
        // Until the user picks a source manually, the default is decided purely
        // by latency/availability (HDHub4U vs MoviesDrive), not by preference.
        const providerParam = userPickedProvider.current
          ? `&providerId=${selectedProviderId}`
          : "";
        const response = await fetch(
          `/api/providers/sources?action=best&category=${category}${providerParam}`,
        );
        if (response.ok) {
          const selection = await response.json();
          setCurrentProvider(selection.provider);
          setSelectedProviderId(selection.provider.id);
        }
      } catch (err) {
        const fallback = findProviderById("hdhub4u");
        if (fallback) setCurrentProvider(fallback);
      }
    };
    loadProvider();
  }, [getSourceCategory, selectedProviderId]);

  useEffect(() => {
    setLoading(true);
    setType(params.get("type"));
    setId(params.get("id"));
    setSeason(params.get("season"));
    setEpisode(params.get("episode"));
    setIframeError(false);
    setIframeLoading(true);

    const fetch = async () => {
      const res: any = await axiosFetch({ requestID: `${type}Data`, id: id });
      setdata(res);
      setMaxSeason(res?.number_of_seasons);
      const seasonData = await axiosFetch({
        requestID: "tvEpisodes",
        id: id,
        season: season,
      });
      seasonData?.episodes?.length > 0 &&
        setMaxEpisodes(
          seasonData?.episodes[seasonData?.episodes?.length - 1]
            ?.episode_number,
        );
      setMinEpisodes(seasonData?.episodes[0]?.episode_number);
      if (parseInt(episode) >= maxEpisodes - 1) {
        var nextseasonData = await axiosFetch({
          requestID: "tvEpisodes",
          id: id,
          season: parseInt(season) + 1,
        });
        nextseasonData?.episodes?.length > 0 &&
          setNextSeasonMinEpisodes(nextseasonData?.episodes[0]?.episode_number);
      }
    };
    if (type === "tv") fetch();

    const handleKeyDown = (event: any) => {
      if (event.shiftKey && event.key === "N") {
        event.preventDefault();
        nextBtn?.current.click();
      } else if (event.shiftKey && event.key === "P") {
        event.preventDefault();
        backBtn?.current.click();
      } else if (event.shiftKey && event.key === "M") {
        event.preventDefault();
        moreBtn?.current.click();
      } else if (event.shiftKey && event.key === "S") {
        event.preventDefault();
        sourceBtn?.current.click();
      } else if (event.shiftKey && event.key === "D") {
        event.preventDefault();
        handleDownload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [params, id, season, episode]);

  function handleBackward() {
    if (episode > minEpisodes)
      push(
        `/watch?type=tv&id=${id}&season=${season}&episode=${parseInt(episode) - 1}`,
      );
  }
  function handleForward() {
    if (type !== "tv") return;
    let target: string | null = null;
    let nextSeason = parseInt(season);
    let nextEpisode = parseInt(episode) + 1;
    if (episode < maxEpisodes) {
      target = `/watch?type=tv&id=${id}&season=${season}&episode=${parseInt(episode) + 1}`;
    } else if (parseInt(season) + 1 <= maxSeason) {
      nextSeason = parseInt(season) + 1;
      nextEpisode = nextSeasonMinEpisodes;
      target = `/watch?type=tv&id=${id}&season=${nextSeason}&episode=${nextSeasonMinEpisodes}`;
    }
    if (!target) return;

    if (!autoAdvanceEnabled()) {
      push(target);
      return;
    }

    // Best-effort episode title for the Up Next card.
    axiosFetch({
      requestID: "tvEpisodeDetail",
      id,
      season: nextSeason,
      episode: nextEpisode,
    })
      .then((res: any) => {
        setUpNext((prev) =>
          prev && res?.name ? { ...prev, title: res.name } : prev,
        );
      })
      .catch(() => {});

    setUpNext({
      target,
      season: nextSeason,
      episode: nextEpisode,
      title: "",
      seconds: 10,
    });
  }

  // streamUrl must be declared before callbacks that reference it
  const streamUrl = useMemo(() => {
    if (!currentProvider) return null;
    // Use autonomous domain resolver for the best working URL
    return resolveStreamUrl(
      currentProvider.id,
      type as "movie" | "tv",
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );
  }, [currentProvider, type, id, season, episode, domainVersion]);

  // ─── Playback mode detection ───────────────────────────────────────────────
  // If the resolved URL is direct media (HLS/mp4/webm), the custom player
  // takes over with quality/speed/subtitles; otherwise the provider embed
  // runs as before. Detection: file-extension hint, then a HEAD content-type
  // sniff through the media proxy, cached per URL.
  const directMediaCache = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!streamUrl) return;
    const url = streamUrl;
    if (/\\.(m3u8|mp4|webm)(\?|$)/i.test(url)) {
      setPlaybackMode("direct");
      setIframeLoading(false);
      return;
    }
    if (directMediaCache.current[url] === true) {
      setPlaybackMode("direct");
      setIframeLoading(false);
      return;
    }
    if (directMediaCache.current[url] === false) {
      setPlaybackMode("embed");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch(`/api/proxy/media?url=${encodeURIComponent(url)}`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        const contentType = res.headers.get("content-type") || "";
        const direct = /video\/|application\/vnd\.apple\.mpegurl|audio\//.test(
          contentType,
        );
        directMediaCache.current[url] = direct;
        setPlaybackMode(direct ? "direct" : "embed");
        if (direct) setIframeLoading(false);
      })
      .catch(() => {
        directMediaCache.current[url] = false;
        setPlaybackMode("embed");
      })
      .finally(() => clearTimeout(timer));
  }, [streamUrl]);

  // Resume position for the custom player, from continue-watching progress.
  const resumeSeconds = useMemo(() => {
    if (!id || !type) return 0;
    const match = getContinueWatchingEntries().find(
      (e) =>
        e.type === type &&
        String(e.id) === String(id) &&
        (e.season ?? 0) === (season ? parseInt(season) : 0) &&
        (e.episode ?? 0) === (episode ? parseInt(episode) : 0),
    );
    if (!match?.minutesWatched) return 0;
    return Math.max(0, Math.round(match.minutesWatched * 60));
  }, [id, type, season, episode]);

  // Handle source selection
  const handleSourceSelect = async (provider: any) => {
    if (currentProvider && currentProvider.id !== provider.id) {
      setPreviousProviderName(currentProvider.name);
      setIsAutoSwitched(true);
      toast.info(`Switched to ${provider.name}`, {
        description: `${provider.capabilities.hq ? "HD" : "SD"} • ${provider.language.toUpperCase()} • ${provider.repoSource.toUpperCase()}`,
        duration: 2000,
        position: "top-center",
      });
    }
    userPickedProvider.current = true;
    setCurrentProvider(provider as Provider);
    setSelectedProviderId(provider.id);
    setShowSourceSelector(false);
    setIframeError(false);
    setIframeLoading(true);

    // Report success to health tracker
    fetch("/api/providers/sources?action=reportSuccess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: provider.id, latency: 100 }),
    }).catch(() => {});
  };

  const recordSourceFailure = (providerId: string) => {
    fetch("/api/providers/sources?action=reportFailure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    }).catch(() => {});
  };

  const recordSourceSuccess = (providerId: string) => {
    fetch("/api/providers/sources?action=reportSuccess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, latency: 100 }),
    }).catch(() => {});
  };

  // Record domain success when iframe loads
  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    if (currentProvider && streamUrl) {
      recordDomainSuccess(currentProvider.id, streamUrl, 100);
      recordSourceSuccess(currentProvider.id);
    }
  }, [currentProvider, streamUrl]);

  // Show a success toast when the best source loads for the first time
  const hasShownInitialToast = useRef(false);
  useEffect(() => {
    if (
      currentProvider &&
      streamUrl &&
      !iframeLoading &&
      !hasShownInitialToast.current
    ) {
      hasShownInitialToast.current = true;
      const provider = currentProvider as Provider;
      toast.success(`Playing from ${provider.name}`, {
        description: `${getProviderQualityTier(provider)} ${provider.capabilities.hq ? "Quality" : "Source"} • ${provider.language.toUpperCase()}${provider.capabilities.subtitle ? " • Subtitles" : ""}${provider.capabilities.dub ? " • Dubbed" : ""}`,
        duration: 3000,
        position: "top-right",
      });
    }
  }, [currentProvider, streamUrl, iframeLoading]);

  // Handle iframe load error - auto switch to next source or next domain
  const handleIframeError = useCallback(async () => {
    if (!currentProvider) return;

    const failedUrl = streamUrl;
    // Keep resolver failures silent for consumers; the toast communicates state.

    recordSourceFailure(currentProvider.id);

    // Record domain failure in the autonomous resolver
    if (failedUrl) {
      recordDomainFailure(currentProvider.id, failedUrl);
      fetch("/api/providers/domains?action=reportFailure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: currentProvider.id,
          url: failedUrl,
        }),
      }).catch(() => {});
    }

    toast.info(
      `Source ${currentProvider.name} is unavailable, finding a better source...`,
      {
        duration: 3000,
        position: "top-center",
      },
    );

    // Re-discover fresh domains for the same provider before switching.
    try {
      const refreshed = await forceRefresh(currentProvider.id);
      const cached = getCachedDomain(currentProvider.id);
      const nextDomain =
        refreshed.workingDomains.find((d) => d.url !== failedUrl)?.url ||
        (cached && cached !== failedUrl ? cached : null);
      if (nextDomain) {
        // Same provider, fresh working domain - rebuild the stream URL
        setIframeError(false);
        setIframeLoading(true);
        setDomainVersion((v) => v + 1);
        return;
      }
    } catch {
      // Fall through to provider-level switch
    }

    // No more domains for this provider, try a different provider
    try {
      const category = getSourceCategory();
      const providerParam = userPickedProvider.current
        ? `&providerId=${selectedProviderId}`
        : "";
      const response = await fetch(
        `/api/providers/sources?action=best&category=${category}${providerParam}`,
      );
      if (response.ok) {
        const selection = await response.json();
        if (selection.provider.id !== currentProvider.id) {
          setPreviousProviderName(currentProvider.name);
          setIsAutoSwitched(true);
          setCurrentProvider(selection.provider);
          setSelectedProviderId(selection.provider.id);
          setIframeError(false);
          setIframeLoading(true);
          toast.success(`Switched to ${selection.provider.name}`, {
            description: `Auto-switched from ${currentProvider.name} (${selection.provider.capabilities.hq ? "HD" : "SD"} ${selection.provider.language.toUpperCase()})`,
            duration: 4000,
            position: "top-center",
          });
        } else {
          setIframeError(true);
          toast.error("All sources are currently unavailable", {
            description: "Please try again later or select a different source",
            duration: 5000,
            position: "top-center",
          });
        }
      }
    } catch {
      setIframeError(true);
      toast.error("Connection failed", {
        description: "Unable to find a working source",
        duration: 4000,
        position: "top-center",
      });
    }
  }, [currentProvider, getSourceCategory, selectedProviderId, streamUrl]);

  // ─── Watch-session progress tracking ──────────────────────────────────────
  // Accumulates real watch time while the embed is on screen and persists it
  // with the continue-watching entry, so the home/library shelves can show
  // actual progress and resume deep links.
  const watchStartRef = useRef<number | null>(null);

  const commitWatchProgress = useCallback(
    (addSeconds: number, totalSeconds?: number) => {
      if (!id || !type) return;
      const meta = data || {};
      const durationMinutes =
        type === "movie" && Number(meta.runtime) > 0
          ? Number(meta.runtime)
          : undefined;
      const totalMinutes =
        typeof totalSeconds === "number" ? totalSeconds / 60 : undefined;
      const watchMeta = {
        type: type as "movie" | "tv",
        id,
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined,
        title: meta.name || meta.title,
        poster: meta.poster_path,
        durationMinutes,
      };
      setContinueWatching({
        ...watchMeta,
        addMinutes: addSeconds / 60,
        totalMinutes,
      });
      // Keep the watch-history shelf in sync with the same session data.
      const prev = getContinueWatchingEntries().find(
        (e) =>
          e.type === watchMeta.type &&
          String(e.id) === String(watchMeta.id) &&
          (e.season ?? 0) === (watchMeta.season ?? 0) &&
          (e.episode ?? 0) === (watchMeta.episode ?? 0),
      );
      recordWatch({
        ...watchMeta,
        minutesWatched:
          typeof totalMinutes === "number"
            ? totalMinutes
            : (prev?.minutesWatched ?? 0) + addSeconds / 60,
      });
    },
    [id, type, season, episode, data],
  );

  useEffect(() => {
    if (!streamUrl || iframeError || iframeLoading || playbackMode !== "embed")
      return;
    watchStartRef.current = Date.now();

    const tick = () => {
      if (watchStartRef.current && document.visibilityState === "visible") {
        const now = Date.now();
        const elapsed = (now - watchStartRef.current) / 1000;
        if (elapsed >= 15) {
          commitWatchProgress(elapsed);
          watchStartRef.current = now;
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") tick();
    };
    const onUnload = () => {
      if (watchStartRef.current) {
        commitWatchProgress((Date.now() - watchStartRef.current) / 1000);
      }
    };
    const interval = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
      if (watchStartRef.current) {
        commitWatchProgress((Date.now() - watchStartRef.current) / 1000);
      }
      watchStartRef.current = null;
    };
  }, [
    streamUrl,
    iframeError,
    iframeLoading,
    playbackMode,
    commitWatchProgress,
  ]);

  // ─── Silent-hang watchdog ─────────────────────────────────────────────────
  // Some embeds never fire onError — the page just sits on a spinner. If the
  // iframe hasn't loaded within 30s (tab visible), treat it as a failure and
  // let the existing auto-fallback pipeline find a working source.
  const iframeErrorRef = useRef<(event?: any) => void>(() => {});
  useEffect(() => {
    iframeErrorRef.current = handleIframeError;
  }, [handleIframeError]);

  useEffect(() => {
    if (!streamUrl || !iframeLoading || iframeError || playbackMode !== "embed")
      return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      iframeErrorRef.current?.();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [streamUrl, iframeLoading, iframeError, playbackMode]);

  // ─── Up Next auto-advance ─────────────────────────────────────────────────
  // Netflix-style: clicking next shows an "Up next" card with a countdown
  // that auto-navigates unless cancelled. Toggleable per-device.
  const [upNext, setUpNext] = useState<{
    target: string;
    season: number;
    episode: number;
    title: string;
    seconds: number;
  } | null>(null);
  const [autoAdvanceOn, setAutoAdvanceOn] = useState(true);

  useEffect(() => {
    setAutoAdvanceOn(localStorage.getItem("rive_auto_advance") !== "off");
  }, []);

  const autoAdvanceEnabled = () => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("rive_auto_advance") !== "off";
  };

  const toggleAutoAdvance = () => {
    const enabled = localStorage.getItem("rive_auto_advance") !== "off";
    localStorage.setItem("rive_auto_advance", enabled ? "off" : "on");
    setAutoAdvanceOn(!enabled);
    setUpNext(null);
    toast.info(enabled ? "Auto-play next: OFF" : "Auto-play next: ON", {
      duration: 2000,
      position: "bottom-center",
    });
  };

  useEffect(() => {
    if (!upNext) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setUpNext((prev) => {
        if (!prev) return prev;
        if (prev.seconds <= 1) {
          push(prev.target);
          return null;
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upNext !== null, push]);

  // Handle instant download with autonomous domain resolution
  const handleDownload = useCallback(() => {
    if (!currentProvider) return;
    const {
      resolveDownloadUrl: resolveDl,
    } = require("@/Utils/domainDiscovery");
    const downloadUrl = resolveDl(
      currentProvider.id,
      type as "movie" | "tv",
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );
    if (downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  }, [currentProvider, type, id, season, episode]);

  return (
    <div className={styles.watch}>
      {/* Preload link for instant streaming */}
      {streamUrl && <link rel="preload" href={streamUrl} as="document" />}

      <div onClick={() => back()} className={styles.backBtn}>
        <IoReturnDownBack
          data-tooltip-id="tooltip"
          data-tooltip-content="go back"
        />
      </div>

      <div className={styles.episodeControl}>
        {type === "tv" ? (
          <>
            <div
              ref={backBtn}
              onClick={() => {
                if (episode > 1) handleBackward();
              }}
              data-tooltip-id="tooltip"
              data-tooltip-html={
                episode > minEpisodes
                  ? "<div>Previous episode <span class='tooltip-btn'>SHIFT + P</span></div>"
                  : `Start of season ${season}`
              }
            >
              <FaBackwardStep
                className={`${episode <= minEpisodes ? styles.inactive : null}`}
              />
            </div>
            <div
              ref={nextBtn}
              onClick={() => {
                if (episode < maxEpisodes || parseInt(season) + 1 <= maxSeason)
                  handleForward();
              }}
              data-tooltip-id="tooltip"
              data-tooltip-html={
                episode < maxEpisodes
                  ? "<div>Next episode <span class='tooltip-btn'>SHIFT + N</span></div>"
                  : parseInt(season) + 1 <= maxSeason
                    ? `<div>Start season ${parseInt(season) + 1} <span class='tooltip-btn'>SHIFT + N</span></div>`
                    : `End of season ${season}`
              }
            >
              <FaForwardStep
                className={`${
                  episode >= maxEpisodes && season >= maxSeason
                    ? styles.inactive
                    : null
                } ${episode >= maxEpisodes && season < maxSeason ? styles.nextSeason : null}`}
              />
            </div>
          </>
        ) : null}
        <div
          ref={sourceBtn}
          onClick={() => setShowSourceSelector(!showSourceSelector)}
          data-tooltip-id="tooltip"
          data-tooltip-html={
            !showSourceSelector
              ? "Sources <span class='tooltip-btn'>SHIFT + S</span>"
              : "Close sources <span class='tooltip-btn'>SHIFT + S</span>"
          }
        >
          {showSourceSelector ? <BsHddStackFill /> : <BsHddStack />}
        </div>
        <div
          ref={moreBtn}
          onClick={() => setWatchDetails(!watchDetails)}
          data-tooltip-id="tooltip"
          data-tooltip-html={
            !watchDetails
              ? "More <span class='tooltip-btn'>SHIFT + M</span></div>"
              : "close <span class='tooltip-btn'>SHIFT + M</span></div>"
          }
        >
          {watchDetails ? <BsHddStackFill /> : <BsHddStack />}
        </div>
        <div
          onClick={handleDownload}
          data-tooltip-id="tooltip"
          data-tooltip-html="Download <span class='tooltip-btn'>SHIFT + D</span>"
        >
          <BsDownload />
        </div>
      </div>

      {showSourceSelector && (
        <div className={styles.sourceSelectorOverlay}>
          <SourceSelector
            category={getSourceCategory()}
            onSelect={handleSourceSelect}
            currentProvider={selectedProviderId}
            title={data?.name || data?.title}
            type={type as "movie" | "tv"}
          />
        </div>
      )}

      {watchDetails && (
        <WatchDetails
          id={id}
          type={type}
          data={data}
          season={season}
          episode={episode}
          setWatchDetails={setWatchDetails}
        />
      )}

      {currentProvider && (
        <SourceMetadata
          providerName={currentProvider.name}
          providerIcon={currentProvider.iconUrl}
          quality={getProviderQualityTier(currentProvider)}
          language={currentProvider.language.toUpperCase()}
          subtitle={currentProvider.capabilities.subtitle}
          dub={currentProvider.capabilities.dub}
          dubbedHindi={currentProvider.capabilities.dubbedHindi}
          latency={undefined}
          isAutoSwitched={isAutoSwitched}
          previousProvider={previousProviderName}
        />
      )}

      <div className={`${styles.loader} skeleton`}></div>

      {playbackMode === "direct" && streamUrl && !iframeError && (
        <CustomPlayer
          key={`${currentProvider?.id}-${domainVersion}`}
          src={streamUrl}
          title={data?.name || data?.title}
          poster={
            data?.backdrop_path || data?.poster_path
              ? `${process.env.NEXT_PUBLIC_TMBD_IMAGE_URL}${
                  data?.backdrop_path || data?.poster_path
                }`
              : undefined
          }
          startSeconds={resumeSeconds}
          onProgress={(currentSeconds) =>
            commitWatchProgress(0, currentSeconds)
          }
          onEnded={() => {
            if (type === "tv") {
              handleForward();
            } else {
              removeContinueWatching({ type, id });
              toast.success("Finished", {
                description:
                  "You've completed this title — it left your Continue Watching row.",
                duration: 3500,
                position: "top-center",
              });
            }
          }}
          onFail={() => {
            setIframeLoading(true);
            handleIframeError();
          }}
        />
      )}

      {playbackMode !== "direct" && streamUrl && !iframeError && (
        <iframe
          ref={iframeRef}
          scrolling="no"
          src={streamUrl}
          className={styles.iframe}
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      )}

      {iframeError && (
        <div className={styles.sourceMessage}>
          <p>⚠️ Source unavailable</p>
          <p>
            <strong>{currentProvider?.name}</strong> is not responding. Please
            select a different source.
          </p>
          <button
            className={styles.switchSourceBtn}
            onClick={() => {
              setShowSourceSelector(true);
              setIframeError(false);
            }}
          >
            <BsArrowClockwise /> Switch Source
          </button>
        </div>
      )}

      {streamUrl === null && !iframeError && (
        <div className={styles.sourceMessage}>
          <p>⚠️ Streaming source not configured.</p>
          <p>
            Please add <code>NEXT_PUBLIC_STREAM_URL</code> to your environment
            variables with the embed URL.
          </p>
        </div>
      )}

      {upNext && (
        <div className={styles.upNext}>
          <div className={styles.upNextCard}>
            <div className={styles.upNextLabel}>
              <BsSkipForwardFill /> Up next
            </div>
            <p className={styles.upNextTitle}>
              {upNext.title
                ? `S${upNext.season} E${upNext.episode} · ${upNext.title}`
                : `Season ${upNext.season} · Episode ${upNext.episode}`}
            </p>
            <div className={styles.upNextControls}>
              <button
                className={styles.upNextPlay}
                onClick={() => {
                  push(upNext.target);
                  setUpNext(null);
                }}
              >
                Play now
              </button>
              <button
                className={styles.upNextCancel}
                onClick={() => setUpNext(null)}
              >
                Cancel
              </button>
              <span className={styles.upNextCountdown}>{upNext.seconds}s</span>
            </div>
            <button className={styles.upNextToggle} onClick={toggleAutoAdvance}>
              Auto-play next: {autoAdvanceOn ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Watch;
