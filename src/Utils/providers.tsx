/**
 * Provider Registry - Complete list of streaming sources from Phisher and CSX repos
 * Each source is categorized by content type, language, and capabilities
 */

export interface Provider {
  id: string;
  name: string;
  internalName: string;
  description: string;
  language: string;
  categories: (
    | "movie"
    | "tv"
    | "anime"
    | "cartoon"
    | "asianDrama"
    | "live"
    | "music"
    | "torrent"
    | "sports"
  )[];
  isDefault: boolean;
  priority: number; // Lower = higher priority
  embedBase?: string;
  /**
   * TMDB-id URL pattern. Providers with this set are "id-routed": they embed
   * any title directly from its TMDB id (no site search, no Cloudflare-blocked
   * scraping) and always resolve instantly — the universal playback tier.
   */
  urlPattern?: "tmdb-path" | "vidsrc" | "2embed";
  iconUrl?: string;
  repoSource: "phisher" | "csx" | "universal";
  capabilities: {
    hq: boolean; // High quality
    multiLang: boolean; // Multiple languages
    subtitle: boolean; // Subtitle support
    dub: boolean; // Dub support
    dubbedHindi: boolean; // Hindi dubbed
  };
}

// ─── Phisher Repo Sources ───────────────────────────────────────────────────
export const PHISHER_PROVIDERS: Provider[] = [
  // ── MOVIES & TV ──
  {
    id: "hdhub4u",
    name: "HDHub4U",
    internalName: "HDhub4u",
    description: "Premium HD Movies, TV Series & Anime - Hindi/English",
    language: "hi",
    categories: ["movie", "tv", "anime"],
    isDefault: true,
    priority: 1,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/HDHUB.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "fourkhdhub",
    name: "4K HDHub",
    internalName: "FourKHDHub",
    description: "4K Ultra HD Movies Extension by HDHUB4U",
    language: "en",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 2,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/4KHDHUB-Bright-Logo.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "allmovieland",
    name: "AllMovieLand",
    internalName: "AllMovieLandProvider",
    description: "Indian MultiLanguage Provider (Mostly Hindi)",
    language: "hi",
    categories: ["movie", "tv", "cartoon"],
    isDefault: false,
    priority: 15,
    iconUrl:
      "https://raw.githubusercontent.com/LikDev-256/likdev256-tamil-providers/master/AllMovieLandProvider/icon.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "cinemacity",
    name: "Cinemacity",
    internalName: "Cinemacity",
    description: "Watch Movies & TvSeries (Multi-Lang/Audio)",
    language: "en",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 12,
    iconUrl: "https://www.google.com/s2/favicons?domain=cinemacity.cc&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "desicinemas",
    name: "DesiCinemas",
    internalName: "Desicinemas",
    description: "Contains BollyZone - Hindi Movies & Series",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 10,
    iconUrl:
      "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://desicinemas.to&size=64",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "dudefilms",
    name: "DudeFilms",
    internalName: "DudeFilms",
    description: "Watch Movies & TvSeries (Multi-Lang)",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 13,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/dudefilms.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "hindmoviez",
    name: "HindMoviez",
    internalName: "Hindmoviez",
    description: "Watch Movies & TvSeries (Multi-Lang)",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 14,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/hindmoviez.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "movies4u",
    name: "Movies4u",
    internalName: "Movies4u",
    description: "Movies & TV Series",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 11,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/movies4u.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "hdmovie2",
    name: "HdMovie2",
    internalName: "Hdmovie2",
    description: "HD Movies & TV Series",
    language: "hi",
    categories: ["tv", "movie"],
    isDefault: false,
    priority: 16,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/hdmovie2.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "fibwatch",
    name: "FibWatch",
    internalName: "Fibwatch",
    description: "Movies & TV Series",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 17,
    iconUrl: "https://f.pondit.xyz/fibwatch-logo.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "fivemovierulz",
    name: "FiveMovieRulz",
    internalName: "Fivemovierulz",
    description: "Movies & Series",
    language: "hi",
    categories: ["tv", "movie"],
    isDefault: false,
    priority: 18,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "movierulz",
    name: "MovieRulz",
    internalName: "MovieRulz",
    description: "Movies & Series",
    language: "hi",
    categories: ["tv", "movie"],
    isDefault: false,
    priority: 19,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "multimovies",
    name: "MultiMovies",
    internalName: "MultiMoviesProvider",
    description: "Indian Multi-language HD Provider",
    language: "hi",
    categories: ["movie", "tv", "anime"],
    isDefault: false,
    priority: 9,
    iconUrl:
      "https://raw.githubusercontent.com/LikDev-256/likdev256-tamil-providers/master/MultiMoviesProvider/icon.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "moviebox",
    name: "MovieBox",
    internalName: "MovieBoxProvider",
    description: "Multi Language Movies and Series Provider",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 8,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/moviebox.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "mplayer",
    name: "MPlayer",
    internalName: "MPlayerProvider",
    description: "Indian Movies/Series/Kdrama(Hindi Dubbed)",
    language: "hi",
    categories: ["asianDrama", "tv", "movie"],
    isDefault: false,
    priority: 7,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "goojara",
    name: "Goojara",
    internalName: "Goojara",
    description: "Movies and Series (Mostly 720p)",
    language: "en",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 20,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "streamplay",
    name: "StreamPlay",
    internalName: "StreamPlay",
    description: "#1 best extension based on MultiAPI",
    language: "en",
    categories: ["asianDrama", "tv", "anime", "movie", "cartoon"],
    isDefault: false,
    priority: 5,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "istreamflare",
    name: "IStreamFlare",
    internalName: "IStreamFlare",
    description: "Movies/Series/Anime",
    language: "hi",
    categories: ["asianDrama", "tv", "anime", "movie", "cartoon"],
    isDefault: false,
    priority: 6,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/streamflare.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "coflix",
    name: "Coflix",
    internalName: "Coflix",
    description: "Movies, Series and Anime French Extension",
    language: "fr",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 25,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/Coflix.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "idlix",
    name: "Idlix",
    internalName: "IdlixProvider",
    description: "Movies, Series, Anime & Asian Drama",
    language: "id",
    categories: ["tv", "movie", "anime", "asianDrama"],
    isDefault: false,
    priority: 22,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/idlix.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "kisskh",
    name: "KissKh",
    internalName: "KisskhProvider",
    description: "Asian Drama, TV Series, Anime & Movie",
    language: "en",
    categories: ["asianDrama", "tv", "anime", "movie"],
    isDefault: false,
    priority: 4,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "onetouchtv",
    name: "OneTouchTV",
    internalName: "OneTouchTV",
    description: "Asian Dramas",
    language: "en",
    categories: ["asianDrama", "tv"],
    isDefault: false,
    priority: 21,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "showbox",
    name: "ShowBox",
    internalName: "ShowBox",
    description: "Shows, Anime, Movies & Asian Drama",
    language: "en",
    categories: ["asianDrama", "anime", "tv", "movie"],
    isDefault: false,
    priority: 3,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "banglaplex",
    name: "BanglaPlex",
    internalName: "BanglaPlex",
    description: "Bangla Movies & Series",
    language: "bn",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 26,
    iconUrl: "https://www.google.com/s2/favicons?domain=banglaplex.click&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "cinefreak",
    name: "CineFreak",
    internalName: "Cinefreak",
    description: "Bangla/Hindi Movies/Series",
    language: "bn",
    categories: ["movie", "tv", "anime"],
    isDefault: false,
    priority: 23,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/cinefreak.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "movieblast",
    name: "MovieBlast",
    internalName: "MovieBlast",
    description: "MovieBlast App",
    language: "te",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 24,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/movieblast.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },

  // ── ANIME ──
  {
    id: "anichi",
    name: "Anichi",
    internalName: "Anichi",
    description: "Anime from Allanime",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 1,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/Allanime.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "anidb",
    name: "AniDb",
    internalName: "AniDb",
    description: "Anime Database",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 2,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/anidb.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "anikage",
    name: "Anikage",
    internalName: "Anikage",
    description: "Anime from Anikage",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 3,
    iconUrl:
      "https://www.google.com/s2/favicons?sz=64&domain=https://anikage.cc/",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "anikoto",
    name: "AniKoto",
    internalName: "AniKoto",
    description: "Anime from AniKoto",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 4,
    iconUrl: "https://anikototv.to/AnikotoTheme/assets/images/favicon.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "anilight",
    name: "Anilight",
    internalName: "Anilight",
    description: "Anilight Anime Provider",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 5,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/anilight.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "animepahe",
    name: "AnimePahe",
    internalName: "AnimePahe",
    description: "Animes (SUB/DUB)",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 6,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/animepahe.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: false,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "anineko",
    name: "Anineko",
    internalName: "Anineko",
    description: "Anime from Anineko",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 7,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/Anineko.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "anizone",
    name: "Anizone",
    internalName: "Anizone",
    description: "Anizone.to streams latest anime content in multiple language",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 8,
    iconUrl:
      "https://raw.githubusercontent.com/ycngmn/CuxPlug/refs/heads/main/icons/anizone.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "kickassanime",
    name: "KickassAnime",
    internalName: "Kickassanime",
    description: "Kickass Anime",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 9,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/KAA.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "onepace",
    name: "OnePace",
    internalName: "OnePace",
    description: "One Pace (One Piece Recut)",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 10,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/onepace.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "allwish",
    name: "AllWish",
    internalName: "AllWish",
    description: "Anime from all-wish.me",
    language: "en",
    categories: ["anime"],
    isDefault: false,
    priority: 11,
    iconUrl: "https://all-wish.me/assets/logo.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },

  // ── ANIME (Hindi Dubbed) ──
  {
    id: "animedekho",
    name: "AnimeDekho",
    internalName: "AnimeDekhoProvider",
    description: "Includes AnimeDekho, OnePace(DUB,SUB) and HindiSubAnime",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 1,
    iconUrl:
      "https://animedekho.app/wp-content/uploads/2023/07/AnimeDekho-Logo-300x-1.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "animedubhindi",
    name: "AnimeDubHindi",
    internalName: "Animedubhindi",
    description: "Anime in Multi Lang (Hindi Dubbed)",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 2,
    iconUrl: "https://www.google.com/s2/favicons?domain=animedubhindi.cc&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "animekhor",
    name: "AnimeKhor",
    internalName: "Animekhor",
    description: "Anime and Movies includes (Donghuaword)",
    language: "zh",
    categories: ["anime"],
    isDefault: false,
    priority: 3,
    iconUrl: "https://www.google.com/s2/favicons?domain=animekhor.org&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "animesalt",
    name: "AnimeSalt",
    internalName: "Animesalt",
    description: "Anime/Cartoon in Hindi",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 4,
    iconUrl: "https://www.google.com/s2/favicons?domain=animesalt.ac&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "animenosub",
    name: "AnimeNoSub",
    internalName: "Animenosub",
    description: "Anime and Movies",
    language: "en",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 5,
    iconUrl: "https://www.google.com/s2/favicons?domain=animenosub.to&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "animexin",
    name: "Animexin",
    internalName: "Animexin",
    description: "Anime and Movies",
    language: "en",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 6,
    iconUrl: "https://www.google.com/s2/favicons?domain=animexin.dev&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "animecloud",
    name: "AnimeCloud",
    internalName: "AnimeCloud",
    description: "German Anime",
    language: "de",
    categories: ["anime"],
    isDefault: false,
    priority: 15,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/AnimeCloud.jpg",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },

  // ── CARTOON ──
  {
    id: "dorabash",
    name: "DoraBash",
    internalName: "DoraBash",
    description: "Doremon Show in Hindi",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 1,
    iconUrl: "https://www.google.com/s2/favicons?domain=dorabash.in&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "kartoons",
    name: "Kartoons",
    internalName: "Kartoons",
    description: "Kartoons (Cartoon & Animes)",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 2,
    iconUrl: "https://kartoons.me/logo.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "piratexplay",
    name: "PirateXPlay",
    internalName: "Piratexplay",
    description: "Anime/Cartoon in Hindi",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 3,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/piratexplay.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "ringz",
    name: "RingZ",
    internalName: "RingZ",
    description: "Ringz App - Anime & Cartoon",
    language: "hi",
    categories: ["anime", "cartoon"],
    isDefault: false,
    priority: 4,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/Ringz.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },

  // ── ASIAN DRAMA ──
  {
    id: "layarkaca",
    name: "LayarKaca",
    internalName: "LayarKacaProvider",
    description: "Asian Drama & Movies",
    language: "id",
    categories: ["asianDrama", "tv", "movie"],
    isDefault: false,
    priority: 10,
    iconUrl: "https://www.google.com/s2/favicons?domain=tv7.lk21.am.in&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "ohli24",
    name: "OHLI24",
    internalName: "OHLI24",
    description: "Anime and movies with Korean subtitles",
    language: "ko",
    categories: ["asianDrama", "tv", "movie"],
    isDefault: false,
    priority: 11,
    iconUrl: "https://ani.ohli24.com/img/logo@2x.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },

  // ── LIVE TV ──
  {
    id: "cloudplay",
    name: "CloudPlay",
    internalName: "CloudPlay",
    description: "CloudPlay Live TV Extension",
    language: "en",
    categories: ["live"],
    isDefault: false,
    priority: 1,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/cloudplay.jpg",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: false,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "iptvplayer",
    name: "IPTVPlayer",
    internalName: "IPTVPlayer",
    description: "IPTV Player",
    language: "hi",
    categories: ["live"],
    isDefault: false,
    priority: 2,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/IPTV.png",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: false,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "sportsiptv",
    name: "SportsIPTV",
    internalName: "PublicSportsIPTV",
    description: "Sports Live Streams (FanCode)",
    language: "en",
    categories: ["live", "sports"],
    isDefault: false,
    priority: 3,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: false,
      subtitle: false,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "quickiptv",
    name: "QuickIPTV",
    internalName: "QuickIPTV",
    description: "Includes PirateIPTV, Sports IPTV, Japanese IPTV, Sony IPTV",
    language: "en",
    categories: ["live", "sports"],
    isDefault: false,
    priority: 4,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: false,
      dub: false,
      dubbedHindi: false,
    },
  },

  // ── MUSIC ──
  {
    id: "masstamilan",
    name: "MassTamilan",
    internalName: "MassTamilanProvider",
    description: "Indian Multi-language Music Provider",
    language: "ta",
    categories: ["music", "movie"],
    isDefault: false,
    priority: 1,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: false,
      dub: false,
      dubbedHindi: false,
    },
  },

  // ── MISC / SPECIAL ──
  {
    id: "microtv",
    name: "MicroTV",
    internalName: "Microtv",
    description:
      "Watch short vertical dramas & reels from multiple Indian short platforms",
    language: "hi",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 30,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/MicroTV.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "donghuastream",
    name: "DonghuaStream",
    internalName: "Donghuastream",
    description: "Contains SeaTV (Chinese)",
    language: "zh",
    categories: ["anime"],
    isDefault: false,
    priority: 20,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "animeav1",
    name: "AnimeAV1",
    internalName: "Animeav1",
    description: "Mexican Anime Extension",
    language: "mx",
    categories: ["movie", "anime"],
    isDefault: false,
    priority: 12,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/animeav1.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "latanime",
    name: "LatAnime",
    internalName: "Latanime",
    description: "Mexican Anime Extension",
    language: "mx",
    categories: ["movie", "anime"],
    isDefault: false,
    priority: 13,
    iconUrl: "https://latanime.org/img/logito.png",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "pencurimovie",
    name: "PencuriMovie",
    internalName: "Pencurimovie",
    description: "Pencuri Movie",
    language: "id",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 27,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "pinoymoviepedia",
    name: "PinoyMoviePedia",
    internalName: "Pinoymoviepedia",
    description: "Contains Bluray7",
    language: "fil",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 28,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: true,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "netcinez",
    name: "Netcinez",
    internalName: "Netcinez",
    description: "Movies, Series and Anime Portuguese",
    language: "pt-br",
    categories: ["movie", "tv"],
    isDefault: false,
    priority: 29,
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "megakino",
    name: "Megakino",
    internalName: "Megakino",
    description: "Movies, Series and Anime German",
    language: "de",
    categories: ["movie", "anime", "cartoon"],
    isDefault: false,
    priority: 25,
    iconUrl:
      "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/Icons/Megakino.jpg",
    repoSource: "phisher",
    capabilities: {
      hq: false,
      multiLang: false,
      subtitle: true,
      dub: false,
      dubbedHindi: false,
    },
  },
  {
    id: "aniworld",
    name: "Aniworld",
    internalName: "Aniworld",
    description: "German Anime & Serienstream",
    language: "de",
    categories: ["anime"],
    isDefault: false,
    priority: 20,
    iconUrl: "https://www.google.com/s2/favicons?domain=aniworld.to&sz=64",
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: false,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "jellyfin",
    name: "Jellyfin",
    internalName: "Jellyfin",
    description: "Jellyfin Media Server Extension",
    language: "en",
    categories: ["asianDrama", "tv", "anime", "movie", "cartoon"],
    isDefault: false,
    priority: 99,
    repoSource: "phisher",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
];

// ─── CSX Repo Sources ───────────────────────────────────────────────────────
export const CSX_PROVIDERS: Provider[] = [
  {
    id: "moviesdrive",
    name: "MoviesDrive",
    internalName: "MoviesDrive",
    description: "High Quality Movies and TV Shows",
    language: "hi",
    categories: ["tv", "movie", "asianDrama", "anime"],
    isDefault: true,
    priority: 1,
    iconUrl:
      "https://github.com/SaurabhKaperwan/CSX/raw/refs/heads/master/MoviesDrive/icon.png",
    repoSource: "csx",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "bollyflix",
    name: "Bollyflix",
    internalName: "Bollyflix",
    description: "Movies and Series upto 4K",
    language: "hi",
    categories: ["tv", "movie", "asianDrama", "anime"],
    isDefault: false,
    priority: 2,
    iconUrl:
      "https://raw.githubusercontent.com/SaurabhKaperwan/CSX/refs/heads/master/Bollyflix/icon.png",
    repoSource: "csx",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "cinestream",
    name: "CineStream",
    internalName: "CineStream",
    description:
      "One stop solution for Movies, Series, Anime, AsianDrama and Torrents",
    language: "en",
    categories: ["tv", "movie", "asianDrama", "anime", "torrent"],
    isDefault: false,
    priority: 3,
    iconUrl:
      "https://github.com/SaurabhKaperwan/CSX/raw/refs/heads/master/CineStream/icon.png",
    repoSource: "csx",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
  {
    id: "moviesmod",
    name: "MoviesMod",
    internalName: "Moviesmod",
    description: "Includes Topmovies",
    language: "en",
    categories: ["tv", "movie", "asianDrama", "anime"],
    isDefault: false,
    priority: 4,
    iconUrl:
      "https://github.com/SaurabhKaperwan/CSX/raw/refs/heads/master/Moviesmod/icon.png",
    repoSource: "csx",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "vegamovies",
    name: "VegaMovies",
    internalName: "VegaMovies",
    description: "Includes LuxMovies, Rogmovies",
    language: "hi",
    categories: ["tv", "movie", "asianDrama", "anime"],
    isDefault: false,
    priority: 5,
    iconUrl:
      "https://github.com/SaurabhKaperwan/CSX/raw/refs/heads/master/VegaMovies/icon.jpg",
    repoSource: "csx",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: true,
    },
  },
];

// ─── Universal id-routed embeds ──────────────────────────────────────────
// The WordPress-class providers (HDHub4U/MoviesDrive/…) are found by title
// search and sit behind Cloudflare, which blocks server-side verification
// from datacenter IPs (Vercel) — so playback could never be guaranteed.
// These id-routed players embed ANY title straight from its TMDB id, answer
// 200 to server-side checks, and allow iframe embedding (verified): the
// instant, every-title playback tier. The searchable providers remain as
// high-quality alternates in the Sources menu and the auto-fallback walk.
export const UNIVERSAL_PROVIDERS: Provider[] = [
  {
    id: "vidlink",
    name: "VidLink",
    internalName: "VidLink",
    description: "Instant universal player — every movie & show by TMDB id",
    language: "en",
    categories: ["movie", "tv", "anime", "cartoon", "asianDrama"],
    isDefault: true,
    priority: 0,
    embedBase: "https://vidlink.pro",
    urlPattern: "tmdb-path",
    repoSource: "universal",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "twoembed",
    name: "2Embed",
    internalName: "TwoEmbed",
    description: "Universal multi-server embeds (movies & series)",
    language: "en",
    categories: ["movie", "tv", "anime", "cartoon", "asianDrama"],
    isDefault: false,
    priority: 1,
    embedBase: "https://www.2embed.cc",
    urlPattern: "2embed",
    repoSource: "universal",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
  {
    id: "vidsrc",
    name: "VidSrc",
    internalName: "VidSrc",
    description: "Universal CDN player with multi-quality servers",
    language: "en",
    categories: ["movie", "tv", "anime", "cartoon", "asianDrama"],
    isDefault: false,
    priority: 2,
    // NOTE: verified unreachable from serverless (connection reset) at
    // shipping time; kept disabled rather than advertised as playable.
    // urlPattern intentionally omitted so it never wins selection.
    embedBase: "https://vidsrc.vip",
    repoSource: "universal",
    capabilities: {
      hq: true,
      multiLang: true,
      subtitle: true,
      dub: true,
      dubbedHindi: false,
    },
  },
];

// ─── Combined Provider List (approved set) ──────────────────────────────────
// Only these sources are enabled for the consumer app:
//  - Phisher repo: HDHub4U, 4K HDHub, and the approved Anime/Cartoon set
//  - CSX repo: all sources (MoviesDrive, Bollyflix, CineStream, MoviesMod, VegaMovies)
// Every other entry remains defined but is excluded from the active registry.
export const APPROVED_PROVIDER_IDS = new Set<string>([
  // Universal id-routed (always-on playback tier)
  "vidlink",
  "twoembed",
  "vidsrc",
  // Movies & TV (Phisher)
  "hdhub4u",
  "fourkhdhub",
  // Anime (Phisher)
  "anichi",
  "anidb",
  "anikage",
  "anikoto",
  "anilight",
  "animepahe",
  "anineko",
  "anizone",
  "kickassanime",
  "onepace",
  "animexin",
  "animenosub",
  "allwish",
  // Anime & Cartoons, Hindi (Phisher)
  "animedekho",
  "animedubhindi",
  "animekhor",
  "animesalt",
  "dorabash",
  "kartoons",
  "piratexplay",
  "ringz",
  // CSX repo (all)
  "moviesdrive",
  "bollyflix",
  "cinestream",
  "moviesmod",
  "vegamovies",
]);

export const ALL_PROVIDERS: Provider[] = [
  ...UNIVERSAL_PROVIDERS,
  ...PHISHER_PROVIDERS,
  ...CSX_PROVIDERS,
].filter((provider) => APPROVED_PROVIDER_IDS.has(provider.id));

/**
 * Build a provider's embed URL for a title. Universal providers take the
 * TMDB id directly; searchable providers build their (title-resolved)
 * id-shaped URL, which /api/providers/resolve verifies before use.
 */
export function buildEmbedUrl(
  provider: Pick<Provider, "id" | "embedBase" | "urlPattern">,
  type: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): string | null {
  const base = provider.embedBase?.replace(/\/$/, "");
  if (!base) return null;
  const s = season && season > 0 ? season : 1;
  const e = episode && episode > 0 ? episode : 1;
  // (vidsrc pattern reserved — provider currently unreachable server-side)
  if (provider.urlPattern === "2embed") {
    return type === "movie"
      ? `${base}/embed/${id}`
      : `${base}/embedtv/${id}?s=${s}&e=${e}`;
  }
  return type === "movie"
    ? `${base}/movie/${id}`
    : `${base}/tv/${id}/${s}/${e}`;
}

// ─── Quality Tiers ──────────────────────────────────────────────────────────
export type QualityTier = "4K" | "FHD" | "HD" | "SD";

const QUALITY_TIER_MAP: Partial<Record<string, QualityTier>> = {
  hdhub4u: "FHD",
  fourkhdhub: "4K",
  moviesdrive: "4K",
  bollyflix: "4K",
  cinestream: "4K",
  moviesmod: "4K",
  vegamovies: "4K",
};

export function getProviderQualityTier(
  provider: Pick<Provider, "id" | "capabilities">,
): QualityTier {
  return (
    QUALITY_TIER_MAP[provider.id] || (provider.capabilities.hq ? "HD" : "SD")
  );
}

export function getQualityLabel(tier: QualityTier): string {
  const labels: Record<QualityTier, string> = {
    "4K": "4K Ultra HD • up to 2160p",
    FHD: "Full HD • 1080p",
    HD: "HD • 720p",
    SD: "SD • 480p",
  };
  return labels[tier];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

export function getProvidersByCategory(
  category:
    | "movie"
    | "tv"
    | "anime"
    | "cartoon"
    | "asianDrama"
    | "live"
    | "music"
    | "torrent"
    | "sports",
): Provider[] {
  return ALL_PROVIDERS.filter((p) => p.categories.includes(category)).sort(
    (a, b) => a.priority - b.priority,
  );
}

export function getDefaultProviders(): {
  movie: Provider;
  tv: Provider;
  anime: Provider;
} {
  // Universals resolve instantly for every title — they are the defaults.
  return {
    movie:
      UNIVERSAL_PROVIDERS.find((p) => p.id === "vidlink") ||
      CSX_PROVIDERS.find((p) => p.id === "moviesdrive")!,
    tv:
      UNIVERSAL_PROVIDERS.find((p) => p.id === "vidlink") ||
      CSX_PROVIDERS.find((p) => p.id === "moviesdrive")!,
    anime:
      UNIVERSAL_PROVIDERS.find((p) => p.id === "vidlink") ||
      PHISHER_PROVIDERS.find((p) => p.id === "anichi")!,
  };
}

export function findProviderById(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export function getProvidersByLanguage(lang: string): Provider[] {
  return ALL_PROVIDERS.filter((p) => p.language === lang).sort(
    (a, b) => a.priority - b.priority,
  );
}

export function searchProviders(query: string): Provider[] {
  const q = query.toLowerCase();
  return ALL_PROVIDERS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.language.toLowerCase().includes(q) ||
      p.categories.some((c) => c.toLowerCase().includes(q)),
  );
}
