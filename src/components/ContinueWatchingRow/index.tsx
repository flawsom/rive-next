import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import axiosFetch from "@/Utils/fetchBackend";
import { BsPlayCircleFill, BsClockHistory } from "react-icons/bs";
import MovieCardSmall from "../MovieCardSmall";
import Skeleton from "react-loading-skeleton";
import {
  getContinueWatchingEntries,
  removeContinueWatching,
  getProgressPercent,
  formatMinutes,
  getResumeUrl,
  ContinueEntry,
} from "@/Utils/continueWatching";

interface CardData extends ContinueEntry {
  title?: string;
  poster?: string;
  poster_path?: string;
  backdrop_path?: string;
}

const dummyList = [1, 2, 3, 4, 5];

const ContinueWatchingRow = () => {
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = getContinueWatchingEntries().slice(0, 8);
      if (entries.length === 0) {
        if (!cancelled) {
          setLoading(false);
          setCards([]);
        }
        return;
      }

      const enriched = await Promise.all(
        entries.map(async (entry) => {
          const card: CardData = { ...entry };
          try {
            const res = await axiosFetch({
              requestID: entry.type === "movie" ? "movieData" : "tvData",
              id: String(entry.id),
            });
            if (res) {
              card.title = res.title || res.name || card.title;
              card.poster = card.poster || res.poster_path;
              card.poster_path = res.poster_path;
              if (entry.type === "movie" && res.runtime) {
                card.durationMinutes = res.runtime;
              }
            }
          } catch {
            // Keep entry-level metadata; the card still renders.
          }
          return card;
        }),
      );
      if (!cancelled) {
        setCards(enriched);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRemove = (entry: ContinueEntry) => {
    removeContinueWatching(entry);
    setCards((prev) =>
      (prev || []).filter(
        (c) =>
          !(
            c.type === entry.type &&
            String(c.id) === String(entry.id) &&
            (c.season ?? 0) === (entry.season ?? 0) &&
            (c.episode ?? 0) === (entry.episode ?? 0)
          ),
      ),
    );
  };

  if (loading) {
    return (
      <div className={styles.continueRow}>
        <h1>
          <BsClockHistory className={styles.rowIcon} /> Continue Watching
        </h1>
        <div className={styles.rowList}>
          {dummyList.map((ele) => (
            <Skeleton className={styles.loading} key={ele} />
          ))}
        </div>
      </div>
    );
  }

  if (!cards || cards.length === 0) return null;

  return (
    <div className={styles.continueRow}>
      <h1>
        <BsClockHistory className={styles.rowIcon} /> Continue Watching
        <span className={styles.rowHint}>resumed where you left off</span>
      </h1>
      <div className={styles.rowList}>
        {cards.map((card) => {
          const percent = getProgressPercent(card);
          return (
            <div
              key={`${card.type}-${card.id}-${card.season}-${card.episode}`}
              className={styles.cardWrap}
            >
              <MovieCardSmall
                data={{
                  id: card.id,
                  title: card.title,
                  name: card.title,
                  poster_path: card.poster_path || card.poster || null,
                }}
                media_type={card.type}
                progress={percent ?? undefined}
                customHref={getResumeUrl(card)}
                onRemove={() => handleRemove(card)}
              />
              {!card.durationMinutes && card.minutesWatched ? (
                <p className={styles.timeChip}>
                  {formatMinutes(card.minutesWatched)}
                </p>
              ) : null}
              <span className={styles.playBadge}>
                <BsPlayCircleFill />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ContinueWatchingRow;
