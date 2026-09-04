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
  const [images, setImages] = useState([]);
  const [data, setData] = useState<any>({});
  const [bookmarked, setBookmarked] = useState(false);
  const [trailer, setTrailer] = useState<any>("");
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<any>();

  // A link with a missing/invalid type or id (e.g. /detail?type=undefined&id=undefined)
  // must never spin forever — resolve it to a friendly not-found state instead.
  const paramsValid =
    (type === "movie" || type === "tv") &&
    !!id &&
    id !== "undefined" &&
    id !== "null" &&
    /^\d+$/.test(id as string);

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

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    const rawType = params.get("type");
    const rawId = params.get("id");
    setType(rawType);
    setId(rawId);
    setSeason(params.get("season"));
    setEpisode(params.get("episode"));
    const typeOk = rawType === "movie" || rawType === "tv";
    const idOk = !!rawId && /^\d+$/.test(rawId);
    if (!typeOk || !idOk) {
      // Bad link: show the not-found state immediately instead of endless skeletons.
      setData({});
      setImages([]);
      setLoading(false);
      setNotFound(true);
      return;
    }
    const fetchData = async () => {
      try {
        const data = await axiosFetch({ requestID: `${type}Data`, id: id });
        setData(data);
        const Videos = await axiosFetch({ requestID: `${type}Videos`, id: id });
        setTrailer(
          Videos?.results?.find(
            (ele: any) => ele.type === "Trailer" && ele.official === true,
          ),
        );
        const response = await axiosFetch({
          requestID: `${type}Images`,
          id: id,
        });
        // setImages(response.results);
        let arr: any = [];
        response.backdrops.map((ele: any, i: number) => {
          if (i < 20) arr.push(TMDB_IMAGE_URL + ele.file_path);
        });
        // if (arr.length === 0) {
        //   response.posters.map((ele: any, i) => {
        //     if (i < 10) arr.push(process.env.NEXT_PUBLIC_TMBD_IMAGE_URL + ele.file_path);
        //   });
        // }
        if (arr.length === 0) arr.push("/images/logo.svg");
        setImages(arr);
        setLoading(false);
      } catch (error) {
        // Failed lookup (bad id, deleted title, network) → not-found, never an eternal skeleton.
        setData({});
        setImages([]);
        setLoading(false);
        setNotFound(true);
      }
      // finally {
      //   const data = await axiosFetch({ requestID: `${type}Data`, id: id });
      //   setData(data);
      // }
    };
    fetchData();
  }, [params, id]);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userID = user.uid;
        setUser(userID);
        // setIds(await getBookmarks(userID)?.movie)
        setLoading(false);
      } else {
        setLoading(true);
      }
    });
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

  if (notFound && !loading) {
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
            This title isn&#39;t available
          </h1>
          <p style={{ opacity: 0.7, maxWidth: 420 }}>
            The link you followed is broken or the title no longer exists.
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link className={styles.links} href="/">
              Go Home
            </Link>
            <Link className={styles.links} href="/search">
              Search Titles
            </Link>
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
            <MoviePoster data={data} />
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
        <MetaDetails id={id} type={type} data={data} />
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
