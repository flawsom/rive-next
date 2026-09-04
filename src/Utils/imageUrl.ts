// Central TMDB image base. Some deployments may miss this env var (it's easy
// to do — the name is close to NEXT_PUBLIC_TMDB_API_KEY); the fallback keeps
// every poster/backdrop/still alive instead of rendering broken URLs.
export const TMDB_IMAGE_URL =
  process.env.NEXT_PUBLIC_TMBD_IMAGE_URL ||
  "https://image.tmdb.org/t/p/original";
