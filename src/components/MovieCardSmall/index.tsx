import { useState } from "react";
import styles from "./style.module.scss";
import Link from "next/link";
import { safeDetailHref } from "@/Utils/safeLinks";
// import { motion, AnimatePresence } from "framer-motion";
// import Skeleton from "react-loading-skeleton";

// react-lazy-load-image-component
import { LazyLoadImage } from "react-lazy-load-image-component";
import "react-lazy-load-image-component/src/effects/opacity.css";
import { TMDB_IMAGE_URL as TMDB_IMG } from "@/Utils/imageUrl";

const MovieCardSmall = ({
  data,
  media_type,
  progress,
  customHref,
  onRemove,
}: any) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imagePlaceholder, setImagePlaceholder] = useState(false);
  // Never render a dead link: if id/type are missing the card is not clickable
  // (prevents /detail?type=undefined&id=undefined dead ends).
  const link = customHref || safeDetailHref(data, media_type);
  if (!link)
    return <div className={styles.MovieCardSmall} aria-hidden="true" />;
  return (
    <Link
      key={data?.id}
      href={link}
      className={styles.MovieCardSmall}
      aria-label={data?.name || "poster"}
      data-tooltip-id="tooltip"
      data-tooltip-html={`${data?.title?.length > 30 || data?.name?.length > 30 ? data?.title || data?.name : ""}`}
    >
      {/* <img src={process.env.NEXT_PUBLIC_TMBD_IMAGE_URL + data.poster_path} alt="" /> */}
      <div
        className={`${styles.img} ${data?.poster_path !== null && data?.poster_path !== undefined ? "skeleton" : null}`}
      >
        {/* if rllic package is not available, then start using this code again, and comment/delete the rllic code */}
        {/* <AnimatePresence mode="sync">
          <motion.img
            key={data?.id}
            src={`${imagePlaceholder ? "/images/logo.svg" : data?.poster_path !== null && data?.poster_path !== undefined ? TMDB_IMG + data?.poster_path : "/images/logo.svg"}`}
            initial={{ opacity: 0 }}
            animate={{
              opacity: imageLoading ? 0 : 1,
            }}
            height="100%"
            width="100%"
            exit="exit"
            className={`${styles.img} ${imageLoading ? "skeleton" : null}`}
            onLoad={() => {
              setTimeout(() => {
                setImageLoading(false);
              }, 500);
            }}
            loading="lazy"
            onError={(e) => {
              console.log(e);
              setImagePlaceholder(true);
            }}
            alt={data?.id || "sm"}
            // style={!imageLoading ? { opacity: 1 } : { opacity: 0 }}
          />
        </AnimatePresence> */}

        {/* react-lazy-load-image-component */}
        <LazyLoadImage
          key={data?.id}
          src={`${imagePlaceholder ? "/images/logo.svg" : data?.poster_path !== null && data?.poster_path !== undefined ? TMDB_IMG + data?.poster_path : "/images/logo.svg"}`}
          height="100%"
          width="100%"
          useIntersectionObserver={true}
          effect="opacity"
          className={`${styles.img} ${imageLoading ? "skeleton" : null}`}
          onLoad={() => {
            setTimeout(() => {
              setImageLoading(false);
            }, 500);
          }}
          loading="lazy"
          onError={(e) => {
            console.log(e);
            setImagePlaceholder(true);
            setImageLoading(false);
          }}
          alt={data?.id || "sm"}
          // style={!imageLoading ? { opacity: 1 } : { opacity: 0 }}
        />
        {progress !== undefined && progress !== null && (
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        )}
      </div>
      <div className={styles.titleRow}>
        <p>{data?.title || data?.name}</p>
        {onRemove && (
          <span
            className={styles.removeBtn}
            role="button"
            aria-label="Remove from continue watching"
            onClick={(e) => {
              e.preventDefault();
              onRemove();
            }}
          >
            ✕
          </span>
        )}
      </div>
    </Link>
  );
};

export default MovieCardSmall;
