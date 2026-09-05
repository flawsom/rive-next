import { useState } from "react";
import styles from "./style.module.scss";
import Link from "next/link";
// import { motion, AnimatePresence } from "framer-motion";
// import Skeleton from "react-loading-skeleton";

// react-lazy-load-image-component
import { LazyLoadImage } from "react-lazy-load-image-component";
import "react-lazy-load-image-component/src/effects/opacity.css";
import { TMDB_IMAGE_URL } from "@/Utils/imageUrl";
import { safeDetailHref } from "@/Utils/safeLinks";
const MoviePoster = ({ data, media_type }: any) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imagePlaceholder, setImagePlaceholder] = useState(false);
  // Never emit a dead link. MoviePoster used to build `/detail?type=undefined
  // &id=…` whenever the payload lacked media_type (TMDB detail responses have
  // no media_type field, and MoviePoster is passed data only on /detail).
  const link = safeDetailHref(
    data,
    media_type || data?.media_type || data?.type,
  );
  if (!link)
    return <div className={styles.MovieCardSmall} aria-hidden="true" />;
  return (
    <Link
      href={link}
      className={styles.MovieCardSmall}
      aria-label={data?.name || "poster"}
    >
      <div
        className={`${styles.img} ${data?.poster_path !== null && data?.poster_path !== undefined ? "skeleton" : null}`}
      >
        {/* if rllic package is not available, then start using this code again, and comment/delete the rllic code */}
        {/* <AnimatePresence mode="sync">
          <motion.img
            key={data?.id}
            alt={data?.id || "sm"}
            src={`${imagePlaceholder ? "/images/logo.svg" : data?.poster_path !== null && data?.poster_path !== undefined ? TMDB_IMAGE_URL + data?.poster_path : "/images/logo.svg"}`}
            initial={{ opacity: 0 }}
            animate={{
              opacity: imageLoading ? 0 : 1,
            }}
            height="100%"
            width="100%"
            exit="exit"
            // className={`${styles.img} ${imageLoading ? "skeleton" : null}`}
            onLoad={() => {
              setImageLoading(false);
            }}
            loading="lazy"
            onError={(e) => {
              // console.log({ e });
              setImagePlaceholder(true);
            }}
            // style={!imageLoading ? { opacity: 1 } : { opacity: 0 }}
          />
        </AnimatePresence> */}

        {/* react-lazy-load-image-component */}
        <LazyLoadImage
          key={data?.id}
          alt={data?.id || "sm"}
          src={`${imagePlaceholder ? "/images/logo.svg" : data?.poster_path !== null && data?.poster_path !== undefined ? TMDB_IMAGE_URL + data?.poster_path : "/images/logo.svg"}`}
          height="100%"
          width="100%"
          useIntersectionObserver={true}
          effect="opacity"
          // className={`${styles.img} ${imageLoading ? "skeleton" : null}`}
          onLoad={() => {
            setImageLoading(false);
          }}
          loading="lazy"
          onError={(e) => {
            // console.log({ e });
            setImagePlaceholder(true);
          }}
          // style={!imageLoading ? { opacity: 1 } : { opacity: 0 }}
        />
      </div>
    </Link>
  );
};

export default MoviePoster;
