// Taste profile export/import — the user owns their data. Exports the
// active profile's watchlist, history, continue-watching and search history
// as a single portable JSON file; importing restores it (per-profile).
import {
  getContinueWatchingEntries,
  type ContinueEntry,
} from "./continueWatching";
import { getHistoryEntries, type HistoryEntry } from "./watchHistory";
import { getRecentSearches } from "./searchHistory";
import { getActiveProfile } from "./profiles";

const EXPORT_VERSION = 1;
const EXPORT_KEY = "OpenStreamWatchlist"; // same key the bookmark util uses

export interface TasteExport {
  app: "open-stream";
  version: number;
  exportedAt: string;
  profile: { name: string; kids?: boolean };
  watchlist: { movie: Array<string | number>; tv: Array<string | number> };
  continueWatching: ContinueEntry[];
  history: HistoryEntry[];
  searches: string[];
}

export async function buildTasteExport(): Promise<TasteExport> {
  let watchlist: any = null;
  try {
    const raw = localStorage.getItem(EXPORT_KEY);
    watchlist = raw ? JSON.parse(raw) : { movie: [], tv: [] };
  } catch {
    watchlist = { movie: [], tv: [] };
  }
  return {
    app: "open-stream",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: {
      name: getActiveProfile()?.name || "Viewer",
      kids: getActiveProfile()?.kids,
    },
    watchlist: {
      movie: Array.isArray(watchlist?.movie) ? watchlist.movie : [],
      tv: Array.isArray(watchlist?.tv) ? watchlist.tv : [],
    },
    continueWatching: getContinueWatchingEntries(),
    history: getHistoryEntries(),
    searches: getRecentSearches(40),
  };
}

export function downloadTasteExport(data: TasteExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-stream-taste-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  watchlist: number;
  continueWatching: number;
  history: number;
  searches: number;
}

/** Merge an export into the active profile (later timestamps win). */
export function importTasteData(raw: unknown): ImportResult {
  const data = raw as TasteExport;
  if (!data || data.app !== "open-stream" || typeof data !== "object") {
    throw new Error("Not an Open Stream taste file");
  }
  const result: ImportResult = {
    watchlist: 0,
    continueWatching: 0,
    history: 0,
    searches: 0,
  };

  // Watchlist.
  try {
    const existingRaw = localStorage.getItem(EXPORT_KEY);
    const existing = existingRaw
      ? JSON.parse(existingRaw)
      : { movie: [], tv: [] };
    const merged = {
      movie: Array.from(
        new Set([
          ...(Array.isArray(existing?.movie) ? existing.movie : []),
          ...(Array.isArray(data.watchlist?.movie) ? data.watchlist.movie : []),
        ]),
      ),
      tv: Array.from(
        new Set([
          ...(Array.isArray(existing?.tv) ? existing.tv : []),
          ...(Array.isArray(data.watchlist?.tv) ? data.watchlist.tv : []),
        ]),
      ),
    };
    localStorage.setItem(EXPORT_KEY, JSON.stringify(merged));
    result.watchlist = merged.movie.length + merged.tv.length;
  } catch {
    // ignore watchlist merge errors
  }

  // Continue watching (dedupe by entry key, later updatedAt wins).
  try {
    const keyOf = (e: any) =>
      `${e.type}-${e.id}-${e.season ?? 0}-${e.episode ?? 0}`;
    const existing = getContinueWatchingEntries();
    const byKey = new Map<string, ContinueEntry>();
    [...existing, ...(data.continueWatching || [])].forEach((e) => {
      const k = keyOf(e);
      const cur = byKey.get(k);
      if (!cur || (e.updatedAt || 0) >= (cur.updatedAt || 0)) byKey.set(k, e);
    });
    const merged = Array.from(byKey.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
    localStorage.setItem("OpenStreamContinueWatching", JSON.stringify(merged));
    result.continueWatching = merged.length;
  } catch {
    // ignore
  }

  // History.
  try {
    const keyOf = (e: any) =>
      `${e.type}-${e.id}-${e.season ?? 0}-${e.episode ?? 0}`;
    const existing = getHistoryEntries();
    const byKey = new Map<string, HistoryEntry>();
    [...existing, ...(data.history || [])].forEach((e) => {
      const k = keyOf(e);
      const cur = byKey.get(k);
      if (!cur || (e.updatedAt || 0) >= (cur.updatedAt || 0)) byKey.set(k, e);
    });
    const merged = Array.from(byKey.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
    localStorage.setItem("OpenStreamHistory", JSON.stringify(merged));
    result.history = merged.length;
  } catch {
    // ignore
  }

  // Searches.
  try {
    const existing = getRecentSearches(40);
    const merged = Array.from(
      new Set(
        [...(data.searches || []), ...existing].map((s) => s.toLowerCase()),
      ),
    ).slice(0, 40);
    localStorage.setItem("OpenStreamSearchHistory", JSON.stringify(merged));
    result.searches = merged.length;
  } catch {
    // ignore
  }

  return result;
}
