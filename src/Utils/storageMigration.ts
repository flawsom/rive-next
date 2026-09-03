// One-time storage-key migration from the legacy "Rive*" names to the
// Open Stream names. Runs at most once per browser (flag key is stable),
// preserves all user data (watchlist, continue-watching, history, settings),
// and never throws — storage failures degrade to "no migration".
//
// Deliberately synchronous: callers read the new key immediately after
// calling this, and the migration is sub-millisecond in the common case
// (flag already set → early return) and a handful of fast localStorage ops
// on first boot.

const MIGRATED_FLAG = "openstream_storage_migrated_v1";

// [legacyKey, newKey] pairs. Order does not matter: each pair is independent.
const RENAMES: Array<[string, string]> = [
  ["RiveStreamSettings", "OpenStreamSettings"],
  ["RiveStreamWatchlist", "OpenStreamWatchlist"],
  ["RiveStreamContinueWatching", "OpenStreamContinueWatching"],
  ["RiveStreamHistory", "OpenStreamHistory"],
  ["rive_domain_discovery", "openstream_domain_discovery"],
  ["rive_domain_discovery_version", "openstream_domain_discovery_version"],
  ["rive_live_domain_map", "openstream_live_domain_map"],
  ["rive_auto_advance", "openstream_auto_advance"],
];

let done = false;

/** Idempotent storage migration. Safe to call on every read/write. */
export function migrateLegacyStorageKeys(): void {
  if (done || typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === "done") {
      done = true;
      return;
    }
  } catch {
    // localStorage unavailable — nothing to migrate.
    done = true;
    return;
  }

  for (const [from, to] of RENAMES) {
    try {
      const value = localStorage.getItem(from);
      if (value === null) continue;
      // Only take the legacy value when the new key isn't already populated.
      if (localStorage.getItem(to) === null) {
        localStorage.setItem(to, value);
      }
      localStorage.removeItem(from);
    } catch {
      // Quota/unavailable — skip this key, keep going.
    }
  }

  done = true;
  try {
    localStorage.setItem(MIGRATED_FLAG, "done");
  } catch {
    // Flag is best-effort; worst case migration re-runs harmlessly.
  }
}
