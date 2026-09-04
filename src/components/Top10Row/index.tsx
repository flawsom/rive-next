import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import axiosFetch from "@/Utils/fetchBackend";
import { BsFire } from "react-icons/bs";
import MovieCardSmall from "../MovieCardSmall";
import Skeleton from "react-loading-skeleton";

const dummyList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * "Top 10 Today" — the numbered ranking row Netflix made iconic.
 * TMDB trending (day), ranked by real popularity order, rendered with
 * oversized rank digits so the row reads as a chart, not a poster grid.
 */
const Top10Row = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axiosFetch({ requestID: "trendingMovieDay" })
      .then((res: any) => {
        if (!cancelled) {
          const ranked = (res?.results || [])
            .slice(0, 10)
            .map((ele: any, idx: number) => ({ ...ele, rank: idx + 1 }));
          setItems(ranked);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <div className={styles.top10Row}>
      <h1>
        <BsFire className={styles.rowIcon} /> Top 10 Today
        <span className={styles.rowHint}>most watched right now</span>
      </h1>
      <div className={styles.rowList}>
        {loading
          ? dummyList.map((ele) => (
              <Skeleton className={styles.loading} key={ele} />
            ))
          : items.map((ele: any) => (
              <div
                key={ele.id}
                className={styles.rankWrap}
                aria-label={`Number ${ele.rank} today: ${ele.title || ele.name}`}
              >
                <span className={styles.rankNumber}>{ele.rank}</span>
                <MovieCardSmall
                  data={ele}
                  media_type={ele.media_type === "tv" ? "tv" : "movie"}
                />
              </div>
            ))}
      </div>
    </div>
  );
};

export default Top10Row;
