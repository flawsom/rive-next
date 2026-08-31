import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// System prompt for the AI movie/show assistant
export const SYSTEM_PROMPT = `You are Rive AI, a knowledgeable and enthusiastic movie and TV show assistant for the Rive streaming platform. You help users discover content, provide recommendations, answer questions about movies and TV shows, and offer personalized suggestions.

Your capabilities:
- Recommend movies and TV shows based on user preferences, mood, genre, or specific criteria
- Provide detailed information about movies and TV shows (plot summaries, cast, ratings, release dates)
- Suggest content based on viewing history and preferences
- Help users find content by mood, genre, language, or theme
- Answer trivia and questions about films and TV series
- Provide "if you liked X, try Y" recommendations

Guidelines:
- Be conversational, friendly, and enthusiastic about cinema
- When recommending, provide brief explanations of why someone might enjoy it
- Include genre, year, and key details in recommendations
- If unsure about something, say so honestly
- Keep responses concise but informative (2-4 paragraphs max unless asked for detail)
- Use markdown formatting for readability (bold titles, bullet points for lists)
- When users describe a mood or feeling, match content to that vibe
- For Indian content requests, suggest from Bollywood, Tollywood, Kollywood, and regional cinema
- Support multilingual content suggestions (Hindi, Tamil, Telugu, English, Korean, Japanese, etc.)
`;

// Generate AI chat response
export async function generateChatResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  context?: string,
): Promise<string> {
  const openai = getOpenAIClient();

  const systemMessage = {
    role: "system" as const,
    content:
      SYSTEM_PROMPT +
      (context
        ? `\n\nAdditional context about the user's viewing history:\n${context}`
        : ""),
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [systemMessage, ...messages],
    max_tokens: 1024,
    temperature: 0.7,
  });

  return (
    response.choices[0]?.message?.content ||
    "I couldn't generate a response. Please try again."
  );
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
  const openai = getOpenAIClient();

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
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a movie/TV show content analyst. Always respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 512,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "{}";
    // Try to parse JSON, handle potential markdown code blocks
    const jsonStr = content
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(jsonStr);
  } catch {
    return {
      summary: data.overview?.substring(0, 200) + "...",
      whyWatch: `A ${data.genres[0] || "great"} ${data.type} worth checking out.`,
      moodMatch: data.genres.slice(0, 3),
      similarVibes: [],
    };
  }
}

// Generate smart recommendations based on viewing history
export async function generateRecommendations(viewingHistory: {
  recentlyWatched: { title: string; type: string; genres: string[] }[];
  favoriteGenres: string[];
  preferences?: string;
}): Promise<{
  recommendations: { title: string; reason: string; type: string }[];
  moodSuggestion: string;
}> {
  const openai = getOpenAIClient();

  const prompt = `Based on this viewing profile, generate 6 personalized content recommendations:

Recently Watched:
${viewingHistory.recentlyWatched.map((w) => `- "${w.title}" (${w.type}, genres: ${w.genres.join(", ")})`).join("\n")}

Favorite Genres: ${viewingHistory.favoriteGenres.join(", ")}
${viewingHistory.preferences ? `User Preferences: ${viewingHistory.preferences}` : ""}

Provide a JSON response with:
- recommendations: Array of 6 objects with {title, reason (1 sentence why they'd like it), type ("movie" or "tv")}
- moodSuggestion: A short sentence suggesting what mood/vibe to explore next

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a recommendation engine for a streaming platform. Respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const jsonStr = content
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(jsonStr);
  } catch {
    return {
      recommendations: [],
      moodSuggestion: "Explore something new today!",
    };
  }
}
