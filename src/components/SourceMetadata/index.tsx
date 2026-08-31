import { useState } from "react";
import styles from "./style.module.scss";
import { motion } from "framer-motion";
import {
  BsBadgeHdFill,
  BsSubscript,
  BsGlobe2,
  BsShieldCheck,
  BsArrowRepeat,
  BsFillPlayCircleFill,
} from "react-icons/bs";
import { FaLanguage, FaMicrophone, FaServer } from "react-icons/fa";

interface SourceMetadataProps {
  providerName: string;
  providerIcon?: string;
  quality?: string;
  language?: string;
  subtitle?: boolean;
  dub?: boolean;
  dubbedHindi?: boolean;
  latency?: number;
  isAutoSwitched?: boolean;
  previousProvider?: string;
  className?: string;
}

const SourceMetadata = ({
  providerName,
  providerIcon,
  quality = "HD",
  language = "Hindi/English",
  subtitle = true,
  dub = true,
  dubbedHindi = false,
  latency,
  isAutoSwitched = false,
  previousProvider,
  className,
}: SourceMetadataProps) => {
  const [expanded, setExpanded] = useState(false);

  const getLatencyColor = (ms: number) => {
    if (ms < 200) return "#4ade80";
    if (ms < 500) return "#fbbf24";
    return "#f87171";
  };

  return (
    <motion.div
      className={`${styles.sourceMetadata} ${className || ""}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={styles.metadataBar}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className={styles.metadataLeft}>
          {providerIcon ? (
            <img src={providerIcon} alt="" className={styles.providerIcon} />
          ) : (
            <div className={styles.providerIconPlaceholder}>
              {providerName[0]}
            </div>
          )}
          <div className={styles.metadataInfo}>
            <span className={styles.providerName}>
              <FaServer /> {providerName}
            </span>
            <div className={styles.metadataBadges}>
              <span className={styles.qualityBadge}>
                <BsBadgeHdFill /> {quality}
              </span>
              <span className={styles.langBadge}>
                <BsGlobe2 /> {language}
              </span>
              {subtitle && (
                <span className={styles.subBadge}>
                  <BsSubscript /> SUB
                </span>
              )}
              {dub && (
                <span className={styles.dubBadge}>
                  <FaMicrophone /> DUB
                </span>
              )}
              {dubbedHindi && (
                <span className={styles.hindiBadge}>
                  <FaLanguage /> Hindi
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.metadataRight}>
          {latency !== undefined && latency < Infinity && (
            <span
              className={styles.latency}
              style={{ color: getLatencyColor(latency) }}
            >
              {latency}ms
            </span>
          )}
          {isAutoSwitched && (
            <span className={styles.autoSwitchTag}>
              <BsArrowRepeat /> Auto-switched
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <motion.div
          className={styles.metadataExpanded}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              <FaServer /> Source
            </span>
            <span className={styles.detailValue}>{providerName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              <BsBadgeHdFill /> Quality
            </span>
            <span className={styles.detailValue}>{quality}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              <BsGlobe2 /> Language
            </span>
            <span className={styles.detailValue}>{language}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              <BsSubscript /> Subtitles
            </span>
            <span className={styles.detailValue}>
              {subtitle ? "Available" : "Not Available"}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              <FaMicrophone /> Dub
            </span>
            <span className={styles.detailValue}>
              {dub ? "Available" : "Not Available"}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>
              <FaLanguage /> Hindi Dubbed
            </span>
            <span className={styles.detailValue}>
              {dubbedHindi ? "Available" : "Not Available"}
            </span>
          </div>
          {latency !== undefined && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>
                <BsShieldCheck /> Latency
              </span>
              <span
                className={styles.detailValue}
                style={{ color: getLatencyColor(latency) }}
              >
                {latency < Infinity ? `${latency}ms` : "N/A"}
              </span>
            </div>
          )}
          {isAutoSwitched && previousProvider && (
            <div className={styles.autoSwitchInfo}>
              <BsArrowRepeat />
              <span>
                Automatically switched from <strong>{previousProvider}</strong>{" "}
                due to unavailability
              </span>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default SourceMetadata;
