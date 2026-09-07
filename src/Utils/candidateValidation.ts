// ─── Universal candidate validation ─────────────────────────────────────────
// One gate for EVERY stream candidate the extraction pipeline can produce
// (archive.org search, catalog file hosts, HTML/API scrapes, hint maps).
//
// Why this exists: candidates that PLAY but are WRONG are the worst failure
// mode in the whole app — a 6MB "5.1 Surround Sound Test", a trailer, or a
// 164MB 144p rip never triggers any fallback (it streams fine!), so the user
// just sees garbage and reports "the problem still exists". Transport fixes
// can't help; the candidate list itself must be validated.
//
// Three rules, cheapest first:
//   1. JUNK BLOCKLIST — trailers, promos, samples, audio tests, camera rips,
//      song jukeboxes. Name-based, instant.
//   2. TITLE RELEVANCE — every significant title token must appear in the
//      candidate's label/URL. Kills wrong-title matches (the archive text
//      index is keyword-based and happily returns "Dune Part Two" files for
//      an unrelated id).
//   3. SIZE FLOOR BY RUNTIME — bytes ÷ runtime must clear a watchable
//      bitrate. Calibrated against verified-good uploads: an 826MB
//      Interstellar (169 min) = 4.9 MB/min plays fine; the 164MB "Eternals"
//      (157 min) = 1.0 MB/min is an unwatchable slideshow. Floor: 2.2 MB/min
//      with a 100-minute default when the client has no runtime data.
//
// The videm HLS tier is exempt: those are minted per-title from the provider's
// own player state (id-resolved upstream) with ABR ladders — no bytes to
// check and no title text to match.

export interface ValidationContext {
  /** Display title, e.g. "Hanuman Ansh" or "Dune: Part Two". */
  title: string;
  /** TMDB runtime in minutes (movie runtime, or episode run time for TV). */
  runtimeMinutes?: number;
  /** TV episodes get a lower floor than features (shorter, not junkier). */
  isTv?: boolean;
}

/** Trailer/demo/sample/cam/song-upload patterns — instant reject. */
const JUNK_RE =
  /\b(trailer|teaser|promo|sample|sound ?test|5\.1|surround|aac ?test|dolby ?(vision|atmos)? ?(test|demo)|camrip|hdcam|hdts|\bcam\b|pdvd|dvdscr|screener|title ?sequence|opening ?titles|theme ?song|jukebox|lyrical|video ?song|song ?video|motion ?poster|recap)\b/i;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "in",
  "on",
  "to",
  "for",
  "with",
  "at",
  "by",
  "from",
  "part",
  "one",
  "two",
  "three",
  "chapter",
  "episode",
  "movie",
  "film",
  "hd",
  "4k",
  "1080p",
  "720p",
  "480p",
  "web",
  "dl",
  "webdl",
  "webrip",
  "bluray",
  "brrip",
  "hdrip",
  "x264",
  "x265",
  "hevc",
  "aac",
  "hindi",
  "english",
  "dubbed",
  "official",
  "full",
]);

/** Lowercase, strip separators/punctuation, collapse spaces. */
function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_.+:;,!?()[\]{}'’"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Significant title tokens: long enough, not a stopword, not pure digits.
 * "Dune: Part Two" → ["dune", "two"]; "Hanuman Ansh" → ["hanuman", "ansh"].
 */
export function titleTokens(title: string): string[] {
  return normText(title)
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

export interface ValidatableCandidate {
  label?: string;
  url: string;
  bytes?: number;
}

/** Minimum acceptable bytes for the given context. */
export function minBytesFor(ctx: ValidationContext): number {
  const MB = 1_000_000;
  const runtime =
    ctx.runtimeMinutes && ctx.runtimeMinutes > 10
      ? ctx.runtimeMinutes
      : ctx.isTv
        ? 45
        : 100;
  // 2.2 MB per minute ≈ 0.30 Mbps average — below any watchable video.
  return Math.round(runtime * 2.2 * MB);
}

/**
 * Validate one candidate against the context. Returns null when rejected,
 * otherwise a short reason string is NOT needed — just a boolean-style gate.
 */
export function isCandidateValid(
  candidate: ValidatableCandidate,
  ctx: ValidationContext,
): boolean {
  const haystack = normText(`${candidate.label || ""} ${candidate.url}`);

  // 1) Junk names.
  if (JUNK_RE.test(haystack)) return false;

  // 2) Title relevance: every significant token must be present. The
  // collapsed (space-free) haystack catches split/joined forms — a post
  // named "Spiderman" matches title tokens ["spider", "man"].
  const tokens = titleTokens(ctx.title);
  const collapsed = haystack.replace(/ /g, "");
  if (
    tokens.length > 0 &&
    !tokens.every((t) => haystack.includes(t) || collapsed.includes(t))
  ) {
    return false;
  }

  // 3) Size floor by runtime (only when the size is known).
  if (candidate.bytes && candidate.bytes > 0) {
    if (candidate.bytes < minBytesFor(ctx)) return false;
  }

  return true;
}

/** Filter a candidate list, keeping only valid entries. */
export function validateCandidates<T extends ValidatableCandidate>(
  candidates: T[],
  ctx: ValidationContext,
): T[] {
  if (!ctx.title) return candidates;
  return candidates.filter((c) => isCandidateValid(c, ctx));
}
