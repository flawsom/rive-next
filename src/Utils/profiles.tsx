// Profiles engine — Netflix-style multiple viewers under one browser (and
// one Firebase account). Every profile gets its own storage namespace: the
// library/storage modules derive their keys through getScopedKey(), so
// watchlist, history, continue-watching and search history are per-profile
// with zero data migration.
//
// The default profile ("viewer") keeps the UNSCOPED legacy keys, so existing
// users see exactly the data they had before profiles existed.

export interface StreamProfile {
  id: string;
  name: string;
  /** Kids mode: discovery surfaces filter mature TMDB genres. */
  kids?: boolean;
  createdAt: number;
}

const PROFILES_KEY = "OpenStreamProfiles";
const ACTIVE_KEY = "OpenStreamActiveProfile";
export const DEFAULT_PROFILE_ID = "viewer";

const DEFAULT_PROFILE: StreamProfile = {
  id: DEFAULT_PROFILE_ID,
  name: "Viewer",
  createdAt: 0,
};

let activeCache: StreamProfile | null = null;

/** Event fired after any profile switch — pages re-read their scoped data. */
export const PROFILE_CHANGED_EVENT = "openstream:profile-changed";

function loadProfiles(): StreamProfile[] {
  if (typeof localStorage === "undefined") return [DEFAULT_PROFILE];
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY) || "null");
    if (Array.isArray(raw) && raw.length > 0) return raw;
  } catch {
    // Corrupt storage — fall back to the default profile.
  }
  return [DEFAULT_PROFILE];
}

function saveProfiles(profiles: StreamProfile[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // Storage unavailable — profiles stay in-memory for this session.
  }
}

/** All profiles (the default "viewer" always exists implicitly). */
export function getProfiles(): StreamProfile[] {
  return loadProfiles();
}

/** Currently active profile. Default (and fallback): the unscoped "viewer". */
export function getActiveProfile(): StreamProfile {
  if (typeof localStorage === "undefined") return DEFAULT_PROFILE;
  if (activeCache) return activeCache;
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
    const id = typeof raw?.id === "string" ? raw.id : DEFAULT_PROFILE_ID;
    activeCache = loadProfiles().find((p) => p.id === id) || DEFAULT_PROFILE;
  } catch {
    activeCache = DEFAULT_PROFILE;
  }
  return activeCache;
}

/** Switch the active profile (no-op for unknown ids) and notify the app. */
export function switchProfile(id: string): void {
  if (typeof localStorage === "undefined") return;
  if (!loadProfiles().some((p) => p.id === id)) return;
  activeCache = null;
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id }));
  } catch {
    // Non-fatal: the switch applies for this session only.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  }
}

/** Create a profile. Kids mode filters mature genres from discovery surfaces. */
export function createProfile(name: string, kids = false): StreamProfile {
  const profiles = loadProfiles();
  const profile: StreamProfile = {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: (name || "").trim().slice(0, 24) || "Profile",
    kids,
    createdAt: Date.now(),
  };
  profiles.push(profile);
  saveProfiles(profiles);
  return profile;
}

/** Delete a profile (the default profile cannot be deleted). */
export function deleteProfile(id: string): void {
  if (id === DEFAULT_PROFILE_ID) return;
  saveProfiles(loadProfiles().filter((p) => p.id !== id));
  if (getActiveProfile().id === id) {
    activeCache = null;
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
    }
  }
}

/** Rename a profile / toggle kids mode. */
export function updateProfile(id: string, patch: Partial<StreamProfile>): void {
  saveProfiles(
    loadProfiles().map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
  );
  if (getActiveProfile().id === id) activeCache = null;
}

/** True when the active profile is a kids profile. */
export function isKidsMode(): boolean {
  return !!getActiveProfile()?.kids;
}

/**
 * Scoped storage key for per-profile data. The default profile keeps the
 * raw legacy keys (zero migration); other profiles get
 * `OpenStreamP<id>:<baseKey>` namespaces.
 */
export function getScopedKey(baseKey: string): string {
  if (typeof localStorage === "undefined") return baseKey;
  const profile = getActiveProfile();
  if (!profile || profile.id === DEFAULT_PROFILE_ID) return baseKey;
  return `OpenStreamP${profile.id}:${baseKey}`;
}

/** TMDB genre ids treated as mature — hidden from kids-mode surfaces. */
export const KIDS_BLOCKED_GENRES = new Set([
  27, 80, 10759, 10764, 10765, 10766, 10767,
]);

/** Client-side kids filter for catalog result arrays (uses TMDB genre_ids). */
export function filterForKids<T extends { genre_ids?: number[] }>(
  items: T[],
): T[] {
  if (!isKidsMode()) return items;
  return items.filter(
    (item) => !(item.genre_ids || []).some((g) => KIDS_BLOCKED_GENRES.has(g)),
  );
}
