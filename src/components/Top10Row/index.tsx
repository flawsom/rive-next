import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import axiosFetch from "@/Utils/fetchBackend";
import { fetchGeo } from "@/Utils/geo";
import { useHoverScroll } from "@/Utils/useHoverScroll";
import { BsFire } from "react-icons/bs";
import MovieCardSmall from "../MovieCardSmall";
import Skeleton from "react-loading-skeleton";

const dummyList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * "Top 10 Today" — the numbered ranking row Netflix made iconic, scoped to
 * the visitor's country: server-side geo detection resolves the country once
 * (session-cached) and the regional TMDB chart fills the ranking. A viewer in
 * India gets India's hits, a viewer in Germany Germany's. Falls back to the
 * worldwide trending chart when geo is unavailable or the regional chart is
 * empty, so the row never disappears.
 */
const Top10Row = () => {
  const [items, setItems] = useState<any[]>([]);
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const rowRef = useHoverScroll<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // fetchGeo never rejects — it resolves to a "fallback" marker when the
      // country can't be trusted, in which case we stay worldwide.
      const geo = await fetchGeo();
      const country = geo.source === "fallback" ? null : geo.country;

      let ranked: any[] = [];
      let usedRegional = false;
      if (country) {
        try {
          const res = await axiosFetch({
            requestID: "regionTrendingMovie",
            country,
          });
          ranked = (res?.results || []).slice(0, 10);
          usedRegional = ranked.length > 0;
        } catch {
          ranked = [];
        }
      }
      if (!usedRegional) {
        try {
          const res = await axiosFetch({ requestID: "trendingMovieDay" });
          ranked = (res?.results || []).slice(0, 10);
        } catch {
          ranked = [];
        }
      }
      if (cancelled) return;

      setItems(
        ranked.map((ele: any, idx: number) => ({ ...ele, rank: idx + 1 })),
      );
      setLabel(usedRegional ? geo.regionName || null : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <div className={styles.top10Row}>
      <h1>
        <BsFire className={styles.rowIcon} />
        {label ? `Top 10 in ${label}` : "Top 10 Today"}
        <span className={styles.rowHint}>
          {label
            ? "most watched in your region right now"
            : "most watched right now"}
        </span>
      </h1>
      <div className={styles.rowList} ref={rowRef}>
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
