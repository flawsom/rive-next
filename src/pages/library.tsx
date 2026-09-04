import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import axiosFetch from "@/Utils/fetchBackend";
import styles from "@/styles/Library.module.scss";
import MovieCardSmall from "@/components/MovieCardSmall";
import ReactPaginate from "react-paginate"; // for pagination
import { AiFillLeftCircle, AiFillRightCircle } from "react-icons/ai";
import { MdFilterAlt, MdFilterAltOff } from "react-icons/md";
import Skeleton from "react-loading-skeleton";
import { getBookmarks, removeBookmarks } from "@/Utils/bookmark";
import {
  getContinueWatching,
  getContinueWatchingEntries,
  getProgressPercent,
  getResumeUrl,
} from "@/Utils/continueWatching";
import {
  getHistoryEntries,
  removeFromHistory,
  clearHistory,
  pullHistoryFromCloud,
} from "@/Utils/watchHistory";
import { getRecommendations } from "@/Utils/recommendationEngine";
import { BsFillBookmarkXFill } from "react-icons/bs";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/Utils/firebase";
import NProgress from "nprogress";
// import MoviePoster from '@/components/MoviePoster';

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const dummyList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const Library = () => {
  const router = useRouter();
  const [category, setCategory] = useState("watchlist"); // latest, trending, topRated
  const [subCategory, setSubCategory] = useState("movie");
  const [ids, setIds] = useState<any[]>([]);
  const [data, setData] = useState<any>([]);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(true);
  const [user, setUser] = useState<any>();
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  // "For You" — TMDB-first personalized recommendations.
  const [foryouItems, setForyouItems] = useState<any[]>([]);
  const [foryouMeta, setForyouMeta] = useState<any>(null);
  // Entry-level progress so the Continue Watching shelf shows real bars.
  const continueEntries = getContinueWatchingEntries();

  useEffect(() => {
    if (!auth) return;
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userID = user.uid;
        setUser(userID);
        // setIds(await getBookmarks(userID)?.movie)
        // setLoading(false);
      } else {
        // setLoading(true);
      }
    });
  }, []);

  useEffect(() => {
    if (loading) {
      NProgress.start();
    } else NProgress.done(false);
  }, [loading]);

  useEffect(() => {
    setLoading(true);
    // setData([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const fetchData = async () => {
      let arr: any = [];
      try {
        for (const ele of ids) {
          const data = await axiosFetch({
            requestID: `${subCategory}Data`,
            id: ele,
          });
          if (data !== undefined) await arr.push(data);
          console.log({ arr });
          // setLoading(false);
        }
        // if (ids.length === 0 || ids === null || ids === undefined)
        //   setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
      return arr;
    };
    fetchData().then((res) => {
      setData(res);
      setLoading(false);
    });
  }, [ids]);

  useEffect(() => {
    // fetch bookmarks
    // console.log(getBookmarks());
    const fetch = async () => {
      if (category === "watchlist") {
        if (user !== null && user !== undefined)
          getBookmarks(user).then((res: any) => {
            subCategory === "movie" ? setIds(res?.movie) : setIds(res?.tv);
          });
        else {
          subCategory === "movie"
            ? setIds(getBookmarks(null)?.movie)
            : setIds(getBookmarks(null)?.tv);
        }
      } else if (category === "continueWatching") {
        subCategory === "movie"
          ? setIds(getContinueWatching()?.movie)
          : setIds(getContinueWatching()?.tv);
      }
    };
    if (category === "history") {
      setHistoryEntries(
        getHistoryEntries().filter((e) => e.type === subCategory),
      );
      // Cloud-merge on open, then re-render with the synced list.
      pullHistoryFromCloud().then((merged) => {
        if (merged)
          setHistoryEntries(merged.filter((e) => e.type === subCategory));
      });
    }
    if (user !== null) fetch();
  }, [category, subCategory, trigger, user]);

  useEffect(() => {
    if (category !== "foryou") return;
    let cancelled = false;
    setForyouItems([]);
    getRecommendations({ limit: 18 })
      .then((res) => {
        if (!cancelled) {
          setForyouItems(res.items);
          setForyouMeta(res.sources);
        }
      })
      .catch(() => {
        if (!cancelled) setForyouItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category, trigger]);

  const handleWatchlistremove = async ({ type, id }: any) => {
    if (user !== null && user !== undefined)
      removeBookmarks({ userId: user, type: type, id: id })?.then((res): any =>
        setTimeout(() => {
          setTrigger(!trigger);
        }, 500),
      );
    else {
      removeBookmarks({ userId: null, type: type, id: id });
      setTrigger(!trigger);
    }
  };

  return (
    <div className={styles.MoviePage}>
      {/* if login, "hello username" */}
      {/* else, "Login to sunc to cloud" */}
      <h1>Library</h1>
      <div className={styles.category}>
        <p
          className={`${category === "foryou" ? styles.active : styles.inactive}`}
          onClick={() => setCategory("foryou")}
        >
          For You ✨
        </p>
        <p
          className={`${category === "watchlist" ? styles.active : styles.inactive}`}
          onClick={() => setCategory("watchlist")}
        >
          Watchlist
        </p>
        <p
          className={`${category === "continueWatching" ? styles.active : styles.inactive}`}
          onClick={() => setCategory("continueWatching")}
        >
          Continue Watching
        </p>
        <p
          className={`${category === "history" ? styles.active : styles.inactive}`}
          onClick={() => setCategory("history")}
        >
          History
        </p>
        <p
          className={styles.inactive}
          style={{ cursor: "pointer" }}
          onClick={() => router.push("/collections/community")}
        >
          Community Lists →
        </p>
        {category === "history" && historyEntries?.length > 0 && (
          <p
            className={styles.inactive}
            style={{
              textDecoration: "underline",
              cursor: "pointer",
              marginLeft: "auto",
            }}
            onClick={() => {
              clearHistory();
              setHistoryEntries([]);
            }}
          >
            Clear history
          </p>
        )}
      </div>
      {category !== "foryou" && (
        <div className={styles.category}>
          <p
            className={`${subCategory === "movie" ? styles.active : styles.inactive}`}
            onClick={() => setSubCategory("movie")}
          >
            Movie
          </p>
          <p
            className={`${subCategory === "tv" ? styles.active : styles.inactive}`}
            onClick={() => setSubCategory("tv")}
          >
            TV Shows
          </p>
        </div>
      )}

      {category === "foryou" ? (
        <div className={styles.movieList}>
          {foryouItems?.length > 0 ? (
            foryouItems.map((rec: any) => (
              <div className={styles.foryouItem} key={rec.key}>
                <MovieCardSmall
                  data={{
                    id: rec.id,
                    title: rec.title,
                    name: rec.title,
                    poster_path: rec.poster,
                  }}
                  media_type={rec.type}
                />
                <p className={styles.reasonLine} title={rec.reason}>
                  {rec.reason}
                </p>
              </div>
            ))
          ) : (
            <p>
              {foryouMeta
                ? "Not enough signals yet — watch, search, or bookmark a few titles and this fills up with picks tuned to you."
                : "Loading your picks…"}
            </p>
          )}
        </div>
      ) : category === "history" ? (
        <div className={styles.movieList}>
          {historyEntries?.length > 0 ? (
            historyEntries.map((entry: any) => (
              <MovieCardSmall
                key={`${entry.type}-${entry.id}-${entry.season ?? 0}-${entry.episode ?? 0}`}
                data={{
                  id: entry.id,
                  title: entry.title,
                  name: entry.title,
                  poster_path: entry.poster || null,
                }}
                media_type={entry.type}
                progress={getProgressPercent(entry) ?? undefined}
                customHref={getResumeUrl(entry)}
                onRemove={() => {
                  removeFromHistory(entry);
                  setHistoryEntries((prev) =>
                    prev.filter(
                      (e: any) =>
                        !(
                          String(e.id) === String(entry.id) &&
                          e.type === entry.type &&
                          (e.season ?? 0) === (entry.season ?? 0) &&
                          (e.episode ?? 0) === (entry.episode ?? 0)
                        ),
                    ),
                  );
                }}
              />
            ))
          ) : (
            <p>
              No history yet — everything you watch lands here and syncs to your
              account.
            </p>
          )}
        </div>
      ) : null}
      <div className={styles.movieList}>
        {category !== "history" &&
        data?.length !== 0 &&
        ids?.length !== 0 &&
        ids !== undefined ? (
          data?.map((ele: any) => {
            if (category === "watchlist") {
              return (
                <div className={styles.watchlistItems}>
                  <MovieCardSmall data={ele} media_type={subCategory} />
                  <BsFillBookmarkXFill
                    className={styles.bookmarkIcon}
                    data-tooltip-id="tooltip"
                    data-tooltip-content="Remove from Watchlist"
                    onClick={() =>
                      handleWatchlistremove({ type: subCategory, id: ele?.id })
                    }
                  />
                </div>
              );
            }
            const entry = continueEntries.find(
              (e) => e.type === subCategory && String(e.id) === String(ele?.id),
            );
            return (
              <MovieCardSmall
                data={ele}
                media_type={subCategory}
                progress={
                  entry ? (getProgressPercent(entry) ?? undefined) : undefined
                }
                customHref={entry ? getResumeUrl(entry) : undefined}
              />
            );
          })
        ) : ids?.length === 0 || ids === undefined ? (
          <p>List Is Empty</p>
        ) : (
          dummyList.map((ele) => <Skeleton className={styles.loading} />)
        )}
        {/* {
          (data?.length === 0 || ids?.length === 0) && dummyList.map((ele) => (
            <Skeleton className={styles.loading} />
          ))
        } */}
      </div>
    </div>
  );
};

export default Library;
