// Latest Uploads row — fresh drops from HDHub4u, the app's default source.
// The server endpoint crawls the provider's live homepage and matches each
// upload to TMDB so cards link into the normal detail → watch flow. The row
// hides itself entirely when the provider is unreachable.
import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import MovieCardSmall from "../MovieCardSmall";
import Skeleton from "react-loading-skeleton";
import { BsRocketTakeoff } from "react-icons/bs";

const dummyList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const LatestUploadsRow = () => {
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers/latest")
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: any) => {
        if (!cancelled) {
          setUploads(
            Array.isArray(data?.uploads) ? data.uploads.slice(0, 18) : [],
          );
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

  if (!loading && uploads.length === 0) return null;

  return (
    <div className={styles.latestRow}>
      <h1>
        <BsRocketTakeoff className={styles.rowIcon} /> Latest Uploads
        <span className={styles.rowHint}>
          fresh on HDHub4U — hours old, not days
        </span>
      </h1>
      <div className={styles.rowList}>
        {loading
          ? dummyList.map((ele) => (
              <Skeleton className={styles.loading} key={ele} />
            ))
          : uploads.map((u: any, i: number) => (
              <MovieCardSmall
                key={`${u.tmdbId || u.href}-${i}`}
                data={{
                  id: u.tmdbId || undefined,
                  title: u.title,
                  name: u.title,
                  poster_path: u.poster,
                  backdrop_path: u.poster,
                  overview: u.overview || "",
                  vote_average: undefined,
                  release_date: u.year ? `${u.year}-01-01` : undefined,
                }}
                media_type={u.tmdbType === "tv" ? "tv" : "movie"}
              />
            ))}
      </div>
    </div>
  );
};

export default LatestUploadsRow;
