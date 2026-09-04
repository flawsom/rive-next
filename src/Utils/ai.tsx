import OpenAI from "openai";
import axiosFetch from "./fetch"; // server-side util — builds real TMDB URLs (the client util would yield relative /api paths)
import {
  ALL_PROVIDERS,
  getProvidersByCategory,
  PHISHER_PROVIDERS,
  CSX_PROVIDERS,
} from "./providers";

/**
 * AI gateway configuration.
 *
 * Open Stream talks to an OpenAI-compatible gateway instead of OpenAI directly.
 * Defaults point at the operator's gateway; both values are overridable via
 * environment (Settings → Environment):
 *   OPENAI_BASE_URL  — gateway base (default: https://kiraai.vn/api/v1)
 *   OPENAI_API_KEY   — gateway API key
 *   AI_MODEL         — preferred model (default: mimo-v2.5, the cheapest
 *                      reliable model on this gateway — clean token usage,
 *                      "runs forever" economics with solid quality)
 *
 * Freshness/internet: LLMs on a plain gateway have no live browsing, so Open Stream
 * grounds the assistant with live TMDB data (trending injected into prompts,
 * AI-suggested titles verified against TMDB before display). TMDB is the
 * freshness source; the model reasons over it.
 */
const GATEWAY_BASE = process.env.OPENAI_BASE_URL || "https://kiraai.vn/api/v1";

/**
 * Ordered model chain: cheapest reliable first, auto-fallback on outage/quota.
 * - mimo-v2.5: free-tier workhorse — reliable content, clean token usage
 * - hy3: free-tier backup (reasoning model; slower, deeper)
 * - qwen3.8-flash / glm-5.3-flash: preferred cheap models; auto-activates once
 *   the gateway wallet is topped up (they currently need VND balance)
 * - deepseek-v4-flash: requested flagship tier, activates if enabled on the key
 */
const MODEL_CHAIN = [
  process.env.AI_MODEL || "mimo-v2.5",
  "hy3",
  "qwen3.8-flash",
  "glm-5.3-flash",
  "deepseek-v4-flash",
];

/** Last model that answered successfully — tried first on subsequent calls. */
let preferredModel: string | null = null;

/**
 * Extract the outermost JSON object from model output.
 *
 * Reasoning models (mimo, hy3, …) often emit chain-of-thought prose *before*
 * the JSON payload, which breaks naive JSON.parse. This scans for the first
 * balanced {…} block (string- and escape-aware) and parses that. Code fences
 * are tolerated. Returns null when no parseable object exists.
 */
function extractJsonObject(content: string): any | null {
  const text = content.replace(/```(?:json)?/gi, "");
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let start = -1;
  let open = "";
  let close = "";
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    open = "{";
    close = "}";
  } else if (arrStart !== -1) {
    start = arrStart;
    open = "[";
    close = "]";
  }
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: GATEWAY_BASE,
    });
  }
  return openaiClient;
}

/** True when any gateway credential is present (used for graceful gating). */
export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Single chat completion through the gateway with automatic model fallback.
 * Falls through the chain on 4xx/5xx/timeouts so transient gateway outages
 * on one model degrade to the next instead of failing the request.
 */
async function chatComplete(options: {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const openai = getOpenAIClient();
  const chain = preferredModel
    ? [preferredModel, ...MODEL_CHAIN.filter((m) => m !== preferredModel)]
    : MODEL_CHAIN;

  // Latency budgets: free-tier gateway models occasionally hang, and the SDK's
  // default timeout (10 min) would blow straight through serverless function
  // limits. Reasoning models also need real generation time (thinking tokens
  // precede the payload), so each attempt gets the remaining phase budget —
  // capped — and the whole LLM phase keeps headroom for the TMDB grounding
  // that runs after it inside the same request.
  const ATTEMPT_TIMEOUT_CAP_MS = 40_000;
  const PHASE_BUDGET_MS = 45_000;
  const phaseStarted = Date.now();

  let lastError: unknown = null;
  for (const model of chain) {
    const remaining = PHASE_BUDGET_MS - (Date.now() - phaseStarted);
    if (remaining <= 2_000) break;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(ATTEMPT_TIMEOUT_CAP_MS, remaining),
    );
    try {
      const response = await openai.chat.completions.create(
        {
          model,
          messages: options.messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        },
        { signal: controller.signal },
      );
      const content = response.choices[0]?.message?.content;
      if (content) {
        preferredModel = model;
        return content;
      }
      lastError = new Error("Empty completion");
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("All gateway models failed");
}

// Build dynamic provider context for the system prompt
function buildProviderContext(): string {
  const movieTvProviders = getProvidersByCategory("movie")
    .filter(
      (p) => !p.categories.includes("live") && !p.categories.includes("music"),
    )
    .map(
      (p) => `
  - ${p.name} (${p.id}): ${p.description} | Lang: ${p.language.toUpperCase()} | ${p.repoSource.toUpperCase()} | ${p.capabilities.hq ? "HD" : "SD"} ${p.capabilities.subtitle ? "SUB" : ""} ${p.capabilities.dub ? "DUB" : ""} ${p.capabilities.dubbedHindi ? "Hindi Dub" : ""} | Categories: ${p.categories.join(", ")} | Priority: ${p.priority}`,
    )
    .join("");

  const animeProviders = getProvidersByCategory("anime")
    .map(
      (p) => `
  - ${p.name} (${p.id}): ${p.description} | Lang: ${p.language.toUpperCase()} | ${p.repoSource.toUpperCase()} | ${p.capabilities.hq ? "HD" : "SD"} ${p.capabilities.subtitle ? "SUB" : ""} ${p.capabilities.dub ? "DUB" : ""} ${p.capabilities.dubbedHindi ? "Hindi Dub" : ""}`,
    )
    .join("");

  const langCount = new Map<string, number>();
  ALL_PROVIDERS.forEach((p) => {
    langCount.set(p.language, (langCount.get(p.language) || 0) + 1);
  });
  const langSummary = Array.from(langCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}(${count})`)
    .join(", ");

  return `

## Streaming Sources Available on Open Stream (${ALL_PROVIDERS.length} total sources)

Open Stream has ${ALL_PROVIDERS.length} streaming sources from two repositories:
- Phisher Repo (${PHISHER_PROVIDERS.length} sources): Primary repo with HDHub4U, 4KHDHub, StreamPlay, and ${getProvidersByCategory("anime").length}+ anime sources
- CSX Repo (${CSX_PROVIDERS.length} sources): Secondary repo with MoviesDrive, Bollyflix, CineStream, VegaMovies

Default sources: HDHub4U and MoviesDrive (auto-selected based on latency)
Languages supported: ${langSummary}

### Movies & TV Sources (${movieTvProviders.length} sources)
${movieTvProviders}

### Anime & Cartoon Sources (${animeProviders.length} sources)
${animeProviders}

### Source Recommendation Guidelines
- For Hindi/Bollywood content: Recommend HDHub4U, MoviesDrive, MovieBox, MultiMovies, DesiCinemas
- For English/Hollywood: Recommend HDHub4U, 4KHDHub, StreamPlay, CineStream, Goojara
- For Anime: Recommend Anichi, AnimePahe, KickassAnime, AnimeDekho (Hindi dub)
- For K-Drama/Asian: Recommend KissKh, MPlayer, OneTouchTV, ShowBox
- For 4K content: Recommend 4K HDHub specifically
- For cartoons (Hindi): Recommend DoraBash, Kartoons, PirateXPlay, AnimeSalt
- The system auto-switches sources if one fails - always mention this to users
`;
}

/**
 * Live TMDB context injected into prompts so the model always reasons over
 * what is actually current (trending right now) instead of stale training
 * data. Fetched server-side via the platform's TMDB proxy util; fails soft.
 */
async function buildTmdbFreshnessContext(): Promise<string> {
  // Short cache: trending data changes by the day, not by the minute —
  // this keeps chat snappy without hammering TMDB on every message.
  if (freshnessCache && Date.now() - freshnessCache.at < 5 * 60_000) {
    return freshnessCache.value;
  }
  try {
    const [movies, tv] = await Promise.all([
      axiosFetch({ requestID: "trendingMovieDay" }),
      axiosFetch({ requestID: "trendingTvDay" }),
    ]);
    const fmt = (list: any) =>
      (Array.isArray(list?.results) ? list.results : [])
        .slice(0, 10)
        .map(
          (r: any) =>
            `"${r.title || r.name}" (${(r.release_date || r.first_air_date || "").slice(0, 4)})`,
        )
        .join(", ");
    const movieLine = fmt(movies);
    const tvLine = fmt(tv);
    const value =
      !movieLine && !tvLine
        ? ""
        : `

## Currently Trending on TMDB (live, today)
- Trending movies: ${movieLine || "unavailable"}
- Trending TV: ${tvLine || "unavailable"}

Use this list to stay current. When users ask what's new or popular, prefer these titles. For any specific title question, you may assume the platform can search TMDB for accurate metadata — do not claim a title is unavailable just because it is recent.`;
    freshnessCache = { value, at: Date.now() };
    return value;
  } catch {
    return "";
  }
}

/**
 * TMDB search used to ground AI suggestions in real, discoverable titles.
 * Returns the matched TMDB entry or null when the title does not exist.
 */
async function tmdbVerifyTitle(title: string): Promise<{
  id: number;
  name: string;
  year: string;
  type: "movie" | "tv";
  posterPath: string | null;
} | null> {
  try {
    const res: any = await axiosFetch({
      requestID: "searchMulti",
      query: title,
    });
    const hit = (Array.isArray(res?.results) ? res.results : []).find(
      (r: any) =>
        (r.title || r.name || "")
          .toLowerCase()
          .includes(title.toLowerCase().slice(0, 30)),
    );
    if (!hit) return null;
    return {
      id: hit.id,
      name: hit.title || hit.name,
      year: (hit.release_date || hit.first_air_date || "").slice(0, 4),
      type: hit.media_type === "tv" || hit.first_air_date ? "tv" : "movie",
      posterPath: hit.poster_path || null,
    };
  } catch {
    return null;
  }
}

let freshnessCache: { value: string; at: number } | null = null;

// System prompt for the AI movie/show assistant (provider-aware)
export const SYSTEM_PROMPT = `You are Open Stream AI, a knowledgeable and enthusiastic movie and TV show assistant for the Open Stream streaming platform. You help users discover content, provide recommendations, answer questions about movies and TV shows, and offer personalized suggestions.

Your capabilities:
- Recommend movies and TV shows based on user preferences, mood, genre, or specific criteria
- Provide detailed information about movies and TV shows (plot summaries, cast, ratings, release dates)
- Suggest content based on viewing history and preferences
- Help users find content by mood, genre, language, or theme
- Answer trivia and questions about films and TV series
- Provide "if you liked X, try Y" recommendations
- Recommend the BEST streaming source for specific content (you have access to the full source registry)
- Help users find content in specific languages (Hindi, Tamil, Telugu, English, Korean, Japanese, etc.)
- Suggest anime sources and cartoon sources when asked about animated content
- Advise on source quality (HD, 4K, SUB, DUB availability)

Guidelines:
- Be conversational, friendly, and enthusiastic about cinema
- When recommending content, suggest which source would be best for it
- When users ask about sources, explain the available options with their capabilities
- Include genre, year, and key details in recommendations
- If unsure about something, say so honestly
- Keep responses concise but informative (2-4 paragraphs max unless asked for detail)
- Use markdown formatting for readability (bold titles, bullet points for lists)
- When users describe a mood or feeling, match content to that vibe
- For Indian content, suggest Hindi sources like HDHub4U, MoviesDrive, DesiCinemas
- For international content, suggest the best matching source
- For anime, recommend from the dedicated anime sources
- Always mention that Open Stream auto-switches sources if one fails
- Support multilingual content suggestions (Hindi, Tamil, Telugu, English, Korean, Japanese, Bengali, etc.)
`;

// Get dynamic system prompt with provider context + live TMDB freshness
export async function getFullSystemPrompt(): Promise<string> {
  const [providerContext, freshness] = await Promise.all([
    Promise.resolve(buildProviderContext()),
    buildTmdbFreshnessContext(),
  ]);
  return SYSTEM_PROMPT + providerContext + freshness;
}

// Generate AI chat response
export async function generateChatResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  context?: string,
): Promise<string> {
  const systemMessage = {
    role: "system" as const,
    content:
      (await getFullSystemPrompt()) +
      (context
        ? `\n\nAdditional context about the user's viewing history:\n${context}`
        : ""),
  };

  return await chatComplete({
    messages: [systemMessage, ...messages],
    maxTokens: 3000, // reasoning models emit thinking tokens before the JSON payload
    temperature: 0.7,
  });
}

/**
 * Personalize one-line reasons for algorithmically selected recommendations.
 * The LLM never invents titles here — TMDB already provided them — it only
 * writes the "why you'd like this" line. Returns true when any reason was
 * upgraded; false means callers keep their algorithmic reasons.
 */
export async function polishRecommendationReasons(
  items: {
    title: string;
    type: string;
    overview?: string;
    reason: string;
    rating?: number;
    year?: number;
  }[],
  context?: { searchTerms?: string[] },
): Promise<boolean> {
  if (!items.length) return false;
  const list = items
    .slice(0, 18)
    .map(
      (r, i) =>
        `${i}. "${r.title}" (${r.type}${r.year ? `, ${r.year}` : ""}${r.rating ? `, ★${r.rating.toFixed(1)}` : ""}) — current reason: ${r.reason}`,
    )
    .join("\n");

  const prompt = `Rewrite the recommendation reason for each title below as ONE short personal line (max 12 words) explaining why THIS user would enjoy it, given their searches: ${(context?.searchTerms || []).join(", ") || "(none)"}.

${list}

Respond with ONLY a JSON array: [{"i":0,"reason":"..."},{"i":1,"reason":"..."}] — same indices, no markdown.`;

  try {
    const content = await chatComplete({
      messages: [
        {
          role: "system",
          content:
            "You write concise personal recommendation reasons for a streaming app. Respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 3000, // reasoning models emit thinking tokens before the JSON payload
      temperature: 0.7,
    });
    const parsed = extractJsonObject(content);
    if (!parsed) return false;
    let upgraded = false;
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      const idx = Number(entry?.i);
      const reason = String(entry?.reason || "").slice(0, 140);
      if (Number.isInteger(idx) && items[idx] && reason) {
        items[idx].reason = reason;
        upgraded = true;
      }
    }
    return upgraded;
  } catch {
    return false;
  }
}

// Generate content insights for a movie/show
export async function generateContentInsights(data: {
  title: string;
  type: string;
  overview: string;
  genres: string[];
  rating?: number;
  year?: string;
  cast?: string[];
}): Promise<{
  summary: string;
  whyWatch: string;
  moodMatch: string[];
  similarVibes: string[];
}> {
  const prompt = `Generate engaging insights for this ${data.type === "movie" ? "movie" : "TV show"}:

Title: ${data.title}
Type: ${data.type}
Genres: ${data.genres.join(", ")}
${data.rating ? `Rating: ${data.rating}/10` : ""}
${data.year ? `Year: ${data.year}` : ""}
${data.cast?.length ? `Key Cast: ${data.cast.slice(0, 5).join(", ")}` : ""}

Overview: ${data.overview}

Provide a JSON response with these fields:
- summary: A compelling 1-2 sentence "elevator pitch" for this content (different from the overview, more engaging/personal)
- whyWatch: A short paragraph explaining why someone should watch this (2-3 sentences)
- moodMatch: Array of 3-4 moods/feelings this content matches (e.g., ["thrilling", "thought-provoking", "heartwarming"])
- similarVibes: Array of 3-4 similar movies/shows someone might also enjoy (just titles)

Return ONLY valid JSON, no markdown formatting.`;

  try {
    const content = await chatComplete({
      messages: [
        {
          role: "system",
          content:
            "You are a movie/TV show content analyst. Always respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 3000, // reasoning models emit thinking tokens before the JSON payload
      temperature: 0.7,
    });

    return extractJsonObject(content);
  } catch {
    return {
      summary: data.overview?.substring(0, 200) + "...",
      whyWatch: `A ${data.genres[0] || "great"} ${data.type} worth checking out.`,
      moodMatch: data.genres.slice(0, 3),
      similarVibes: [],
    };
  }
}

/**
 * Generate smart recommendations based on viewing history.
 * AI-suggested titles are verified against TMDB (algorithmic grounding):
 * only real, discoverable titles are returned, enriched with TMDB ids,
 * posters and years so the UI can deep-link straight to detail pages.
 */
export async function generateRecommendations(viewingHistory: {
  recentlyWatched: { title: string; type: string; genres: string[] }[];
  favoriteGenres: string[];
  preferences?: string;
}): Promise<{
  recommendations: {
    title: string;
    reason: string;
    type: string;
    id?: number;
    year?: string;
    posterPath?: string | null;
  }[];
  moodSuggestion: string;
}> {
  const prompt = `Based on this viewing profile, generate 8 personalized content recommendations:

Recently Watched:
${viewingHistory.recentlyWatched.map((w) => `- "${w.title}" (${w.type}, genres: ${w.genres.join(", ")})`).join("\n")}

Favorite Genres: ${viewingHistory.favoriteGenres.join(", ")}
${viewingHistory.preferences ? `User Preferences: ${viewingHistory.preferences}` : ""}

Provide a JSON response with:
- recommendations: Array of 8 objects with {title, reason (1 sentence why they'd like it), type ("movie" or "tv")}
- moodSuggestion: A short sentence suggesting what mood/vibe to explore next

Prefer titles that actually exist (real films/series, any era). Return ONLY valid JSON, no markdown.`;

  try {
    const content = await chatComplete({
      messages: [
        {
          role: "system",
          content:
            "You are a recommendation engine for a streaming platform. Respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 3000, // reasoning models emit thinking tokens before the JSON payload
      temperature: 0.8,
    });

    const parsed = extractJsonObject(content);
    if (!parsed) throw new Error("Model returned no parseable JSON");

    // Ground each suggestion against TMDB — keep only verifiable titles,
    // enriched with real ids/posters/years (max 6 kept from 8 candidates).
    const candidates: any[] = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 8)
      : [];
    const verified = await Promise.all(
      candidates.map(async (rec) => {
        const title = String(rec?.title || "").slice(0, 200);
        if (!title) return null;
        const tmdb = await tmdbVerifyTitle(title);
        if (!tmdb) return null;
        return {
          title: tmdb.name,
          reason: String(rec?.reason || "").slice(0, 300),
          type: tmdb.type,
          id: tmdb.id,
          year: tmdb.year,
          posterPath: tmdb.posterPath,
        };
      }),
    );

    return {
      recommendations: verified.filter(Boolean).slice(0, 6) as any[],
      moodSuggestion:
        String(parsed.moodSuggestion || "").slice(0, 300) ||
        "Explore something new today!",
    };
  } catch {
    return {
      recommendations: [],
      moodSuggestion: "Explore something new today!",
    };
  }
}

/**
 * Weekly digest: a short, personal recap of what the viewer watched plus a
 * nudge for the weekend. Powered by the same gateway model; falls back to a
 * deterministic summary when the AI layer is unavailable.
 */
export async function generateWeeklyDigest(viewingProfile: {
  watchedTitles: { title: string; type: string; genres: string[] }[];
  totalMinutes: number;
  topGenres: string[];
}): Promise<{
  headline: string;
  recap: string;
  pick: { title: string; reason: string } | null;
}> {
  const fallback = {
    headline: "Your week on Open Stream",
    recap: `You spent ${Math.round(viewingProfile.totalMinutes)} minutes watching ${viewingProfile.watchedTitles.length} title${viewingProfile.watchedTitles.length === 1 ? "" : "s"}${viewingProfile.topGenres.length ? `, mostly ${viewingProfile.topGenres.slice(0, 2).join(" and ")}` : ""}.`,
    pick: null as { title: string; reason: string } | null,
  };
  if (viewingProfile.watchedTitles.length === 0) return fallback;

  const prompt = `Write a short weekly viewing digest for this streamer:

Titles watched this week:
${viewingProfile.watchedTitles
  .slice(0, 10)
  .map((w) => `- "${w.title}" (${w.type}, ${w.genres.slice(0, 3).join(", ")})`)
  .join("\n")}

Total watch time: ${Math.round(viewingProfile.totalMinutes)} minutes
Top genres: ${viewingProfile.topGenres.join(", ")}

Provide a JSON response with:
- headline: a fun 4-8 word personalized headline (no quotes around it)
- recap: 2-3 sentences summarizing their week and what it says about their taste
- pick: { title, reason } — ONE real movie/series (any era) they should start this weekend, with a 1-sentence reason tied to their week. Return ONLY valid JSON, no markdown.`;

  try {
    const content = await chatComplete({
      messages: [
        {
          role: "system",
          content:
            "You are a witty but concise streaming editor writing a weekly digest. Respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 2500,
      temperature: 0.8,
    });
    const parsed = extractJsonObject(content);
    if (!parsed) return fallback;
    return {
      headline: String(parsed.headline || fallback.headline).slice(0, 80),
      recap: String(parsed.recap || fallback.recap).slice(0, 600),
      pick:
        parsed.pick && typeof parsed.pick === "object" && parsed.pick.title
          ? {
              title: String(parsed.pick.title).slice(0, 120),
              reason: String(parsed.pick.reason || "").slice(0, 300),
            }
          : null,
    };
  } catch {
    return fallback;
  }
}
