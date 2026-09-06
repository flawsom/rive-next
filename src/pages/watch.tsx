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
  BsShareFill,
} from "react-icons/bs";
import axiosFetch from "@/Utils/fetchBackend";
import WatchDetails from "@/components/WatchDetails";
import SourceSelector from "@/components/SourceSelector";
import SourceMetadata from "@/components/SourceMetadata";
import CustomPlayer from "@/components/CustomPlayer";
import MoreLikeThis from "@/components/MoreLikeThis";
import WatchParty from "@/components/WatchParty";
import { TMDB_IMAGE_URL } from "@/Utils/imageUrl";
import { navigatorShare } from "@/Utils/share";
import { recordWatch, getHistoryEntries } from "@/Utils/watchHistory";
import {
  Provider,
  findProviderById,
  getProviderQualityTier,
  getProvidersByCategory,
  buildEmbedUrl,
  ALL_PROVIDERS,
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
  const { back, push, replace } = useRouter();
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
  // Netflix-style instant start: the first playback session begins MUTED so
  // autoplay is never blocked (browsers allow muted autoplay) and the video is
  // on screen immediately; the player shows a "tap for sound" chip. Once the
  // user brings sound back, every subsequent rotation/stream plays with sound.
  const soundOnRef = useRef(false);
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
      const category = getSourceCategory();
      // ⚡ Instant first paint: start from the last-known-good provider for
      // this category (localStorage), so the player mounts on frame one while
      // the health check runs. The best-source round-trip then upgrades if a
      // faster source exists — users never stare at a spinner for this.
      if (!userPickedProvider.current) {
        try {
          const lastGood = JSON.parse(
            localStorage.getItem("OpenStreamLastGoodProvider") || "{}",
          );
          const cached = findProviderById(lastGood[category]);
          if (cached && !currentProvider) setCurrentProvider(cached);
        } catch {
          // ignore malformed cache
        }
      }
      try {
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
          try {
            const lastGood = JSON.parse(
              localStorage.getItem("OpenStreamLastGoodProvider") || "{}",
            );
            lastGood[category] = selection.provider.id;
            localStorage.setItem(
              "OpenStreamLastGoodProvider",
              JSON.stringify(lastGood),
            );
          } catch {
            // ignore
          }
        }
      } catch (err) {
        if (!currentProvider) {
          const fallback = findProviderById("hdhub4u");
          if (fallback) setCurrentProvider(fallback);
        }
      }
    };
    loadProvider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSourceCategory, selectedProviderId]);

  useEffect(() => {
    const rawType = params.get("type");
    const rawId = params.get("id");
    const rawSeason = params.get("season");
    const rawEpisode = params.get("episode");
    setLoading(true);
    setType(rawType);
    setId(rawId);
    setSeason(rawSeason);
    setEpisode(rawEpisode);
    setIframeError(false);
    setIframeLoading(true);

    if (!rawId || !/^\d+$/.test(rawId)) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      // Read params directly (not the state set above — those land on the
      // next render, which used to make the first pass fetch requestID
      // "Data" with a garbage URL and silently kill metadata).
      const effSeason = rawSeason || "1";
      const effEpisode = rawEpisode || "1";

      const loadWith = (t: string) =>
        axiosFetch({ requestID: `${t}Data`, id: rawId, language: "en-US" });

      // ── Type safety net ──
      // A wrong type in the URL (movie id opened as tv, or vice versa — or no
      // type at all) used to build embeds for a source that can never have
      // the title: the player then showed "No content available" forever.
      // TMDB answers { success: false } for a type/id mismatch, so verify and
      // REPAIR the URL instead of playing a guaranteed miss.
      let meta: any =
        rawType === "movie" || rawType === "tv"
          ? await loadWith(rawType)
          : null;
      let effectiveType = rawType;

      if (!meta || meta.success === false) {
        // Try the remaining type(s): the cross-type swap for a wrong type, or
        // both in order when the type is missing/garbled.
        const candidates =
          rawType === "movie" || rawType === "tv"
            ? [rawType === "tv" ? "movie" : "tv"]
            : ["tv", "movie"];
        for (const candidate of candidates) {
          const alt: any = await loadWith(candidate);
          if (alt && alt.success !== false) {
            const qs = new URLSearchParams();
            qs.set("type", candidate);
            qs.set("id", rawId as string);
            if (candidate === "tv") {
              qs.set("season", effSeason);
              qs.set("episode", effEpisode);
            }
            replace(`/watch?${qs.toString()}`);
            return; // effect re-runs with the corrected URL
          }
        }
        if (!meta) {
          // Transient failure on both — don't block the player; the embed
          // builds from URL params and the watchdog handles dead sources.
          setLoading(false);
          return;
        }
        effectiveType = rawType; // genuine unknown id: player fallbacks apply
      }
      setdata(meta);

      if (effectiveType === "tv") {
        setMaxSeason(meta?.number_of_seasons || 1);
        const seasonData = await axiosFetch({
          requestID: "tvEpisodes",
          id: rawId,
          season: Number(effSeason),
        });
        if (seasonData?.episodes?.length > 0) {
          setMaxEpisodes(
            seasonData?.episodes[seasonData?.episodes?.length - 1]
              ?.episode_number,
          );
          setMinEpisodes(seasonData?.episodes[0]?.episode_number);
        }
        if (parseInt(effEpisode) >= maxEpisodes - 1) {
          const nextseasonData = await axiosFetch({
            requestID: "tvEpisodes",
            id: rawId,
            season: parseInt(effSeason) + 1,
          });
          nextseasonData?.episodes?.length > 0 &&
            setNextSeasonMinEpisodes(
              nextseasonData?.episodes[0]?.episode_number,
            );
        }
      }
    };
    fetch();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
  const [streamOverride, setStreamOverride] = useState<string | null>(null);
  // Direct-first flag: for universal id-routed providers the direct-stream
  // extraction is the PRIMARY path — the (ad-laden, click-gated) embed iframe
  // is held back until extraction finishes and proves there is no direct
  // stream, so our own player + UI is what the user sees, never the embed.
  const [directChecked, setDirectChecked] = useState(true);
  // ─── Direct-failure recovery (the "keeps refreshing" fix) ────────────
  // A direct stream that dies MID-PLAY (expired videm token, dead file host)
  // used to fire onFail → abandon the whole provider → walk every provider
  // in the category — visibly reloading the page over and over, even though
  // every universal shares the same backends (they all fail identically).
  // Recovery order now: rotate to another ALREADY-EXTRACTED server (silent,
  // instant) → one silent fresh re-extract of the SAME source → only then
  // the visible source walk. The user never watches a cascade for a
  // single-server hiccup.
  const [extractNonce, setExtractNonce] = useState(0);
  const [extractedCandidates, setExtractedCandidates] = useState<
    { url: string; kind: string; label?: string }[]
  >([]);
  const directRetriedRef = useRef(false); // one silent re-extract per source
  const failedDirectUrls = useRef<Set<string>>(new Set());
  const directFailAtRef = useRef(0); // debounce duplicate fail events
  useEffect(() => {
    setStreamOverride(null); // new source/episode → drop any extracted stream
    setDirectChecked(false); // re-run direct-first for the new source
    directRetriedRef.current = false;
    failedDirectUrls.current = new Set();
  }, [currentProvider, id, season, episode]);

  // ─── Title-based page resolution ────────────────────────────────────────
  // WordPress-class providers (HDHub4U, MoviesDrive, Bollyflix, …) don't
  // expose /movie/{tmdbId} routes — those URLs 404 while still firing onLoad,
  // which is why "nothing ever plays". /api/providers/resolve verifies the
  // page exists (id route first, then a title search) before we mount it.
  const [resolvedPage, setResolvedPage] = useState<{
    url: string;
    method: string;
  } | null>(null);
  const [resolveState, setResolveState] = useState<
    "idle" | "loading" | "ok" | "miss"
  >("idle");
  const resolveFailHandledRef = useRef(false);
  // When a UNIVERSAL provider's resolve misses, don't auto-switch right away:
  // the parallel direct-stream extraction (which gates the embed) may still
  // find the title — a false resolver miss must never cancel a stream that's
  // about to play. The switch fires only if extraction also comes up empty.
  const deferSwitchOnExtractRef = useRef(false);

  useEffect(() => {
    setResolvedPage(null);
    setResolveState("idle");
    resolveFailHandledRef.current = false;
    deferSwitchOnExtractRef.current = false;
  }, [currentProvider, id, season, episode, domainVersion]);

  useEffect(() => {
    if (!currentProvider || !id || !type) return;
    // Universal id-routed providers (VidLink/2Embed) embed by TMDB id. 2Embed
    // answers 200 even when it lacks the title (dead embed, silent player),
    // so its exact embed URL is verified server-side first — a miss fails fast
    // into the auto-switch pipeline instead of a silent dead player.
    if (currentProvider.urlPattern) {
      const url = buildEmbedUrl(
        currentProvider,
        type as "movie" | "tv",
        id,
        season ? parseInt(season) : undefined,
        episode ? parseInt(episode) : undefined,
      );
      if (!url) {
        setResolveState("miss");
        return;
      }
      let cancelled = false;
      const controller = new AbortController();
      setResolveState("loading");
      const p = new URLSearchParams({
        providerId: currentProvider.id,
        type,
        id: String(id),
      });
      if (season) p.set("season", season);
      if (episode) p.set("episode", episode);
      fetch(`/api/providers/resolve?${p}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("resolve"))))
        .then((res) => {
          if (cancelled) return;
          if (res?.ok && res.url) {
            setResolvedPage({ url: res.url, method: res.method });
            setResolveState("ok");
          } else {
            setResolveState("miss");
            if (currentProvider.urlPattern) {
              // Universal: a direct-stream extraction is already running in
              // parallel and gating the embed — let it finish before the
              // auto-switch, so a false resolver miss can't cancel a stream
              // that's about to play. Extraction triggers the switch if it
              // also comes up empty.
              deferSwitchOnExtractRef.current = true;
            } else if (!resolveFailHandledRef.current) {
              resolveFailHandledRef.current = true;
              iframeErrorRef.current?.();
            }
          }
        })
        .catch(() => {
          if (!cancelled) setResolveState("miss");
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }
    const title = data?.title || data?.name;
    if (!title) return; // TMDB metadata lands in a moment; then we resolve
    let cancelled = false;
    const controller = new AbortController();
    setResolveState("loading");
    const p = new URLSearchParams({
      providerId: currentProvider.id,
      type,
      id: String(id),
      base: getCachedDomain(currentProvider.id) || "",
      title: String(title),
      year: String(data?.release_date || data?.first_air_date || "").slice(
        0,
        4,
      ),
    });
    if (season) p.set("season", season);
    if (episode) p.set("episode", episode);
    fetch(`/api/providers/resolve?${p}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("resolve"))))
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res.url) {
          setResolvedPage({ url: res.url, method: res.method });
          setResolveState("ok");
        } else {
          // Verified miss: this provider genuinely doesn't have the title.
          // Fail fast into the auto-switch pipeline instead of hanging 30s.
          setResolveState("miss");
          if (!resolveFailHandledRef.current) {
            resolveFailHandledRef.current = true;
            iframeErrorRef.current?.();
          }
        }
      })
      .catch(() => {
        if (!cancelled) setResolveState("miss"); // watchdog covers the rest
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentProvider,
    id,
    type,
    season,
    episode,
    data?.id,
    data?.title,
    data?.name,
    domainVersion,
  ]);

  const streamUrl = useMemo(() => {
    if (streamOverride) return streamOverride;
    if (resolvedPage?.url) return resolvedPage.url;
    if (!currentProvider) return null;
    // Naive id-based URL — last resort for id-routed providers; the resolver
    // above replaces it with a verified page for search-based providers.
    return resolveStreamUrl(
      currentProvider.id,
      type as "movie" | "tv",
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );
  }, [
    currentProvider,
    type,
    id,
    season,
    episode,
    domainVersion,
    streamOverride,
    resolvedPage,
  ]);

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
        const direct = res.ok && /video\/|mpegurl|audio\//.test(contentType);
        // A minted stream-API URL (videm _stream/cap.php) that fails
        // verification is DEAD — it must never be mounted as an iframe:
        // the endpoint answers raw JSON ({"error":"unavailable"}), which
        // is exactly the fullscreen JSON the user saw. Route it into the
        // source-failure pipeline instead.
        if (!direct && /videm\.xyz\/(_stream|cap\.php)/i.test(url)) {
          directMediaCache.current[url] = false;
          setIframeError(true);
          return;
        }
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

  // ─── Direct-stream extraction (primary for universals) ──────────────────
  // Ask the extraction endpoint for direct HLS/mp4 candidates. For universal
  // id-routed providers this is the PRIMARY path: the ad-laden, click-gated
  // embed iframe is held back (directChecked) until extraction finishes and
  // proves there is no direct stream. A verified direct stream beats any
  // embed (native quality/subtitle controls, cast, watch-party), so the
  // first candidate that passes the proxy content-type check takes over.
  useEffect(() => {
    if (!currentProvider || !id || !type) return;
    if (
      playbackMode === "direct" &&
      directMediaCache.current[streamUrl || ""]
    ) {
      return; // already on a direct stream from the primary URL
    }
    const isUniversal = !!currentProvider.urlPattern;
    if (isUniversal) setDirectChecked(false); // hold the embed back
    setExtractedCandidates([]); // a fresh extraction replaces the old servers
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams({
      providerId: currentProvider.id,
      type,
      id: String(id),
    });
    if (season) params.set("season", season);
    if (episode) params.set("episode", episode);
    if (resolvedPage?.url) params.set("pageUrl", resolvedPage.url);
    let applied = false; // a direct stream took over (no switch needed)
    const run = async () => {
      try {
        const res = await fetch(`/api/providers/extract?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        // Remember the full candidate list (minus plain-extension URLs, which
        // need no token rotation) so a MID-PLAY death can silently rotate to
        // another server instead of restarting the whole source cascade.
        const all: { url: string; kind: string; label?: string }[] =
          data.streams || [];
        setExtractedCandidates(
          all.filter((c) => !/\.(m3u8|mp4|webm)(\?|$)/i.test(c.url)),
        );
        for (const candidate of data.streams || []) {
          if (cancelled) return;
          if (candidate.kind !== "hls" && candidate.kind !== "mp4") continue;
          try {
            const head = await fetch(
              `/api/proxy/media?url=${encodeURIComponent(candidate.url)}`,
              { method: "HEAD", cache: "no-store" },
            );
            const ct = head.headers.get("content-type") || "";
            if (head.ok && /video\/|mpegurl|audio\//.test(ct)) {
              if (cancelled) return;
              applied = true;
              // Cache the verdict BEFORE assigning: the playback-mode effect
              // re-probes any non-extension URL it hasn't cached, and a
              // second HEAD can fail (videm tokens expire) — which used to
              // flip the URL to "embed" mode and mount the raw stream API
              // (videm answers {"error":"unavailable"}) in the iframe.
              directMediaCache.current[candidate.url] = true;
              setStreamOverride(candidate.url);
              setIframeError(false);
              setIframeLoading(false);
              toast.success("Direct stream found", {
                description: `${candidate.kind.toUpperCase()} • native quality & subtitle controls enabled`,
                duration: 3000,
                position: "top-center",
              });
              return;
            }
          } catch {
            // try next candidate
          }
        }
      } catch {
        // extraction unavailable — the embed path continues undisturbed
      } finally {
        // Direct attempt finished (found, empty, or errored) — the embed
        // fallback may now mount if no direct stream took over. If the
        // resolver missed this universal while extraction was running, the
        // switch waits for this verdict: a stream that played means no
        // switch; an empty extraction means the title really is absent.
        if (!cancelled && isUniversal) {
          setDirectChecked(true);
          if (
            !applied &&
            deferSwitchOnExtractRef.current &&
            !resolveFailHandledRef.current
          ) {
            resolveFailHandledRef.current = true;
            iframeErrorRef.current?.();
          }
        }
      }
    };
    // Universals run the extraction immediately (it gates the embed); other
    // providers keep the boost but never block the embed mount.
    const timer = setTimeout(run, isUniversal ? 0 : 400);
    // Hang guard: extraction normally returns in seconds (cold starts can
    // take ~10s), so give it a generous window before letting the ad-laden
    // embed through — an early release is exactly how the provider's own
    // player flashes over ours.
    const fallbackTimer = isUniversal
      ? setTimeout(() => {
          if (cancelled) return;
          setDirectChecked(true);
          // Extraction hung — if the resolver missed this universal, switch
          // now rather than leaving the user on an empty player.
          if (
            !applied &&
            deferSwitchOnExtractRef.current &&
            !resolveFailHandledRef.current
          ) {
            resolveFailHandledRef.current = true;
            iframeErrorRef.current?.();
          }
        }, 20000)
      : null;
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [
    currentProvider,
    id,
    type,
    season,
    episode,
    playbackMode,
    streamUrl,
    resolvedPage,
    extractNonce,
  ]);

  // ─── Direct-stream failure recovery ──────────────────────────────────
  // The CustomPlayer's onFail. A dead/expired direct stream is recovered in
  // three silent steps before anything visible happens: (1) rotate to another
  // extracted server, (2) re-extract fresh tokens for the same source, (3)
  // hand the failure to the standard source walk. Every cascade toast the
  // user reported ("it keeps on refreshing") came from skipping 1 and 2.
  const handlePlayerFail = useCallback(async () => {
    const failedUrl = streamOverride;
    if (!failedUrl) return; // player failed without a stream — nothing to recover
    if (Date.now() - directFailAtRef.current < 1200) return; // duplicate event
    directFailAtRef.current = Date.now();
    failedDirectUrls.current.add(failedUrl);

    // 1) Rotate to another already-extracted, still-verified server.
    const rest = extractedCandidates.filter(
      (c) =>
        !failedDirectUrls.current.has(c.url) &&
        (c.kind === "hls" || c.kind === "mp4" || c.kind === "webm"),
    );
    for (const candidate of rest) {
      try {
        const head = await fetch(
          `/api/proxy/media?url=${encodeURIComponent(candidate.url)}`,
          { method: "HEAD", cache: "no-store" },
        );
        const ct = head.headers.get("content-type") || "";
        if (head.ok && /video\/|mpegurl|audio\//.test(ct)) {
          // Cache BEFORE assigning (playback-mode effect re-probes otherwise).
          directMediaCache.current[candidate.url] = true;
          setStreamOverride(candidate.url);
          setIframeError(false);
          setIframeLoading(false);
          toast.info("Switched stream server", {
            description:
              "The previous stream expired — connected to another server.",
            duration: 2000,
            position: "top-center",
          });
          return;
        }
      } catch {
        // try the next candidate
      }
    }

    // 2) Nothing else held up — one silent fresh extraction (new tokens,
    //    same source). The embed stays held back; the user just sees the
    //    player reconnect.
    if (!directRetriedRef.current) {
      directRetriedRef.current = true;
      setStreamOverride(null);
      setDirectChecked(false);
      setExtractNonce((v) => v + 1);
      return;
    }

    // 3) This source is genuinely dead — the visible pipeline takes over
    //    (exactly one "Trying X…" walk, not a loop).
    setStreamOverride(null);
    setIframeError(true);
    iframeErrorRef.current?.();
  }, [extractedCandidates, streamOverride]);

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

  // Record domain success when iframe loads. Store the ORIGIN (not the full
  // resolved page URL) so the domain map stays a map of domains.
  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    if (currentProvider && streamUrl) {
      try {
        recordDomainSuccess(currentProvider.id, new URL(streamUrl).origin, 100);
      } catch {
        recordDomainSuccess(currentProvider.id, streamUrl, 100);
      }
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
  // A verified resolver miss (or repeated error) walks the category's full
  // provider list — the "best source" API alone can return the same provider
  // and dead-end even when other sources have the title.
  const triedProvidersRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    triedProvidersRef.current = new Set();
  }, [id, season, episode]);

  const handleIframeError = useCallback(async () => {
    if (!currentProvider) return;

    const failedUrl = streamUrl;
    // Keep resolver failures silent for consumers; the toast communicates state.

    recordSourceFailure(currentProvider.id);
    triedProvidersRef.current.add(currentProvider.id);

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

    // 1) Try the next untried provider in this category (deterministic walk).
    const category = getSourceCategory();
    const candidates =
      getProvidersByCategory(category).length > 0
        ? getProvidersByCategory(category)
        : ALL_PROVIDERS.filter(
            (pr) =>
              pr.categories.includes("movie") || pr.categories.includes("tv"),
          );
    const nextProvider =
      candidates.find(
        (pr) =>
          pr.id !== currentProvider.id &&
          !triedProvidersRef.current.has(pr.id) &&
          (getCachedDomain(pr.id) !== null || !!pr.embedBase),
      ) ||
      candidates.find(
        (pr) =>
          pr.id !== currentProvider.id && !triedProvidersRef.current.has(pr.id),
      );
    if (nextProvider) {
      setPreviousProviderName(currentProvider.name);
      setIsAutoSwitched(true);
      setCurrentProvider(nextProvider);
      setSelectedProviderId(nextProvider.id);
      setIframeError(false);
      setIframeLoading(true);
      toast.info(`Trying ${nextProvider.name}…`, {
        description: `${currentProvider.name} doesn't have this title`,
        duration: 3000,
        position: "top-center",
      });
      return;
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
      const providerParam = userPickedProvider.current
        ? `&providerId=${selectedProviderId}`
        : "";
      const response = await fetch(
        `/api/providers/sources?action=best&category=${category}${providerParam}`,
      );
      if (response.ok) {
        const selection = await response.json();
        // Only switch to a provider we haven't already tried — re-picking a
        // failed one (this used to only exclude the CURRENT provider) is
        // exactly the infinite "Trying X…" cascade the user saw.
        if (
          selection.provider.id !== currentProvider.id &&
          !triedProvidersRef.current.has(selection.provider.id)
        ) {
          triedProvidersRef.current.add(selection.provider.id);
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
          // Every provider has been tried — stop the cascade and hand the
          // choice back to the user instead of looping forever.
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
    if (!streamUrl || iframeLoading === false || iframeError) return;
    if (playbackMode !== "embed") return;
    // Resolution must settle first — a still-running title search isn't a hang.
    // NOTE: iframeLoading starts true, so a provider that never resolves
    // never reaches this effect through iframeLoading alone.
    if (resolveState === "loading" || resolveState === "idle") return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      iframeErrorRef.current?.();
    }, 15_000);
    return () => clearTimeout(timer);
  }, [streamUrl, iframeLoading, iframeError, playbackMode, resolveState]);

  // Unverified-or-idle dead-source guard. Covers the hole the watchdog above
  // cannot: an embed that (a) never resolves ("idle"), or (b) resolved for an
  // unverified provider whose embed silently shows nothing (no onLoad, no
  // onError — a dead player with a toast). Deadline from streamUrl:
  // verified-2embed mounts in ~1–2s; unverified embeds get a longer window.
  // Direct playback is exempt — the custom player owns failure via onFail.
  useEffect(() => {
    if (!streamUrl || iframeError || playbackMode === "direct") return;
    if (resolveState === "loading" || resolveState === "ok") return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      iframeErrorRef.current?.();
    }, 20_000);
    return () => clearTimeout(timer);
  }, [streamUrl, iframeError, resolveState, playbackMode]);

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
    setAutoAdvanceOn(localStorage.getItem("openstream_auto_advance") !== "off");
  }, []);

  const autoAdvanceEnabled = () => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("openstream_auto_advance") !== "off";
  };

  const toggleAutoAdvance = () => {
    const enabled = localStorage.getItem("openstream_auto_advance") !== "off";
    localStorage.setItem("openstream_auto_advance", enabled ? "off" : "on");
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

  // ─── Real downloads ───────────────────────────────────────────────────
  // The old handler opened `${domain}/download/{tmdbId}` — a route these
  // providers don't have, so the button did nothing. Now: extract a direct
  // file stream and download it through the same-origin media proxy (which
  // makes the `download` attribute work); HLS-only sources fall back to the
  // provider's own page, which lists its download links.
  const [downloadBusy, setDownloadBusy] = useState(false);
  const handleDownload = useCallback(async () => {
    if (!currentProvider || !id || !type || downloadBusy) return;
    setDownloadBusy(true);
    const title = data?.title || data?.name || "open-stream-download";
    toast.info("Finding a downloadable source…", {
      id: "download",
      duration: 8000,
      position: "top-center",
    });
    try {
      const p = new URLSearchParams({
        providerId: currentProvider.id,
        type,
        id: String(id),
        pageUrl: resolvedPage?.url || "",
      });
      if (season) p.set("season", season);
      if (episode) p.set("episode", episode);
      const res = await fetch(`/api/providers/extract?${p}`);
      const payload = await res.json().catch(() => null);
      const streams: any[] = payload?.streams || [];
      const file =
        streams.find((s) => s.kind === "mp4") ||
        streams.find((s) => s.kind === "webm");
      if (file) {
        const safeName =
          title
            .replace(/[^\w\s-]/g, "")
            .trim()
            .slice(0, 80) || "open-stream-download";
        const a = document.createElement("a");
        a.href = `/api/proxy/media?url=${encodeURIComponent(file.url)}`;
        a.download = `${safeName}.${file.kind}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success("Download started", {
          id: "download",
          description: `${file.kind.toUpperCase()} • ${currentProvider.name}`,
          duration: 3000,
          position: "top-center",
        });
        return;
      }
      const page = resolvedPage?.url || payload?.embedUrl || null;
      if (page) {
        window.open(page, "_blank", "noopener,noreferrer");
        toast.info("Opened the source page", {
          id: "download",
          description:
            "This source streams via HLS — pick a download quality on the opened page.",
          duration: 5000,
          position: "top-center",
        });
        return;
      }
      // Nothing resolvable: fall back to the provider's own search for the
      // title — always a valid page the user can pick from.
      const base = getCachedDomain(currentProvider.id);
      if (base) {
        window.open(
          `${base.replace(/\/+$/, "")}/?s=${encodeURIComponent(title)}`,
          "_blank",
          "noopener,noreferrer",
        );
        toast.info(`Opened ${currentProvider.name} search`, {
          id: "download",
          description: `Pick "${title}" there to grab a download link.`,
          duration: 5000,
          position: "top-center",
        });
        return;
      }
      toast.error("No download source found", {
        id: "download",
        description: "Try a different source from the Sources menu.",
        duration: 4000,
        position: "top-center",
      });
    } catch {
      toast.error("Download failed", {
        id: "download",
        description: "The source did not respond. Try another source.",
        duration: 4000,
        position: "top-center",
      });
    } finally {
      setDownloadBusy(false);
    }
  }, [
    currentProvider,
    type,
    id,
    season,
    episode,
    resolvedPage,
    data,
    downloadBusy,
  ]);

  const handleDownloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleDownloadRef.current = handleDownload;
  }, [handleDownload]);

  // Consume ?source=download (the Watch / Download buttons): run the download
  // once the source is ready instead of doing nothing.
  const downloadAutoRef = useRef("");
  useEffect(() => {
    if (!isDownloadMode || !currentProvider || !id) return;
    // Wait until the resolver settled so the download uses the verified page.
    if (resolveState !== "ok" && resolveState !== "miss") return;
    const key = `${currentProvider.id}|${id}|${season || ""}|${episode || ""}`;
    if (downloadAutoRef.current === key) return;
    downloadAutoRef.current = key;
    handleDownloadRef.current?.();
  }, [isDownloadMode, currentProvider, id, season, episode, resolveState]);

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
        <div
          onClick={() => {
            const title = data?.name || data?.title || "this title";
            navigatorShare({
              text: `Watching "${title}" on Open Stream`,
              url: `${window.location.origin}/watch?id=${id}&type=${type}${
                type === "tv" && season ? `&season=${season}` : ""
              }${type === "tv" && episode ? `&episode=${episode}` : ""}`,
            });
          }}
          data-tooltip-id="tooltip"
          data-tooltip-html="Share"
        >
          <BsShareFill />
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

      {/* Watch Party — sync playback with friends (direct playback only) */}
      <WatchParty
        mediaType={type as "movie" | "tv"}
        mediaId={id || ""}
        season={season ? parseInt(season) : undefined}
        episode={episode ? parseInt(episode) : undefined}
        title={data?.name || data?.title}
        directPlayback={playbackMode === "direct"}
        onHostCommand={(playing, positionSeconds) => {
          const video = document.querySelector("video");
          if (!video) return;
          try {
            video.currentTime = positionSeconds;
            if (playing) video.play().catch(() => {});
            else video.pause();
          } catch {
            // Player not ready — the next host event will resync.
          }
        }}
      />

      <div className={`${styles.loader} skeleton`}></div>

      {playbackMode === "direct" && streamUrl && !iframeError && (
        <div className={styles.playerLayer}>
          <CustomPlayer
            key={`${currentProvider?.id}-${domainVersion}`}
            src={streamUrl}
            title={data?.name || data?.title}
            contentId={`${type || "movie"}-${id ?? ""}`}
            providerId={currentProvider?.id}
            poster={
              data?.backdrop_path || data?.poster_path
                ? `${TMDB_IMAGE_URL}${data?.backdrop_path || data?.poster_path}`
                : undefined
            }
            startSeconds={resumeSeconds}
            startMuted={!soundOnRef.current}
            onUnmute={() => {
              soundOnRef.current = true;
            }}
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
            onFail={handlePlayerFail}
          />
        </div>
      )}

      {playbackMode !== "direct" &&
        streamUrl &&
        !iframeError &&
        (directChecked || !currentProvider?.urlPattern) && (
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
          <p>⚠️ No working source for this title yet.</p>
          <p>
            <strong>{currentProvider?.name || "The selected source"}</strong>{" "}
            couldn't be reached from here. Pick another source — it will be
            verified before it plays.
          </p>
          <button
            className={styles.switchSourceBtn}
            onClick={() => setShowSourceSelector(true)}
          >
            <BsArrowClockwise /> Switch Source
          </button>
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

      {id && type && <MoreLikeThis id={id} type={type} />}
    </div>
  );
};

export default Watch;
