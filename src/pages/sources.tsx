import { useState, useMemo, useEffect } from "react";
import {
  BsArrowRepeat,
  BsClockHistory,
  BsCheckCircle,
  BsExclamationTriangle,
} from "react-icons/bs";
import styles from "@/styles/Sources.module.scss";
import {
  BsGlobe2,
  BsBadgeHdFill,
  BsSubscript,
  BsStarFill,
  BsServer,
  BsCollectionPlay,
  BsCameraReels,
  BsTv,
  BsEmojiFrown,
  BsCameraVideo,
  BsMusicNoteBeamed,
  BsFilePlay,
} from "react-icons/bs";
import { FaMicrophone, FaServer, FaLanguage } from "react-icons/fa";
import { RiMovie2Line, RiEye2Line } from "react-icons/ri";
import { MdOutlineAnimation } from "react-icons/md";
import { getProviderQualityTier } from "@/Utils/providers";

interface Provider {
  id: string;
  name: string;
  internalName: string;
  description: string;
  language: string;
  categories: string[];
  isDefault: boolean;
  priority: number;
  iconUrl?: string;
  repoSource: string;
  capabilities: {
    hq: boolean;
    multiLang: boolean;
    subtitle: boolean;
    dub: boolean;
    dubbedHindi: boolean;
  };
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: any; color: string }
> = {
  movie: { label: "Movies", icon: BsCameraReels, color: "#fbbf24" },
  tv: { label: "TV Series", icon: BsTv, color: "#60a5fa" },
  anime: { label: "Anime", icon: MdOutlineAnimation, color: "#f472b6" },
  cartoon: { label: "Cartoons", icon: RiEye2Line, color: "#34d399" },
  asianDrama: {
    label: "Asian Drama",
    icon: BsCollectionPlay,
    color: "#a78bfa",
  },
  live: { label: "Live TV", icon: BsCameraVideo, color: "#fb923c" },
  music: { label: "Music", icon: BsMusicNoteBeamed, color: "#f43f5e" },
  torrent: { label: "Torrents", icon: BsFilePlay, color: "#22d3ee" },
  sports: { label: "Sports", icon: RiMovie2Line, color: "#4ade80" },
};

// NOTE: "live" and "music" are intentionally not exposed as filters —
// no approved provider in the registry serves those categories.
const ALL_CATEGORIES = ["all", "movie", "tv", "anime", "cartoon", "asianDrama"];

const LANGUAGES: Record<string, string> = {
  hi: "Hindi",
  en: "English",
  bn: "Bengali",
  te: "Telugu",
  ta: "Tamil",
  de: "German",
  fr: "French",
  id: "Indonesian",
  ko: "Korean",
  zh: "Chinese",
  mx: "Spanish",
  fil: "Filipino",
  "pt-br": "Portuguese",
};

const SourcesPage = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [manifestStatus, setManifestStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // Fetch providers on mount (useEffect — this page prerenders on the server
  // during `next build`, and a bare relative fetch there throws on Node)
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await fetch("/api/providers/sources?action=list");
        if (response.ok) {
          const data = await response.json();
          setProviders(data);
        }
      } catch (err) {
        console.error("Failed to fetch providers:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, []);

  // Fetch autonomous manifest sync status
  const fetchManifestStatus = async () => {
    try {
      const response = await fetch("/api/providers/manifest?action=status", {
        cache: "no-store",
      });
      if (response.ok) setManifestStatus(await response.json());
    } catch {
      // Status is informational; keep the page functional without it.
    }
  };

  useEffect(() => {
    fetchManifestStatus();
    const interval = setInterval(fetchManifestStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await fetch("/api/providers/manifest?action=sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchManifestStatus();
    } catch {
      // Ignore sync failures; the background loop retries automatically.
    } finally {
      setSyncing(false);
    }
  };

  const formatRelative = (ts: number): string => {
    if (!ts) return "never";
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const repoStatus = manifestStatus?.repoCommits || {};
  const repoName = (id: string) => (id === "phisher" ? "Phisher" : "CSX");

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => {
      const matchesCategory =
        activeCategory === "all" ||
        (activeCategory === "live"
          ? p.categories.includes("live") || p.categories.includes("sports")
          : p.categories.includes(activeCategory));

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.language.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [providers, activeCategory, searchQuery]);

  // Group by category for "all" view
  const groupedProviders = useMemo(() => {
    if (activeCategory !== "all") return null;
    const groups: Record<string, Provider[]> = {};
    const order = ["movie", "tv", "anime", "cartoon", "asianDrama", "live"];

    for (const provider of filteredProviders) {
      for (const cat of provider.categories) {
        if (!groups[cat]) groups[cat] = [];
        if (!groups[cat].find((p) => p.id === provider.id)) {
          groups[cat].push(provider);
        }
      }
    }

    return order
      .filter((cat) => groups[cat]?.length > 0)
      .map((cat) => ({
        category: cat,
        config: CATEGORY_CONFIG[cat] || {
          label: cat,
          icon: FaServer,
          color: "#94a3b8",
        },
        providers: groups[cat].sort((a, b) => a.priority - b.priority),
      }));
  }, [filteredProviders, activeCategory]);

  const stats = useMemo(() => {
    const langSet = new Set(providers.map((p) => p.language));
    const animeCount = providers.filter((p) =>
      p.categories.includes("anime"),
    ).length;
    return {
      total: providers.length,
      languages: langSet.size,
      anime: animeCount,
    };
  }, [providers]);

  const renderSourceCard = (provider: Provider) => (
    <div
      key={provider.id}
      className={`${styles.sourceCard} ${provider.isDefault ? styles.defaultCard : ""}`}
    >
      {provider.iconUrl ? (
        <img src={provider.iconUrl} alt="" className={styles.sourceIcon} />
      ) : (
        <div className={styles.sourceIconPlaceholder}>{provider.name[0]}</div>
      )}
      <div className={styles.sourceDetails}>
        <div className={styles.sourceNameRow}>
          <h3>{provider.name}</h3>
          {provider.isDefault && (
            <span className={styles.defaultTag}>
              <BsStarFill /> Default
            </span>
          )}
        </div>
        <p className={styles.sourceDesc}>{provider.description}</p>
        <div className={styles.sourceBadges}>
          <span className={`${styles.badge} ${styles.langBadge}`}>
            <BsGlobe2 />{" "}
            {LANGUAGES[provider.language] || provider.language.toUpperCase()}
          </span>
          <span className={`${styles.badge} ${styles.qualityBadge}`}>
            <BsBadgeHdFill /> {getProviderQualityTier(provider)}
          </span>
          {provider.capabilities.subtitle && (
            <span className={`${styles.badge} ${styles.subBadge}`}>
              <BsSubscript /> SUB
            </span>
          )}
          {provider.capabilities.dub && (
            <span className={`${styles.badge} ${styles.dubBadge}`}>
              <FaMicrophone /> DUB
            </span>
          )}
          {provider.capabilities.dubbedHindi && (
            <span className={`${styles.badge} ${styles.hindiBadge}`}>
              <FaLanguage /> Hindi
            </span>
          )}
          <span className={`${styles.badge} ${styles.repoBadge}`}>
            <FaServer /> {provider.repoSource.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.sourcesPage}>
      <div className={styles.sourcesHeader}>
        <h1>
          <span>{stats.total || ""}</span> Active Sources
        </h1>
        <p>
          The approved source lineup from Phisher &amp; CSX repos. Open Stream
          automatically selects the fastest working source and switches if one
          fails.
        </p>

        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <BsServer className={styles.statIcon} />
            <span className={styles.statNumber}>{stats.total}</span> Sources
          </div>
          <div className={styles.statItem}>
            <BsGlobe2 className={styles.statIcon} />
            <span className={styles.statNumber}>{stats.languages}</span>{" "}
            Languages
          </div>
          <div className={styles.statItem}>
            <MdOutlineAnimation className={styles.statIcon} />
            <span className={styles.statNumber}>{stats.anime}</span> Anime
            Sources
          </div>
        </div>

        {/* Autonomous sync status */}
        <div
          style={{
            marginTop: "1.2rem",
            padding: "0.9rem 1.2rem",
            borderRadius: "0.8rem",
            border: "1px solid var(--bg-gradient)",
            background: "var(--bg-gradient)",
            textAlign: "left",
            maxWidth: "640px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontWeight: 600,
                color: "var(--primary-3)",
                fontSize: "0.85rem",
              }}
            >
              <BsArrowRepeat
                style={{ color: "var(--ascent-color)", fontSize: "1rem" }}
              />{" "}
              Autonomous Provider Sync
              {manifestStatus?.fresh ? (
                <BsCheckCircle style={{ color: "#34d399" }} />
              ) : (
                <BsExclamationTriangle style={{ color: "#fbbf24" }} />
              )}
            </span>
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              style={{
                background: syncing ? "var(--bg-color)" : "var(--ascent-color)",
                color: "var(--primary-1)",
                border: "none",
                borderRadius: "0.4rem",
                padding: "0.35rem 0.9rem",
                cursor: syncing ? "wait" : "pointer",
                fontWeight: 600,
                fontSize: "0.8rem",
                fontFamily: "sans-serif",
              }}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: "1.2rem",
              flexWrap: "wrap",
              marginTop: "0.6rem",
              fontSize: "0.78rem",
              color: "var(--primary-2)",
              fontFamily: "sans-serif",
            }}
          >
            <span
              style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
            >
              <BsClockHistory /> Last sync{" "}
              {formatRelative(manifestStatus?.builtAt || 0)}
            </span>
            <span>
              {manifestStatus?.providerCount ?? 0} providers ·{" "}
              {manifestStatus?.domainCount ?? 0} domains discovered ·{" "}
              {manifestStatus?.apiEndpointCount ?? 0} patterns
            </span>
            <span>
              {Object.keys(repoStatus).length > 0
                ? Object.keys(repoStatus)
                    .map(
                      (id) =>
                        `${repoName(id)} ${repoStatus[id]?.hash?.slice(0, 7) || "?"}`,
                    )
                    .join(" · ")
                : "watching repo commit feeds…"}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Search sources by name, language, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: "500px",
            padding: "0.6rem 1rem",
            border: "1px solid var(--bg-gradient)",
            borderRadius: "2rem",
            background: "var(--bg-gradient)",
            color: "var(--primary-3)",
            fontSize: "0.85rem",
            fontFamily: "sans-serif",
            outline: "none",
            textAlign: "center",
          }}
        />
      </div>

      {/* Category Filters */}
      <div className={styles.filterBar}>
        {ALL_CATEGORIES.map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const Icon = config?.icon || FaServer;
          return (
            <button
              key={cat}
              className={`${styles.filterBtn} ${activeCategory === cat ? styles.active : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat === "all" ? (
                <>
                  <FaServer /> All
                </>
              ) : (
                <>
                  <Icon /> {config?.label || cat}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className={styles.noResults}>
          <p>Loading sources...</p>
        </div>
      )}

      {/* Grouped view (All) */}
      {!loading && groupedProviders && (
        <>
          {groupedProviders.map(({ category, config, providers }) => {
            const Icon = config.icon;
            return (
              <div key={category} className={styles.categorySection}>
                <div className={styles.categoryHeader}>
                  <Icon
                    className={styles.catIcon}
                    style={{ color: config.color }}
                  />
                  <h2>{config.label}</h2>
                  <span className={styles.catCount}>
                    {providers.length} sources
                  </span>
                </div>
                <div className={styles.sourcesGrid}>
                  {providers.map(renderSourceCard)}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Filtered view (specific category) */}
      {!loading && !groupedProviders && (
        <>
          {filteredProviders.length === 0 ? (
            <div className={styles.noResults}>
              <BsEmojiFrown
                style={{
                  fontSize: "2rem",
                  marginBottom: "0.5rem",
                  opacity: 0.5,
                }}
              />
              <h3>No sources found</h3>
              <p>Try a different category or search query</p>
            </div>
          ) : (
            <div className={styles.sourcesGrid}>
              {filteredProviders.map(renderSourceCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SourcesPage;
