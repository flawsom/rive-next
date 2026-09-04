// Netflix-style hero trailer autoplay: fetches the current hero title's
// official trailer from TMDB and plays it muted behind the hero overlay.
// Desktop-first (hidden on small screens to save mobile data), with a sound
// toggle, and it never blocks the backdrop — if anything fails the image
// carousel remains as-is.
import React, { useEffect, useRef, useState } from "react";
import axiosFetch from "@/Utils/fetchBackend";
import { BsVolumeMuteFill, BsVolumeUpFill } from "react-icons/bs";
import styles from "./style.module.scss";

interface HeroTrailerProps {
  /** TMDB id of the current hero title. */
  id?: string | number;
  /** "movie" | "tv" — from media_type. */
  type?: string;
  /** Active only on viewports >= this width (0 = always). */
  minWidth?: number;
}

const HeroTrailer: React.FC<HeroTrailerProps> = ({
  id,
  type,
  minWidth = 768,
}) => {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [visible, setVisible] = useState(false);
  const [wideEnough, setWideEnough] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cacheRef = useRef<Record<string, string>>({});

  // Viewport gate (mobile: keep the image carousel, save data).
  useEffect(() => {
    if (minWidth <= 0) return undefined;
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    setWideEnough(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setWideEnough(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [minWidth]);

  // Pause the trailer while the tab is hidden; autoplay policies are
  // respected because the iframe stays muted.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && iframeRef.current) {
        // Piggyback on YouTube's postMessage API to pause without reloads.
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
          "*",
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    setTrailerKey(null);
    setReady(false);
    setFailed(false);
    if (!id || !type || !wideEnough) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cacheKey = `${type}-${id}`;
    const cached = cacheRef.current[cacheKey];
    if (cached) {
      setTrailerKey(cached);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await axiosFetch({
          requestID: `${type}Videos`,
          id: String(id),
        });
        if (cancelled) return;
        const videos: any[] = res?.results || [];
        const official = videos.find(
          (v) =>
            v.site === "YouTube" && v.type === "Trailer" && v.official === true,
        );
        const anyTrailer = videos.find(
          (v) => v.site === "YouTube" && v.type === "Trailer",
        );
        const teaser = videos.find((v) => v.site === "YouTube");
        const key = official?.key || anyTrailer?.key || teaser?.key;
        if (key) {
          cacheRef.current[cacheKey] = key;
          setTrailerKey(key);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 1200); // let the backdrop image land first

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, type, wideEnough]);

  if (!trailerKey || failed || !wideEnough) return null;

  return (
    <div className={`${styles.heroTrailer} ${ready ? styles.ready : ""}`}>
      <iframe
        ref={iframeRef}
        className={styles.trailerFrame}
        src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&showinfo=0&rel=0&modestbranding=1&loop=1&playlist=${trailerKey}&playsinline=1&enablejsapi=1&iv_load_policy=3&disablekb=1`}
        title="Trailer preview"
        allow="autoplay; encrypted-media"
        allowFullScreen={false}
        tabIndex={-1}
        onLoad={() => {
          // Small delay so the player chrome disappears before we fade in.
          setTimeout(() => setReady(true), 1500);
          setTimeout(() => setVisible(true), 1800);
        }}
      />
      <button
        className={`${styles.soundToggle} ${visible ? styles.soundVisible : ""}`}
        onClick={() => {
          setMuted((m) => {
            const next = !m;
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({
                event: "command",
                func: next ? "mute" : "unMute",
                args: [],
              }),
              "*",
            );
            return next;
          });
        }}
        aria-label={muted ? "Unmute trailer" : "Mute trailer"}
        data-tooltip-id="tooltip"
        data-tooltip-content={muted ? "Unmute preview" : "Mute preview"}
      >
        {muted ? <BsVolumeMuteFill /> : <BsVolumeUpFill />}
      </button>
    </div>
  );
};

export default HeroTrailer;
