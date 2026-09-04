// TMDB-first algorithmic recommendation engine.
//
// Strategy: TMDB is the always-fresh data source (it knows every new release
// the day it appears), so recommendations are built from REAL TMDB endpoints
// — recommendations of everything the user watched, is watching, or searched
// — then scored algorithmically against the taste profile. The AI gateway
// (gateway model chain, led by mimo-v2.5) is only an optional layer that personalizes
// reasons/ordering and NEVER blocks the response: when the gateway is down,
// the algorithmic result stands alone.
//
// Signal inputs:
// - Watch history     (watchHistory.tsx — watched shows)
// - Continue watching (continueWatching.tsx — in-progress shows)
// - Search history    (searchHistory.ts — what the user looked for)

import axiosFetch from "@/Utils/fetchBackend";
import { getHistoryEntries } from "@/Utils/watchHistory";
import { getContinueWatchingEntries } from "@/Utils/continueWatching";
import { getRecentSearches } from "@/Utils/searchHistory";
import { fetchGeo } from "@/Utils/geo";

const IMG_BASE =
  process.env.NEXT_PUBLIC_TMBD_IMAGE_URL || "https://image.tmdb.org/t/p/w500";

export interface TasteProfile {
  /** TMDB seeds from fully/partially watched titles (recent first). */
  watchedSeeds: Seed[];
  /** TMDB seeds from in-progress titles. */
  watchingSeeds: Seed[];
  /** Ranked search terms (most recent/frequent first). */
  searchTerms: string[];
  /** Aggregated genre affinity from watch history (genre id → weight). */
  genreWeights: Map<number, number>;
}

export interface Seed {
  type: "movie" | "tv";
  id: number;
  title?: string;
}

/** Recency-decay weight: today=1.0, a week≈0.6, a month≈0.35. */
function recencyWeight(updatedAt: number): number {
  const ageDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);
  return Math.exp(-ageDays / 21);
}

export function buildTasteProfile(): TasteProfile {
  const watched = getHistoryEntries().slice(0, 20);
  const watching = getContinueWatchingEntries().slice(0, 20);
  const searchTerms = getRecentSearches(12);

  const watchedSeeds: Seed[] = watched
    .map((h: any) => ({
      type: h.type as "movie" | "tv",
      id: Number(h.id),
      title: typeof h.title === "string" ? h.title : undefined,
    }))
    .filter((s) => Number.isFinite(s.id) && s.id > 0);

  const watchingSeeds: Seed[] = watching
    .map((c: any) => ({
      type: c.type as "movie" | "tv",
      id: Number(c.id),
      title: typeof c.title === "string" ? c.title : undefined,
    }))
    .filter((s) => Number.isFinite(s.id) && s.id > 0);

  // Genre affinity from watch-history metadata when present (TMDB genre ids
  // may be stored by enrichment); weighted by recency.
  const genreWeights = new Map<number, number>();
  for (const h of watched as any[]) {
    const weight = recencyWeight(h.updatedAt || Date.now());
    for (const g of h.genres || []) {
      const gid =
        typeof g === "number"
          ? g
          : g && typeof g === "object" && typeof g.id === "number"
            ? g.id
            : null;
      if (gid != null) {
        genreWeights.set(gid, (genreWeights.get(gid) || 0) + weight);
      }
    }
  }

  return { watchedSeeds, watchingSeeds, searchTerms, genreWeights };
}

/** Search-history→genre affinity: what genres does this user gravitate to? */
async function deriveSearchGenreAffinity(
  terms: string[],
): Promise<Map<number, number>> {
  const weights = new Map<number, number>();
  for (const term of terms.slice(0, 6)) {
    try {
      const res: any = await axiosFetch({
        requestID: "searchMulti",
        query: term,
      });
      for (const r of (res?.results || []).slice(0, 3)) {
        for (const gid of r.genre_ids || []) {
          weights.set(gid, (weights.get(gid) || 0) + 1);
        }
      }
    } catch {
      // TMDB hiccup on one term must not break recommendations.
    }
  }
  return weights;
}

/** Fetch TMDB recommendations for a batch of seeds in parallel. */
async function fetchSeedNeighbors(seeds: Seed[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  await Promise.all(
    seeds.map(async (s) => {
      try {
        const res: any = await axiosFetch({
          requestID: s.type === "tv" ? "tvRelated" : "movieRelated",
          id: String(s.id),
        });
        out.set(
          `${s.type}:${s.id}`,
          Array.isArray(res?.results) ? res.results : [],
        );
      } catch {
        out.set(`${s.type}:${s.id}`, []);
      }
    }),
  );
  return out;
}

export interface Recommendation {
  key: string;
  id: number;
  type: "movie" | "tv";
  title: string;
  overview: string;
  poster: string | null;
  year: number;
  rating: number;
  genreIds: number[];
  popularity: number;
  score: number;
  reason: string;
  sourceWeight: number;
}

function toRecommendation(
  r: any,
  reason: string,
  sourceWeight: number,
): Recommendation | null {
  if (!r || (!r.title && !r.name)) return null;
  const type: "movie" | "tv" =
    r.media_type === "tv" || (!r.media_type && r.first_air_date)
      ? "tv"
      : "movie";
  const date: string = r.release_date || r.first_air_date || "";
  return {
    key: `${type}:${r.id}`,
    id: r.id,
    type,
    title: r.title || r.name,
    overview: r.overview || "",
    poster: r.poster_path ? IMG_BASE + r.poster_path : null,
    year: Number(date.slice(0, 4)) || 0,
    rating: typeof r.vote_average === "number" ? r.vote_average : 0,
    genreIds: Array.isArray(r.genre_ids) ? r.genre_ids : [],
    popularity: typeof r.popularity === "number" ? r.popularity : 0,
    score: 0,
    reason,
    sourceWeight,
  };
}

/** The main entry point: real, fresh, personalized recommendations. */
export async function getRecommendations(options?: {
  limit?: number;
  excludeIds?: Set<string>;
}): Promise<{
  items: Recommendation[];
  sources: { watched: number; watching: number; searches: number };
  aiUsed: boolean;
}> {
  const limit = options?.limit ?? 18;
  const profile = buildTasteProfile();

  const seedMeta = new Map<
    string,
    { label: "watching" | "watched"; title?: string }
  >();
  for (const s of profile.watchingSeeds) {
    seedMeta.set(`${s.type}:${s.id}`, { label: "watching", title: s.title });
  }
  for (const s of profile.watchedSeeds) {
    if (!seedMeta.has(`${s.type}:${s.id}`)) {
      seedMeta.set(`${s.type}:${s.id}`, { label: "watched", title: s.title });
    }
  }

  const seeds: Seed[] = [
    ...profile.watchingSeeds,
    ...profile.watchedSeeds,
  ].slice(0, 12);

  const [neighborMap, searchAffinity] = await Promise.all([
    fetchSeedNeighbors(seeds),
    deriveSearchGenreAffinity(profile.searchTerms),
  ]);

  // Combined genre taste: watch-history (strong) + search behavior (medium).
  const combinedGenres = new Map(profile.genreWeights);
  searchAffinity.forEach((w, gid) => {
    combinedGenres.set(gid, (combinedGenres.get(gid) || 0) + w * 0.5);
  });

  const seen = new Set<string>();
  for (const s of seeds) seen.add(`${s.type}:${s.id}`);
  const excluded = options?.excludeIds;

  const scored: Recommendation[] = [];
  const push = (rec: Recommendation | null) => {
    if (!rec) return;
    if (seen.has(rec.key) || excluded?.has(rec.key)) return;
    seen.add(rec.key);
    scored.push(rec);
  };

  // 1. TMDB neighbors of everything watched / in progress (fresh titles).
  for (const [seedKey, list] of Array.from(neighborMap.entries())) {
    const meta = seedMeta.get(seedKey);
    const label =
      meta?.label === "watching" ? "you're watching" : "you watched";
    const seedTitle = meta?.title ? `“${meta.title}”` : "something similar";
    for (const r of list) {
      push(toRecommendation(r, `Because ${label} ${seedTitle}`, 1.0));
    }
  }

  // 2. Search-term hits — real TMDB results for what the user looks for.
  for (const term of profile.searchTerms.slice(0, 7)) {
    try {
      const res: any = await axiosFetch({
        requestID: "searchMulti",
        query: term,
      });
      for (const r of (res?.results || []).slice(0, 3)) {
        push(toRecommendation(r, `Matches your searches for “${term}”`, 0.55));
      }
    } catch {
      // Skip a failing term.
    }
  }

  // 3. Cold-start fallback: the visitor's regional chart first (a new user in
  // India should see India's hits, not US ones), then worldwide trending.
  if (scored.length < limit) {
    try {
      const geo = await fetchGeo();
      const country = geo.source === "fallback" ? null : geo.country;
      if (country) {
        try {
          const regional: any = await axiosFetch({
            requestID: "regionTrendingMovie",
            country,
          });
          for (const r of regional?.results || []) {
            push(
              toRecommendation(
                r,
                `Popular in ${geo.regionName || country} right now`,
                0.4,
              ),
            );
          }
        } catch {
          // Regional chart hiccup — worldwide trending below still covers it.
        }
      }
      if (scored.length < limit) {
        const trend: any = await axiosFetch({ requestID: "trending" });
        for (const r of trend?.results || []) {
          push(toRecommendation(r, "Trending today on Open Stream", 0.35));
        }
      }
    } catch {
      // TMDB unreachable and no local signal — caller gets an empty list.
    }
  }

  // 4. Score: genre affinity × rating × popularity × source × freshness.
  const nowYear = new Date().getFullYear();
  for (const rec of scored) {
    const genreAffinity = rec.genreIds.reduce(
      (sum, gid) => sum + (combinedGenres.get(gid) || 0),
      0,
    );
    const freshness = rec.year >= nowYear - 1 ? 0.25 : 0;
    rec.score =
      2.2 * genreAffinity +
      1.4 * (rec.rating / 10) +
      0.4 * Math.log10(1 + rec.popularity) +
      0.5 * rec.sourceWeight +
      freshness;
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // 5. Optional AI polish — personalize reasons via the gateway. The LLM
  // never invents titles here (TMDB already provided them), it only writes
  // the "why". Server-side route keeps the gateway client-safe; if the
  // gateway is down, algorithmic reasons stand as-is.
  let aiUsed = false;
  if (top.length > 0) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: top.map((r) => ({
            title: r.title,
            type: r.type,
            year: r.year,
            rating: r.rating,
            reason: r.reason,
          })),
          searchTerms: profile.searchTerms.slice(0, 6),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        for (const entry of data?.items || []) {
          const idx = Number(entry?.i);
          const reason = String(entry?.reason || "");
          if (Number.isInteger(idx) && top[idx] && reason) {
            top[idx].reason = reason;
            aiUsed = true;
          }
        }
      }
    } catch {
      aiUsed = false;
    }
  }

  return {
    items: top,
    sources: {
      watched: profile.watchedSeeds.length,
      watching: profile.watchingSeeds.length,
      searches: profile.searchTerms.length,
    },
    aiUsed,
  };
}
