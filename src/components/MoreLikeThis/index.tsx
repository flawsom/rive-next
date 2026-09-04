import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import axiosFetch from "@/Utils/fetchBackend";
import { useHoverScroll } from "@/Utils/useHoverScroll";
import { MdOutlineRecommend } from "react-icons/md";
import MovieCardSmall from "../MovieCardSmall";
import Skeleton from "react-loading-skeleton";

const dummyList = [1, 2, 3, 4, 5, 6];

/**
 * "More Like This" — recommendations rendered while you watch, because
 * viewers decide what's next mid-watch (Netflix places these on the
 * episode/details surface for exactly this reason). Backed by TMDB's
 * recommendations endpoint for the current title.
 */
const MoreLikeThis = ({ id, type }: { id: string; type: string }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const rowRef = useHoverScroll<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axiosFetch({
      requestID: type === "tv" ? "tvRelated" : "movieRelated",
      id,
    })
      .then((res: any) => {
        if (!cancelled) {
          setItems((res?.results || []).slice(0, 12));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  if (!loading && items.length === 0) return null;

  return (
    <div className={styles.moreRow}>
      <h1>
        <MdOutlineRecommend className={styles.rowIcon} /> More Like This
        <span className={styles.rowHint}>picked for this title</span>
      </h1>
      <div className={styles.rowList} ref={rowRef}>
        {loading
          ? dummyList.map((ele) => (
              <Skeleton className={styles.loading} key={ele} />
            ))
          : items.map((ele: any) => (
              <MovieCardSmall
                key={`${ele.id}-${ele.media_type}`}
                data={ele}
                media_type={ele.media_type === "tv" ? "tv" : "movie"}
              />
            ))}
      </div>
    </div>
  );
};

export default MoreLikeThis;
