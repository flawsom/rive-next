// Continue Watching v2
//
// Entries carry watch progress so the UI can offer real "Continue Watching"
// (poster + progress bar + resume deep link), matching what top streaming
// web apps ship. The legacy format ({ movie: [ids], tv: [ids] }) is still
// read and migrated transparently.

import { migrateLegacyStorageKeys } from "./storageMigration";

export interface ContinueEntry {
  type: "movie" | "tv";
  id: string | number;
  season?: number;
  episode?: number;
  title?: string;
  poster?: string;
  /** Total runtime in minutes (movie runtime or episode runtime). */
  durationMinutes?: number;
  /** Accumulated minutes actually watched. */
  minutesWatched?: number;
  updatedAt: number;
}

const STORAGE_KEY = "OpenStreamContinueWatching";
const MAX_ENTRIES = 40;
const COMPLETION_RATIO = 0.95;

function loadRaw(): any {
  if (typeof localStorage === "undefined") return null;
  migrateLegacyStorageKeys();
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveRaw(value: any): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage full/unavailable — continue without persisting.
  }
}

function entryKey(entry: {
  type: string;
  id: string | number;
  season?: number;
  episode?: number;
}): string {
  return `${entry.type}-${entry.id}-${entry.season ?? 0}-${entry.episode ?? 0}`;
}

/** Normalize stored data to the v2 entries array (migrates legacy format). */
export function getContinueWatchingEntries(): ContinueEntry[] {
  const raw = loadRaw();
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (entry: any) =>
          entry && entry.type && entry.id !== undefined && entry.id !== null,
      )
      .sort((a: ContinueEntry, b: ContinueEntry) => b.updatedAt - a.updatedAt);
  }
  // Legacy: { movie: [id, ...], tv: [id, ...] }
  const legacy = raw as {
    movie?: Array<string | number>;
    tv?: Array<string | number>;
  };
  if (legacy.movie || legacy.tv) {
    const migrated: ContinueEntry[] = [];
    (legacy.movie || []).forEach((id) =>
      migrated.push({ type: "movie", id, updatedAt: Date.now() }),
    );
    (legacy.tv || []).forEach((id) =>
      migrated.push({ type: "tv", id, updatedAt: Date.now() }),
    );
    saveRaw(migrated);
    return migrated;
  }
  return [];
}

export interface WatchProgressInput {
  type: "movie" | "tv";
  id: string | number;
  season?: number;
  episode?: number;
  title?: string;
  poster?: string;
  durationMinutes?: number;
  /** Minutes to add to the accumulated watch time. */
  addMinutes?: number;
  /** Exact total minutes (replaces accumulated) — used by the custom player. */
  totalMinutes?: number;
}

/** Upsert progress for the currently playing title. */
export const setContinueWatching = ({
  type,
  id,
  season,
  episode,
  title,
  poster,
  durationMinutes,
  addMinutes = 0,
  totalMinutes,
}: WatchProgressInput) => {
  const entries = getContinueWatchingEntries();
  const key = entryKey({ type, id, season, episode });
  const existing = entries.find((e) => entryKey(e) === key);
  const next = existing
    ? { ...existing }
    : { type, id, season, episode, title, poster, updatedAt: Date.now() };

  next.minutesWatched =
    typeof totalMinutes === "number" && totalMinutes >= 0
      ? totalMinutes
      : (next.minutesWatched || 0) + Math.max(0, addMinutes);
  if (title) next.title = title;
  if (poster) next.poster = poster;
  if (durationMinutes) next.durationMinutes = durationMinutes;
  next.updatedAt = Date.now();

  // A nearly-finished title leaves the continue-watching shelf.
  if (
    next.durationMinutes &&
    next.minutesWatched >= next.durationMinutes * COMPLETION_RATIO
  ) {
    const remaining = entries.filter((e) => entryKey(e) !== key);
    saveRaw(remaining);
    return;
  }

  const withoutOld = entries.filter((e) => entryKey(e) !== key);
  withoutOld.unshift(next);
  saveRaw(withoutOld.slice(0, MAX_ENTRIES));
};

export const removeContinueWatching = ({ type, id, season, episode }: any) => {
  const entries = getContinueWatchingEntries();
  const key = entryKey({ type, id, season, episode });
  saveRaw(entries.filter((e) => entryKey(e) !== key));
};

export const checkContinueWatching = ({ type, id }: any) => {
  return getContinueWatchingEntries().some(
    (e) => e.type === type && String(e.id) === String(id),
  );
};

/** Legacy shape used by pages that consume id lists. */
export const getContinueWatching = () => {
  const entries = getContinueWatchingEntries();
  const movie: Array<string | number> = [];
  const tv: Array<string | number> = [];
  const seenMovie = new Set<string>();
  const seenTv = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "movie" && !seenMovie.has(String(entry.id))) {
      seenMovie.add(String(entry.id));
      movie.push(entry.id);
    } else if (entry.type === "tv" && !seenTv.has(String(entry.id))) {
      seenTv.add(String(entry.id));
      tv.push(entry.id);
    }
  }
  return { movie, tv };
};

/** 0-100 progress when a duration is known, otherwise null (indeterminate). */
export const getProgressPercent = (entry: ContinueEntry): number | null => {
  if (!entry.durationMinutes || entry.durationMinutes <= 0) return null;
  return Math.min(
    100,
    Math.max(
      0,
      Math.round(((entry.minutesWatched || 0) / entry.durationMinutes) * 100),
    ),
  );
};

/** "1h 24m" / "12m" formatting. */
export const formatMinutes = (minutes: number): string => {
  if (!minutes || minutes < 1) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

/** Watch deep link for an entry (resume where they left off). */
export const getResumeUrl = (entry: ContinueEntry): string => {
  if (entry.type === "tv") {
    return `/watch?type=tv&id=${entry.id}&season=${entry.season ?? 1}&episode=${entry.episode ?? 1}`;
  }
  return `/watch?type=movie&id=${entry.id}`;
};
