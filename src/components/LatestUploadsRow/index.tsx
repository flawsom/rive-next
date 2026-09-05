// Latest Uploads row — fresh drops from the searchable providers.
// The server endpoint crawls HDHub4u first, then MoviesDrive (whichever is
// reachable — both sit behind Cloudflare that blocks datacenter IPs, so the
// chain matters), matches each upload to TMDB, and links into the normal
// detail → watch flow. When every provider is unreachable the row shows a
// calm "back soon" note instead of skeletons (per-provider embeds are
// title-searched sites; the universal sources still play every title).
import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import MovieCardSmall from "../MovieCardSmall";
import Skeleton from "react-loading-skeleton";
import { BsRocketTakeoff } from "react-icons/bs";

const dummyList = [1, 2, 3, 4, 5, 6, 7, 8];

const LatestUploadsRow = () => {
  const [uploads, setUploads] = useState<any[]>([]);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Provider preference chain: HDHub4u first, MoviesDrive fallback.
      for (const pid of ["hdhub4u", "moviesdrive"]) {
        try {
          const res = await fetch(`/api/providers/latest?provider=${pid}`);
          const data = res.ok ? await res.json() : null;
          const list = Array.isArray(data?.uploads) ? data.uploads : [];
          if (list.length > 0) {
            if (cancelled) return;
            setUploads(list.slice(0, 18));
            setSource(data.provider || pid);
            setLoading(false);
            return;
          }
        } catch {
          // next provider
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && uploads.length === 0) {
    return (
      <div className={styles.latestRow}>
        <h1>
          <BsRocketTakeoff className={styles.rowIcon} /> Latest Uploads
          <span className={styles.rowHint}>
            provider updates paused — everything still streams
          </span>
        </h1>
        <p className={styles.emptyNote}>
          Our upload providers are refreshing right now. Browse the rows below
          or search — playback is unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.latestRow}>
      {" "}
      <h1>
        <BsRocketTakeoff className={styles.rowIcon} /> Latest Uploads
        <span className={styles.rowHint}>
          {source === "tmdb"
            ? "trending in theaters right now"
            : source === "moviesdrive"
              ? "fresh on MoviesDrive — hours old, not days"
              : "fresh on HDHub4U — hours old, not days"}
        </span>
      </h1>
      <div className={styles.rowList} data-hscroll>
        {loading
          ? dummyList.map((ele) => (
              <Skeleton className={styles.loading} key={ele} />
            ))
          : uploads.map((u: any, i: number) =>
              // Only titles that matched TMDB render (safe detail links);
              // the rest are skipped rather than becoming dead cards.
              u.tmdbId ? (
                <MovieCardSmall
                  key={`${u.tmdbId}-${i}`}
                  data={{
                    id: u.tmdbId,
                    title: u.title,
                    name: u.title,
                    poster_path: u.posterPath || u.poster || null,
                    overview: u.overview || "",
                  }}
                  media_type={u.tmdbType === "tv" ? "tv" : "movie"}
                />
              ) : null,
            )}
      </div>
    </div>
  );
};

export default LatestUploadsRow;
