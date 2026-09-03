// Search history — what the user has looked for, most recent first.
// Feeds the recommendation engine ("searched shows" signal) and can power
// future search suggestions. Local-only, capped, deduped.

const STORAGE_KEY = "RiveSearchHistory";
const MAX_ENTRIES = 40;

export function recordSearch(query: string): void {
  if (typeof localStorage === "undefined") return;
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return;
  try {
    const existing: string[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    );
    const next = [
      q,
      ...existing.filter((e) => e.toLowerCase() !== q.toLowerCase()),
    ].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable/full — skip silently.
  }
}

/** Most recent unique searches, newest first. */
export function getRecentSearches(limit = 12): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const list: string[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    );
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export function clearSearchHistory(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
