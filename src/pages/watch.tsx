import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "@/styles/Watch.module.scss";
import { setContinueWatching } from "@/Utils/continueWatching";
import { IoReturnDownBack } from "react-icons/io5";
import { FaForwardStep, FaBackwardStep } from "react-icons/fa6";
import {
  BsHddStack,
  BsHddStackFill,
  BsArrowClockwise,
  BsDownload,
} from "react-icons/bs";
import axiosFetch from "@/Utils/fetchBackend";
import WatchDetails from "@/components/WatchDetails";
import SourceSelector from "@/components/SourceSelector";
import SourceMetadata from "@/components/SourceMetadata";
import { Provider, findProviderById } from "@/Utils/providers";
import {
  resolveStreamUrl,
  getActiveStreamUrl,
  recordDomainFailure,
  recordDomainSuccess,
  getCachedDomain,
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
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isDownloadMode, setIsDownloadMode] = useState(false);
  const nextBtn: any = useRef(null);
  const backBtn: any = useRef(null);
  const moreBtn: any = useRef(null);
  const sourceBtn: any = useRef(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Check for download mode
  useEffect(() => {
    setIsDownloadMode(params.get("source") === "download");
  }, [params]);

  if (type === null && params.get("id") !== null) setType(params.get("type"));
  if (id === null && params.get("id") !== null) setId(params.get("id"));
  if (season === null && params.get("season") !== null)
    setSeason(params.get("season"));
  if (episode === null && params.get("episode") !== null)
    setEpisode(params.get("episode"));

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
    const loadProvider = async () => {
      try {
        const category = getSourceCategory();
        const response = await fetch(
          `/api/providers/sources?action=best&category=${category}&providerId=${selectedProviderId}`,
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
  }, [getSourceCategory]);

  useEffect(() => {
    setLoading(true);
    setType(params.get("type"));
    setId(params.get("id"));
    setSeason(params.get("season"));
    setEpisode(params.get("episode"));
    setContinueWatching({ type: params.get("type"), id: params.get("id") });
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
    if (episode < maxEpisodes)
      push(
        `/watch?type=tv&id=${id}&season=${season}&episode=${parseInt(episode) + 1}`,
      );
    else if (parseInt(season) + 1 <= maxSeason)
      push(
        `/watch?type=tv&id=${id}&season=${parseInt(season) + 1}&episode=${nextSeasonMinEpisodes}`,
      );
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
  }, [currentProvider, type, id, season, episode]);

  // Handle source selection
  const handleSourceSelect = async (provider: any) => {
    if (currentProvider && currentProvider.id !== provider.id) {
      setPreviousProviderName(currentProvider.name);
      setIsAutoSwitched(true);
    }
    setCurrentProvider(provider as Provider);
    setSelectedProviderId(provider.id);
    setShowSourceSelector(false);
    setIframeError(false);
    setIframeLoading(true);

    // Report success to health tracker
    fetch(
      `/api/providers/sources?action=reportSuccess&providerId=${provider.id}&latency=100`,
    ).catch(() => {});
  };

  const recordSourceFailure = (providerId: string) => {
    fetch(
      `/api/providers/sources?action=reportFailure&providerId=${providerId}`,
    ).catch(() => {});
  };

  const recordSourceSuccess = (providerId: string) => {
    fetch(
      `/api/providers/sources?action=reportSuccess&providerId=${providerId}&latency=100`,
    ).catch(() => {});
  };

  // Record domain success when iframe loads
  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    if (currentProvider && streamUrl) {
      recordDomainSuccess(currentProvider.id, streamUrl, 100);
      recordSourceSuccess(currentProvider.id);
    }
  }, [currentProvider, streamUrl]);

  // Handle iframe load error - auto switch to next source or next domain
  const handleIframeError = useCallback(async () => {
    if (!currentProvider) return;

    const failedUrl = streamUrl;
    console.warn(
      `Source ${currentProvider.name} failed (${failedUrl}), attempting auto-switch...`,
    );
    recordSourceFailure(currentProvider.id);

    // Record domain failure in the autonomous resolver
    if (failedUrl) {
      recordDomainFailure(currentProvider.id, failedUrl);
    }

    // Try to get a different domain for the same provider first
    const nextDomain = getCachedDomain(currentProvider.id);
    if (nextDomain && nextDomain !== failedUrl) {
      // Same provider, different domain available - rebuild URL
      setIframeError(false);
      setIframeLoading(true);
      // Force re-render with new domain by toggling a state
      setSelectedProviderId((prev) => prev + "-retry");
      setSelectedProviderId(currentProvider.id);
      return;
    }

    // No more domains for this provider, try a different provider
    try {
      const category = getSourceCategory();
      const response = await fetch(
        `/api/providers/sources?action=best&category=${category}&providerId=${selectedProviderId}`,
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
        } else {
          setIframeError(true);
        }
      }
    } catch {
      setIframeError(true);
    }
  }, [currentProvider, getSourceCategory, selectedProviderId, streamUrl]);

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
          quality={currentProvider.capabilities.hq ? "HD" : "SD"}
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

      {streamUrl && !iframeError && (
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
    </div>
  );
};

export default Watch;
