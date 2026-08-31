import { useState, useEffect, useCallback } from "react";
import styles from "./style.module.scss";
import { motion, AnimatePresence } from "framer-motion";
import {
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsArrowClockwise,
  BsWifi,
  BsWifiOff,
  BsStarFill,
  BsGlobe2,
  BsBadgeHdFill,
  BsSubscript,
} from "react-icons/bs";
import { FaBolt, FaServer, FaShieldAlt } from "react-icons/fa";
import Skeleton from "react-loading-skeleton";

interface Provider {
  id: string;
  name: string;
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

interface SourceHealth {
  providerId: string;
  latency: number;
  available: boolean;
  lastChecked: number;
  failureCount: number;
}

interface SourceSelection {
  provider: Provider;
  latency: number;
  alternatives: Provider[];
  allAvailable: SourceHealth[];
}

interface SourceSelectorProps {
  category:
    "movie" | "tv" | "anime" | "cartoon" | "asianDrama" | "live" | "music";
  onSelect: (provider: Provider) => void;
  currentProvider?: string;
  title?: string;
  type?: "movie" | "tv";
}

const SourceSelector = ({
  category,
  onSelect,
  currentProvider,
  title,
  type,
}: SourceSelectorProps) => {
  const [sources, setSources] = useState<SourceSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [healthMap, setHealthMap] = useState<Map<string, SourceHealth>>(
    new Map(),
  );

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "best", category });
      if (currentProvider) params.set("providerId", currentProvider);

      const response = await fetch(`/api/providers/sources?${params}`);
      if (!response.ok) throw new Error("Failed to fetch sources");
      const data: SourceSelection = await response.json();
      setSources(data);

      const map = new Map<string, SourceHealth>();
      data.allAvailable.forEach((h) => map.set(h.providerId, h));
      setHealthMap(map);
    } catch (err) {
      console.error("Source selection error:", err);
    } finally {
      setLoading(false);
    }
  }, [category, currentProvider]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleSelect = (provider: Provider) => {
    onSelect(provider);
  };

  const handleRefresh = () => {
    fetchSources();
  };

  const getLatencyColor = (latency: number): string => {
    if (latency < 200) return "var(--ascent-color)";
    if (latency < 500) return "#4ade80";
    if (latency < 1000) return "#fbbf24";
    return "#f87171";
  };

  const getLatencyLabel = (latency: number): string => {
    if (latency < 200) return "Excellent";
    if (latency < 500) return "Good";
    if (latency < 1000) return "Fair";
    if (latency >= Infinity) return "Timeout";
    return "Slow";
  };

  const getCapabilityBadge = (cap: string, value: boolean) => {
    if (!value) return null;
    const labels: Record<string, string> = {
      hq: "HD",
      multiLang: "Multi",
      subtitle: "SUB",
      dub: "DUB",
      dubbedHindi: "Hindi",
    };
    return (
      <span key={cap} className={styles.capBadge}>
        {cap === "hq" && <BsBadgeHdFill />}
        {cap === "subtitle" && <BsSubscript />}
        {labels[cap] || cap}
      </span>
    );
  };

  if (loading) {
    return (
      <div className={styles.sourceSelector}>
        <div className={styles.header}>
          <Skeleton width={200} height={24} />
          <Skeleton width={100} height={30} />
        </div>
        <div className={styles.sourceList}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              height={80}
              className={styles.sourceCardSkeleton}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!sources) return null;

  const allProviders = [sources.provider, ...sources.alternatives];

  return (
    <div className={styles.sourceSelector}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FaServer className={styles.headerIcon} />
          <h3>Streaming Sources</h3>
          <span className={styles.sourceCount}>
            {allProviders.length} available
          </span>
        </div>
        <button
          onClick={handleRefresh}
          className={styles.refreshBtn}
          title="Refresh sources"
        >
          <BsArrowClockwise />
        </button>
      </div>

      <div className={styles.bestSourceBanner}>
        <div className={styles.bestBadge}>
          <FaBolt /> Best Source
        </div>
        <div
          className={styles.bestSourceCard}
          onClick={() => handleSelect(sources.provider)}
          role="button"
          tabIndex={0}
        >
          <div className={styles.sourceCardLeft}>
            {sources.provider.iconUrl ? (
              <img
                src={sources.provider.iconUrl}
                alt=""
                className={styles.sourceIcon}
              />
            ) : (
              <div className={styles.sourceIconPlaceholder}>
                {sources.provider.name[0]}
              </div>
            )}
            <div className={styles.sourceInfo}>
              <div className={styles.sourceNameRow}>
                <h4>{sources.provider.name}</h4>
                {sources.provider.isDefault && (
                  <span className={styles.defaultBadge}>
                    <BsStarFill /> Default
                  </span>
                )}
              </div>
              <p className={styles.sourceDesc}>
                {sources.provider.description}
              </p>
              <div className={styles.sourceMeta}>
                <span className={styles.metaItem}>
                  <BsGlobe2 /> {sources.provider.language.toUpperCase()}
                </span>
                <span className={styles.metaItem}>
                  <FaShieldAlt /> {sources.provider.repoSource.toUpperCase()}
                </span>
                <span
                  className={styles.latencyBadge}
                  style={{ color: getLatencyColor(sources.latency) }}
                >
                  <BsWifi />{" "}
                  {sources.latency < Infinity ? `${sources.latency}ms` : "N/A"}{" "}
                  &middot; {getLatencyLabel(sources.latency)}
                </span>
              </div>
              <div className={styles.capabilities}>
                {Object.entries(sources.provider.capabilities).map(
                  ([cap, val]) => getCapabilityBadge(cap, val),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        className={styles.expandToggle}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide" : "Show"} all {sources.alternatives.length}{" "}
        alternative sources
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className={styles.altSources}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {sources.alternatives.map((provider, index) => {
              const health = healthMap.get(provider.id);
              return (
                <motion.div
                  key={provider.id}
                  className={`${styles.sourceCard} ${
                    currentProvider === provider.id ? styles.active : ""
                  }`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleSelect(provider)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.sourceCardLeft}>
                    {provider.iconUrl ? (
                      <img
                        src={provider.iconUrl}
                        alt=""
                        className={styles.sourceIconSmall}
                      />
                    ) : (
                      <div className={styles.sourceIconPlaceholderSmall}>
                        {provider.name[0]}
                      </div>
                    )}
                    <div className={styles.sourceInfoSmall}>
                      <div className={styles.sourceNameRowSmall}>
                        <h5>{provider.name}</h5>
                        {provider.isDefault && (
                          <span className={styles.defaultBadgeSmall}>
                            Default
                          </span>
                        )}
                      </div>
                      <p className={styles.sourceDescSmall}>
                        {provider.description}
                      </p>
                      <div className={styles.sourceMetaSmall}>
                        <span>
                          <BsGlobe2 /> {provider.language.toUpperCase()}
                        </span>
                        {health && health.latency < Infinity && (
                          <span
                            style={{ color: getLatencyColor(health.latency) }}
                          >
                            <BsWifi /> {health.latency}ms
                          </span>
                        )}
                        {health && !health.available && (
                          <span className={styles.unavailableTag}>
                            <BsWifiOff /> Unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.sourceCardRight}>
                    {currentProvider === provider.id && (
                      <BsCheckCircleFill className={styles.activeCheck} />
                    )}
                    {health && !health.available && (
                      <BsExclamationTriangleFill
                        className={styles.warningIcon}
                      />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SourceSelector;
