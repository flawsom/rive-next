import { useState, useEffect } from "react";
import styles from "./style.module.scss";
import { BsStars, BsBadgeHdFill, BsGlobe2, BsSubscript } from "react-icons/bs";
import {
  FaThumbsUp,
  FaTheaterMasks,
  FaServer,
  FaMicrophone,
} from "react-icons/fa";
import Skeleton from "react-loading-skeleton";
import { motion } from "framer-motion";

interface AIInsightsProps {
  title: string;
  type: string;
  overview: string;
  genres: string[];
  rating?: number;
  year?: string;
  cast?: string[];
}

interface Insights {
  summary: string;
  whyWatch: string;
  moodMatch: string[];
  similarVibes: string[];
  source?: {
    provider: {
      id: string;
      name: string;
      description: string;
      language: string;
      capabilities: {
        hq: boolean;
        multiLang: boolean;
        subtitle: boolean;
        dub: boolean;
        dubbedHindi: boolean;
      };
      iconUrl?: string;
    };
    latency: number;
    alternativesCount: number;
  };
}

const AIInsights = ({
  title,
  type,
  overview,
  genres,
  rating,
  year,
  cast,
}: AIInsightsProps) => {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError(false);
        const response = await fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            type,
            overview,
            genres,
            rating,
            year,
            cast,
          }),
        });

        if (!response.ok) throw new Error("Failed to fetch insights");

        const data = await response.json();
        setInsights(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (title) fetchInsights();
  }, [title, type, overview, genres, rating, year, cast]);

  if (loading) {
    return (
      <div className={styles.aiInsights}>
        <div className={styles.aiInsightsHeader}>
          <BsStars className={styles.sparkleIcon} />
          <h3>AI Insights</h3>
        </div>
        <div className={styles.loadingSkeleton}>
          <Skeleton count={3} />
        </div>
      </div>
    );
  }

  if (error || !insights) return null;

  return (
    <div className={styles.aiInsights}>
      <div className={styles.aiInsightsHeader}>
        <BsStars className={styles.sparkleIcon} />
        <h3>AI Insights</h3>
      </div>

      {insights.source && (
        <motion.div
          className={styles.sourceCard}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.sourceCardHeader}>
            <FaServer className={styles.sourceIcon} />
            <span className={styles.sourceLabel}>Best Source</span>
          </div>
          <div className={styles.sourceCardContent}>
            <div className={styles.sourceInfo}>
              <strong>{insights.source.provider.name}</strong>
              <span className={styles.sourceDesc}>
                {insights.source.provider.description}
              </span>
            </div>
            <div className={styles.sourceBadges}>
              <span className={styles.langBadge}>
                <BsGlobe2 /> {insights.source.provider.language.toUpperCase()}
              </span>
              {insights.source.provider.capabilities.hq && (
                <span className={styles.qualityBadge}>
                  <BsBadgeHdFill /> HD
                </span>
              )}
              {insights.source.provider.capabilities.subtitle && (
                <span className={styles.subBadge}>
                  <BsSubscript /> SUB
                </span>
              )}
              {insights.source.provider.capabilities.dub && (
                <span className={styles.dubBadge}>
                  <FaMicrophone /> DUB
                </span>
              )}
            </div>
            {insights.source.latency < Infinity && (
              <span className={styles.latencyInfo}>
                {insights.source.latency}ms &middot;{" "}
                {insights.source.alternativesCount} alternatives
              </span>
            )}
          </div>
        </motion.div>
      )}

      {insights.summary && (
        <div className={styles.insightSection}>
          <p className={styles.summary}>{insights.summary}</p>
        </div>
      )}

      {insights.whyWatch && (
        <div className={styles.insightSection}>
          <div className={styles.sectionLabel}>
            <FaThumbsUp /> Why Watch
          </div>
          <p>{insights.whyWatch}</p>
        </div>
      )}

      {insights.moodMatch?.length > 0 && (
        <div className={styles.insightSection}>
          <div className={styles.sectionLabel}>
            <FaTheaterMasks /> Mood
          </div>
          <div className={styles.moodTags}>
            {insights.moodMatch.map((mood, i) => (
              <span key={i} className={styles.moodTag}>
                {mood}
              </span>
            ))}
          </div>
        </div>
      )}

      {insights.similarVibes?.length > 0 && (
        <div className={styles.insightSection}>
          <div className={styles.sectionLabel}>Similar Vibes</div>
          <div className={styles.similarList}>
            {insights.similarVibes.map((title, i) => (
              <span key={i} className={styles.similarItem}>
                {title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIInsights;
