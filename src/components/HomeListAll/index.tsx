import React, { useState, useEffect } from "react";
import styles from "./style.module.scss";
import axiosFetch from "@/Utils/fetchBackend";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import MovieCardSmall from "../MovieCardSmall";
import ContinueWatchingRow from "../ContinueWatchingRow";
import Top10Row from "../Top10Row";
import LatestUploadsRow from "../LatestUploadsRow";
import { getContinueWatching } from "@/Utils/continueWatching";
import { filterForKids, PROFILE_CHANGED_EVENT } from "@/Utils/profiles";
import { TMDB_IMAGE_URL } from "@/Utils/imageUrl";
import { fetchGeo } from "@/Utils/geo";
import { useInView } from "react-intersection-observer";

const externalImageLoader = ({ src }: { src: string }) =>
  `${TMDB_IMAGE_URL}${src}`;

function shuffle(array: any) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const dummyList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HomeListAll = () => {
  const [, setProfileTick] = useState(0);
  useEffect(() => {
    const onProfileChange = () => setProfileTick((t) => t + 1);
    window.addEventListener(PROFILE_CHANGED_EVENT, onProfileChange);
    return () =>
      window.removeEventListener(PROFILE_CHANGED_EVENT, onProfileChange);
  }, []);
  const [latestMovie, setLatestMovie] = useState([]);
  const [latestTv, setLatestTv] = useState([]);
  const [latestKoreanDrama, setLatestKoreanDrama] = useState([]);
  const [popularKoreanDrama, setPopularKoreanDrama] = useState([]);
  const [latestAnime, setLatestAnime] = useState([]);
  const [popularAnime, setPopularAnime] = useState([]);
  const [popularMovie, setPopularMovie] = useState([]);
  const [popularTv, setPopularTv] = useState([]);
  // Geo-aware rows: charts scoped to the visitor's country (via server-side
  // geo detection) plus a worldwide chart that always works.
  const [geo, setGeo] = useState<{
    country: string;
    regionName?: string;
    source?: string;
  } | null>(null);
  const [regionTrending, setRegionTrending] = useState([]);
  const [regionPopularTv, setRegionPopularTv] = useState([]);
  const [worldTrending, setWorldTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  // const [continueWatching, setContinueWatching] = useState<any>();
  const [recommendations, setRecommendations] = useState([]);
  const [latestMovieRef, latestMovieInView] = useInView({
    triggerOnce: true,
  });
  const [latestTvRef, latestTvInView] = useInView({
    triggerOnce: true,
  });
  const [latestKoreanDramaRef, latestKoreanDramaInView] = useInView({
    triggerOnce: true,
  });
  const [popularKoreanDramaRef, popularKoreanDramaInView] = useInView({
    triggerOnce: true,
  });
  const [latestAnimeRef, latestAnimeInView] = useInView({
    triggerOnce: true,
  });
  const [popularAnimeRef, popularAnimeInView] = useInView({
    triggerOnce: true,
  });
  const [popularMovieRef, popularMovieInView] = useInView({
    triggerOnce: true,
  });
  const [popularTvRef, popularTvInView] = useInView({
    triggerOnce: true,
  });
  const [regionTrendingRef, regionTrendingInView] = useInView({
    triggerOnce: true,
  });
  const [regionPopularTvRef, regionPopularTvInView] = useInView({
    triggerOnce: true,
  });
  const [worldTrendingRef, worldTrendingInView] = useInView({
    triggerOnce: true,
  });

  // Resolve the visitor's country once; rows below re-fetch when it lands.
  useEffect(() => {
    fetchGeo().then((info) =>
      setGeo({ country: info.country, regionName: info.regionName }),
    );
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // const lM = await axiosFetch({ requestID: "trendingMovie" });
        // const lT = await axiosFetch({ requestID: "trendingTvDay" });
        // const pM = await axiosFetch({
        //   requestID: "popularMovie",
        //   sortBy: "vote_average.asc",
        // });
        // const pT = await axiosFetch({
        //   requestID: "trendingTv",
        //   sortBy: "vote_average.asc",
        // });
        // setLatestMovie(lM.results);
        // setLatestTv(lT.results);
        // setPopularMovie(pM.results);
        // setPopularTv(pT.results);
        // console.log({ pM });

        const continueWatching = await getContinueWatching();
        const asyncFunc = async () => {
          let arr: any[] = [];
          let i = 0;
          if (
            continueWatching &&
            (continueWatching?.tv?.length > 0 ||
              continueWatching?.movie?.length > 0)
          ) {
            for (const ele of continueWatching?.tv) {
              if (i < 5) {
                const res = await axiosFetch({
                  requestID: "tvRelated",
                  id: String(ele),
                });
                arr.push(res?.results);
                i++;
              }
            }
            for (const ele of continueWatching?.movie) {
              if (i < 10) {
                const res = await axiosFetch({
                  requestID: "movieRelated",
                  id: String(ele),
                });
                arr.push(res?.results);
                i++;
              }
            }
          }
          return arr;
        };
        asyncFunc().then((arr) => {
          const shuffledArray = shuffle(arr.flat(Infinity));
          const uniqueArray: any = [];
          const usedIds = new Set();

          shuffledArray.forEach((item: any) => {
            if (!usedIds.has(item.id)) {
              uniqueArray.push(item);
              usedIds.add(item.id);
            }
          });
          // console.log({ uniqueArray });
          const shuffledUniqueArray = shuffle(uniqueArray);
          // console.log({ shuffledArray });
          setRecommendations(shuffledUniqueArray);
        });

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const lM = await axiosFetch({ requestID: "trendingMovie" });
        setLatestMovie(lM.results);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    if (latestMovieInView) fetchData();
  }, [latestMovieInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const lT = await axiosFetch({ requestID: "trendingTvDay" });
        setLatestTv(lT.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (latestTvInView) fetchData();
  }, [latestTvInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const lT = await axiosFetch({
          requestID: "withKeywordsTv",
          sortBy: "first_air_date.desc",
          genreKeywords: ",",
          // genreKeywords: "9840,293016,",
          country: "KR",
        });
        setLatestKoreanDrama(lT.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (latestKoreanDramaInView) fetchData();
  }, [latestKoreanDramaInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const lT = await axiosFetch({
          requestID: "withKeywordsTv",
          sortBy: "vote_count.desc",
          genreKeywords: ",",
          // genreKeywords: "9840,",
          // genreKeywords: "9840,293016,",
          country: "KR",
        });
        setPopularKoreanDrama(lT.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (popularKoreanDramaInView) fetchData();
  }, [popularKoreanDramaInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const lT = await axiosFetch({
          requestID: "withKeywordsTv",
          sortBy: "first_air_date.desc",
          genreKeywords: "210024,",
          // genreKeywords: "9840,293016,",
        });
        setLatestAnime(lT.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (latestAnimeInView) fetchData();
  }, [latestAnimeInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const lT = await axiosFetch({
          requestID: "withKeywordsTv",
          sortBy: "vote_count.desc",
          genreKeywords: "210024,",
          // genreKeywords: "9840,",
          // genreKeywords: "9840,293016,",
        });
        setPopularAnime(lT.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (popularAnimeInView) fetchData();
  }, [popularAnimeInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const pM = await axiosFetch({
          requestID: "popularMovie",
          sortBy: "vote_average.asc",
        });
        setPopularMovie(pM.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (popularMovieInView) fetchData();
  }, [popularMovieInView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const pT = await axiosFetch({
          requestID: "trendingTv",
          sortBy: "vote_average.asc",
        });
        setPopularTv(pT.results);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (popularTvInView) fetchData();
  }, [popularTvInView]);

  // ── Geo-aware: what's hot in YOUR country ──
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axiosFetch({
          requestID: "regionTrendingMovie",
          country: geo?.country || "US",
        });
        setRegionTrending(res?.results || []);
      } catch (error) {
        console.error("Error fetching regional trending:", error);
      }
    };
    if (regionTrendingInView && geo) fetchData();
  }, [regionTrendingInView, geo]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axiosFetch({
          requestID: "regionTrendingTv",
          country: geo?.country || "US",
        });
        setRegionPopularTv(res?.results || []);
      } catch (error) {
        console.error("Error fetching regional TV:", error);
      }
    };
    if (regionPopularTvInView && geo) fetchData();
  }, [regionPopularTvInView, geo]);

  // ── Worldwide chart: always available, regardless of geo detection ──
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axiosFetch({ requestID: "trendingMovie" });
        setWorldTrending(res?.results || []);
      } catch (error) {
        console.error("Error fetching worldwide trending:", error);
      }
    };
    if (worldTrendingInView) fetchData();
  }, [worldTrendingInView]);

  // useEffect(() => {
  //   const asyncFunc = async () => {
  //     let arr: any[] = [];
  //     let i = 0;
  //     if (
  //       continueWatching &&
  //       (continueWatching?.tv?.length > 0 ||
  //         continueWatching?.movie?.length > 0)
  //     ) {
  //       if (i < 5) {
  //         for (const ele of continueWatching?.tv) {
  //           const res = await axiosFetch({ requestID: "tvRelated", id: ele });
  //           arr.push(res?.results);
  //           i++;
  //         }
  //       }
  //       if (i < 10) {
  //         for (const ele of continueWatching?.movie) {
  //           const res = await axiosFetch({
  //             requestID: "movieRelated",
  //             id: ele,
  //           });
  //           arr.push(res?.results);
  //           i++;
  //         }
  //       }
  //     }
  //     return arr;
  //   };
  //   asyncFunc().then((arr) => {
  //     const shuffledArray = shuffle(arr.flat(Infinity));
  //     setRecommendations(shuffledArray);
  //   });
  // }, [continueWatching]);

  return (
    <div className={styles.HomeListAll}>
      <ContinueWatchingRow />
      <Top10Row />
      <LatestUploadsRow />
      <h1 ref={regionTrendingRef}>
        Trending in {geo?.regionName || "Your Region"}
        {geo?.source === "fallback" ? (
          <span
            className={styles.geoHint}
            title="Location unavailable — showing worldwide"
          >
            (worldwide)
          </span>
        ) : null}
      </h1>
      <div className={styles.HomeListSection}>
        {geo &&
          filterForKids(regionTrending)?.map((ele: any) => {
            return <MovieCardSmall data={ele} media_type="movie" />;
          })}
        {(!geo || regionTrending?.length === 0) &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={worldTrendingRef}>Trending Around the World</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(worldTrending)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="movie" />;
        })}
        {worldTrending?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      {recommendations.length > 0 ? (
        <>
          <h1>Recommendation</h1>
          <div
            className={styles.HomeListSection}
            data-tooltip-id="tooltip"
            data-tooltip-content="recommendation based on what you have watched!"
          >
            {recommendations[0] !== undefined &&
              filterForKids(recommendations)?.map((ele: any, i) => {
                return i < 20 ? (
                  <MovieCardSmall data={ele} media_type={ele?.media_type} />
                ) : null;
              })}
            {recommendations[0] === undefined &&
              dummyList.map((ele, i) => (
                <Skeleton className={styles.loading} key={i} />
              ))}
          </div>
        </>
      ) : null}
      <h1 ref={latestMovieRef}>Latest Movies</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(latestMovie)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="movie" />;
        })}
        {latestMovie?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={latestTvRef}>Latest TV Shows</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(latestTv)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="tv" />;
        })}
        {latestTv?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={latestKoreanDramaRef}>Latest K-Dramas</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(latestKoreanDrama)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="tv" />;
        })}
        {latestKoreanDrama?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={popularKoreanDramaRef}>Popular K-Dramas</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(popularKoreanDrama)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="tv" />;
        })}
        {popularKoreanDrama?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={latestAnimeRef}>Latest Anime</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(latestAnime)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="tv" />;
        })}
        {latestAnime?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={popularAnimeRef}>Popular Anime</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(popularAnime)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="tv" />;
        })}
        {popularAnime?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={popularMovieRef}>Popular Movies</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(popularMovie)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="movie" />;
        })}
        {popularMovie?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={popularTvRef}>Popular TV Shows</h1>
      <div className={styles.HomeListSection}>
        {filterForKids(popularTv)?.map((ele: any) => {
          return <MovieCardSmall data={ele} media_type="tv" />;
        })}
        {popularTv?.length === 0 &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
      <h1 ref={regionPopularTvRef}>
        Popular Shows in {geo?.regionName || "Your Region"}
      </h1>
      <div className={styles.HomeListSection}>
        {geo &&
          filterForKids(regionPopularTv)?.map((ele: any) => {
            return <MovieCardSmall data={ele} media_type="tv" />;
          })}
        {(!geo || regionPopularTv?.length === 0) &&
          dummyList.map((ele, i) => (
            <Skeleton className={styles.loading} key={i} />
          ))}
      </div>
    </div>
  );
};

export default HomeListAll;
