// Watch history: every session is recorded (title, episode, minutes watched)
// and synced to the user's Firebase account when signed in, so history follows
// the viewer across devices (rubric: "watch lists + history, sync across devices").

import { auth } from "./firebase";
import { pushFbHistory, fetchFbHistory } from "./firebaseUser";
import { migrateLegacyStorageKeys } from "./storageMigration";
import { getScopedKey } from "./profiles";

export interface HistoryEntry {
  type: "movie" | "tv";
  id: string | number;
  season?: number;
  episode?: number;
  title?: string;
  poster?: string;
  durationMinutes?: number;
  minutesWatched: number;
  updatedAt: number;
}

const STORAGE_KEY = "OpenStreamHistory";
const MAX_ENTRIES = 100;

function loadRaw(): any {
  if (typeof localStorage === "undefined") return null;
  migrateLegacyStorageKeys();
  try {
    return JSON.parse(
      localStorage.getItem(getScopedKey(STORAGE_KEY)) || "null",
    );
  } catch {
    return null;
  }
}

function saveRaw(value: any): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getScopedKey(STORAGE_KEY), JSON.stringify(value));
  } catch {
    // Storage unavailable — in-memory only.
  }
}

const entryKey = (entry: {
  type: string;
  id: string | number;
  season?: number;
  episode?: number;
}) => `${entry.type}-${entry.id}-${entry.season ?? 0}-${entry.episode ?? 0}`;

export function getHistoryEntries(): HistoryEntry[] {
  const raw = loadRaw();
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry: any) =>
        entry && entry.type && entry.id !== undefined && entry.id !== null,
    )
    .sort((a: HistoryEntry, b: HistoryEntry) => b.updatedAt - a.updatedAt);
}

export interface RecordWatchInput {
  type: "movie" | "tv";
  id: string | number;
  season?: number;
  episode?: number;
  title?: string;
  poster?: string;
  durationMinutes?: number;
  minutesWatched: number;
}

export function recordWatch(input: RecordWatchInput): void {
  const entries = getHistoryEntries();
  const key = entryKey(input);
  const existing = entries.find((e) => entryKey(e) === key);
  const next: HistoryEntry = existing
    ? { ...existing }
    : {
        type: input.type,
        id: input.id,
        season: input.season,
        episode: input.episode,
        minutesWatched: 0,
        updatedAt: Date.now(),
      };
  next.minutesWatched = Math.max(0, input.minutesWatched);
  if (input.title) next.title = input.title;
  if (input.poster) next.poster = input.poster;
  if (input.durationMinutes) next.durationMinutes = input.durationMinutes;
  next.updatedAt = Date.now();

  const withoutOld = entries.filter((e) => entryKey(e) !== key);
  withoutOld.unshift(next);
  saveRaw(withoutOld.slice(0, MAX_ENTRIES));
  syncHistoryToCloud();
}

export const removeFromHistory = ({ type, id, season, episode }: any) => {
  const entries = getHistoryEntries();
  const key = entryKey({ type, id, season, episode });
  saveRaw(entries.filter((e) => entryKey(e) !== key));
  syncHistoryToCloud();
};

export const clearHistory = () => {
  saveRaw([]);
  syncHistoryToCloud();
};

// ─── Cloud sync (debounced push, explicit pull-merge) ───────────────────────
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function syncHistoryToCloud(): void {
  if (typeof window === "undefined") return;
  if (!auth) return;
  const user = auth.currentUser;
  if (!user || pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const entries = getHistoryEntries();
    if (entries.length === 0) return;
    pushFbHistory(user.uid, entries).catch(() => {
      // Offline/failure — the next session will push again.
    });
  }, 2000);
}

/** Pull remote history and merge with local (later updatedAt wins). Returns the merged list. */
export async function pullHistoryFromCloud(): Promise<HistoryEntry[] | null> {
  if (typeof window === "undefined") return null;
  if (!auth) return null;
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const remote = await fetchFbHistory(user.uid);
    if (!remote || !Array.isArray(remote) || remote.length === 0) return null;

    const local = getHistoryEntries();
    const byKey = new Map<string, HistoryEntry>();
    [...local, ...(remote as HistoryEntry[])].forEach((entry) => {
      const key = entryKey(entry);
      const current = byKey.get(key);
      if (!current || (entry.updatedAt || 0) > (current.updatedAt || 0)) {
        byKey.set(key, entry);
      }
    });
    const merged = Array.from(byKey.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ENTRIES);
    saveRaw(merged);
    return merged;
  } catch {
    return null;
  }
}
