import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import styles from "@/styles/Detail.module.scss";
import MetaDetails from "@/components/MetaDetails";
import Carousel from "@/components/Carousel";
import axiosFetch from "@/Utils/fetchBackend";
import MoviePoster from "@/components/MoviePoster";
import Skeleton from "react-loading-skeleton";
import Link from "next/link";
import {
  BsBookmarkPlus,
  BsFillBookmarkCheckFill,
  BsShare,
  BsDownload,
} from "react-icons/bs";
import { FaPlay, FaYoutube } from "react-icons/fa";
import {
  setBookmarks,
  checkBookmarks,
  removeBookmarks,
} from "@/Utils/bookmark";
import { navigatorShare } from "@/Utils/share";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/Utils/firebase";
import { toast } from "sonner";
import AIInsights from "@/components/AIInsights";
import { TMDB_IMAGE_URL } from "@/Utils/imageUrl";

const DetailPage = () => {
  const params = useSearchParams();
  const [type, setType] = useState<string | null>("");
  const [id, setId] = useState<string | null>("");
  const [season, setSeason] = useState<string | null>();
  const [episode, setEpisode] = useState<string | null>();
  const [index, setIndex] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [data, setData] = useState<any>({});
  const [bookmarked, setBookmarked] = useState(false);
  const [trailer, setTrailer] = useState<any>("");
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [credits, setCredits] = useState<any>(null);
  const [externalIds, setExternalIds] = useState<any>(null);
  const [user, setUser] = useState<any>();

  // Close the trailer modal on Escape; cleanup the key listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrailerOpen(false);
    };
    if (trailerOpen) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [trailerOpen]);

  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setFetchError(false);
    const rawType = params.get("type");
    const rawId = params.get("id");
    setType(rawType);
    setId(rawId);
    setSeason(params.get("season"));
    setEpisode(params.get("episode"));

    // During prerendered hydration the router shim can briefly report no
    // params at all. That is NOT a broken link — wait for the params to
    // populate before deciding anything, then fall through.
    const typeOk = rawType === "movie" || rawType === "tv";
    const idOk = !!rawId && /^\d+$/.test(rawId);
    if (!rawType && !rawId) {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (params.get("type") && params.get("id")) {
          clearInterval(poll);
          setType(params.get("type"));
          setId(params.get("id"));
        } else if (attempts >= 10) {
          clearInterval(poll);
          setData({});
          setImages([]);
          setLoading(false);
          setNotFound(true);
        }
      }, 150);
      return () => clearInterval(poll);
    }
    if (!typeOk || !idOk) {
      // Genuinely malformed link (e.g. type=undefined): friendly not-found
      // instead of endless skeletons.
      setData({});
      setImages([]);
      setLoading(false);
      setNotFound(true);
      return;
    }

    const fetchData = async () => {
      // IMPORTANT: use rawType/rawId (from the URL), never the state vars —
      // state updates land on the NEXT render, so the state-based version
      // requested requestID "Data" with id "" on the first pass, crashed on
      // the undefined URL, and falsely declared the title unavailable.
      //
      // Only a definitive TMDB 404 (success:false) marks a title as not
      // existing. Any transient failure (rate-limit, timeout, network) retries
      // with backoff and then shows an honest retry state instead.
      let data: any = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        data = await axiosFetch({
          requestID: `${rawType}Data`,
          id: rawId,
          language: "en-US",
          // One round-trip pulls the full detail envelope: aggregate credits
          // (with voice-actor roles for animation), created_by (show
          // creators), content ratings, keywords and external ids.
          append_to_response:
            "aggregate_credits,credits,external_ids,content_ratings,release_dates,keywords",
        });
        if (data && data.success !== false) break;
        if (data && data.success === false) break; // definitive 404 from TMDB
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
      if (!data || data.success === false) {
        if (data && data.success === false) {
          // Real 404: TMDB has no such id (or it was deleted).
          setData({});
          setImages([]);
          setLoading(false);
          setNotFound(true);
          return;
        }
        // Transient failure after retries — recoverable, never "unavailable".
        setFetchError(true);
        setLoading(false);
        return;
      }
      setData(data);
      setLoading(false);
      // Aggregate credits = every actor incl. animated/voice roles with their
      // characters; created_by surfaces the show creator on the overview.
      setCredits(data?.aggregate_credits || data?.credits || null);
      setExternalIds(data?.external_ids || null);

      // ── Enrichment: independent, failure-tolerant ──
      try {
        const Videos = await axiosFetch({
          requestID: `${rawType}Videos`,
          id: rawId,
        });
        setTrailer(
          Videos?.results?.find(
            (ele: any) => ele.type === "Trailer" && ele.official === true,
          ) || null,
        );
      } catch {
        setTrailer(null); // no trailer is fine
      }
      try {
        const response = await axiosFetch({
          requestID: `${rawType}Images`,
          id: rawId,
        });
        const arr: string[] = [];
        (response?.backdrops || []).slice(0, 20).forEach((ele: any) => {
          if (ele?.file_path) arr.push(TMDB_IMAGE_URL + ele.file_path);
        });
        if (arr.length === 0) {
          // Some titles (esp. non-English) only have poster art.
          (response?.posters || []).slice(0, 10).forEach((ele: any) => {
            if (ele?.file_path) arr.push(TMDB_IMAGE_URL + ele.file_path);
          });
        }
        if (arr.length === 0) arr.push("/images/logo.svg");
        setImages(arr);
      } catch {
        setImages(["/images/logo.svg"]); // gallery failure is non-fatal
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      return;
    }
    // Auth must never block rendering: this effect only resolves the user
    // for bookmark checks. Forcing loading=true here used to race the data
    // fetch and re-hide an already-loaded page.
    const unsub = onAuthStateChanged(auth, (user) => {
      setUser(user ? user.uid : null);
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    const fetch = async () => {
      if (data !== undefined && data !== null) {
        if (user !== undefined && user !== null)
          setBookmarked(
            await checkBookmarks({ userId: user, type: type, id: data.id }),
          );
        else
          setBookmarked(
            await checkBookmarks({ userId: null, type: type, id: data.id }),
          );
        // console.log(checkBookmarks({ userId: user, type: type, id: data.id }));
      }
    };
    fetch();
  }, [index, data, user]);

  const handleBookmarkAdd = () => {
    setBookmarks({ userId: user, type: type, id: data.id });
    setBookmarked(!bookmarked);
  };
  const handleBookmarkRemove = () => {
    removeBookmarks({ userId: user, type: type, id: data.id });
    setBookmarked(!bookmarked);
  };
  const handleShare = () => {
    const url = `/detail?type=${type}&id=${id}`;
    navigatorShare({ text: data.title, url: url });
  };

  if ((notFound || fetchError) && !loading) {
    return (
      <div className={styles.DetailPage}>
        <div
          style={{
            minHeight: "70vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          <h1 style={{ fontSize: "1.8rem", margin: 0 }}>
            {fetchError
              ? "Couldn&#39;t load this title"
              : "This title isn&#39;t available"}
          </h1>
          <p style={{ opacity: 0.7, maxWidth: 420 }}>
            {fetchError
              ? "We had trouble reaching the catalog. This is usually temporary."
              : "The link you followed is broken or the title no longer exists."}
          </p>
          <div
            style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
          >
            <Link className={styles.links} href="/">
              Go Home
            </Link>
            <Link className={styles.links} href="/search">
              Search Titles
            </Link>
            {fetchError && (
              <button
                type="button"
                className={styles.links}
                onClick={() => {
                  // Drop the failed cache entry so the retry gets a fresh run.
                  setFetchError(false);
                  setLoading(true);
                  window.location.reload();
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    // carousel
    // detail
    <div className={styles.DetailPage}>
      <div className={styles.biggerPic}>
        {
          images?.length > 0 ? (
            <Carousel
              imageArr={images}
              setIndex={setIndex}
              mobileHeight="60vh"
              desktopHeight="95vh"
              objectFit={"cover"}
            />
          ) : (
            <Skeleton className={styles.CarouselLoading} />
          ) // if no images array, then use backdrop poster
        }
        <div className={styles.curvy}></div>
        <div className={styles.curvy2}></div>
        <div className={styles.DetailBanner}>
          <div className={styles.poster}>
            <div className={styles.curvy3}></div>
            <div className={styles.curvy4}></div>
            <div
              className={styles.rating}
              data-tooltip-id="tooltip"
              data-tooltip-content="Rating"
            >
              {data?.vote_average?.toFixed(1)}
            </div>
            <MoviePoster data={data} media_type={type as string} />
          </div>
          <div className={styles.HomeHeroMeta}>
            <h1
              data-tooltip-id="tooltip"
              data-tooltip-content={data?.title || data?.name || "name"}
            >
              {data?.title || data?.name || <Skeleton />}
            </h1>
            <div className={styles.HomeHeroMetaRow2}>
              <p className={styles.type}>
                {data?.id ? (type == "movie" ? "MOVIE" : "SHOW") : null}
              </p>
              {data?.id ? (
                <>
                  <Link
                    className={styles.links}
                    data-tooltip-id="tooltip"
                    data-tooltip-content="Watch Online"
                    href={`${type === "movie" ? `/watch?type=${type}&id=${data?.id}` : `/watch?type=${type}&id=${data?.id}&season=1&episode=1`}`}
                  >
                    watch <FaPlay className={styles.IconsMobileNone} />
                  </Link>
                  <Link
                    className={`${styles.links} ${styles.downloadBtn}`}
                    data-tooltip-id="tooltip"
                    data-tooltip-content="Download"
                    href={`${type === "movie" ? `/watch?type=${type}&id=${data?.id}&source=download` : `/watch?type=${type}&id=${data?.id}&season=1&episode=1&source=download`}`}
                  >
                    download <BsDownload className={styles.IconsMobileNone} />
                  </Link>
                  {trailer && (
                    <button
                      type="button"
                      className={styles.links}
                      data-tooltip-id="tooltip"
                      data-tooltip-content="Watch Trailer"
                      onClick={() => setTrailerOpen(true)}
                    >
                      trailer <FaYoutube className={styles.IconsMobileNone} />
                    </button>
                  )}
                  {bookmarked ? (
                    <BsFillBookmarkCheckFill
                      className={styles.HomeHeroIcons}
                      onClick={handleBookmarkRemove}
                      data-tooltip-id="tooltip"
                      data-tooltip-content="Remove from Watchlist"
                    />
                  ) : (
                    <BsBookmarkPlus
                      className={styles.HomeHeroIcons}
                      onClick={handleBookmarkAdd}
                      data-tooltip-id="tooltip"
                      data-tooltip-content="Add to Watchlist"
                    />
                  )}
                  <BsShare
                    className={styles.HomeHeroIcons}
                    onClick={handleShare}
                    data-tooltip-id="tooltip"
                    data-tooltip-content="Share"
                  />
                </>
              ) : (
                <div>
                  <Skeleton width={200} count={1} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.biggerDetail}>
        {data?.title || data?.name ? (
          <AIInsights
            title={data?.title || data?.name}
            type={type || "movie"}
            overview={data?.overview || ""}
            genres={data?.genres?.map((g: any) => g.name) || []}
            rating={data?.vote_average}
            year={data?.release_date || data?.first_air_date}
            cast={data?.credits?.cast?.slice(0, 10).map((c: any) => c.name)}
          />
        ) : null}
        <MetaDetails
          id={id}
          type={type}
          data={data}
          credits={credits}
          externalIds={externalIds}
        />
      </div>

      {trailerOpen && trailer?.key && (
        <div
          className={styles.trailerModal}
          role="dialog"
          aria-modal="true"
          aria-label="Trailer"
          onClick={() => setTrailerOpen(false)}
        >
          <div
            className={styles.trailerFrame}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.trailerClose}
              data-tooltip-id="tooltip"
              data-tooltip-content="Close"
              aria-label="Close trailer"
              onClick={() => setTrailerOpen(false)}
            >
              ✕
            </button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`}
              title={`${data?.title || data?.name || ""} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DetailPage;
