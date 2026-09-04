import React, { useState, useEffect } from "react";
import styles from "./style.module.scss";
import Link from "next/link";
// import {
//   AiFillHome,
//   AiOutlineHome,
//   AiFillPlayCircle,
//   AiOutlinePlayCircle,
// } from "react-icons/ai";
// import {
//   IoLibrary,
//   IoLibraryOutline,
//   IoSettings,
//   IoSettingsOutline,
//   IoSearchOutline,
//   IoSearch,
// } from "react-icons/io5";
// import { PiTelevisionFill, PiTelevisionLight } from "react-icons/pi";

import { IoLibrary, IoLibraryOutline } from "react-icons/io5";
import {
  MdOutlineCollectionsBookmark,
  MdCollectionsBookmark,
  MdHome,
  MdOutlineHome,
  MdPlayCircle,
  MdOutlinePlayCircle,
  MdSearch,
  MdOutlineSearch,
  MdSettings,
  MdOutlineSettings,
  MdTv,
  MdOutlineTv,
  MdTheaterComedy,
  MdOutlineTheaterComedy,
} from "react-icons/md";
import { RiEye2Line, RiEye2Fill } from "react-icons/ri";
import { BsStars, BsStar, BsCollectionPlay, BsShuffle } from "react-icons/bs";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import ProfileSwitcher from "@/components/ProfileSwitcher";

const Navbar = ({ children }: any) => {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [surprising, setSurprising] = useState(false);

  // Surprise Me: instantly jump to a random title across movies and shows.
  const surpriseMe = async () => {
    if (surprising) return;
    setSurprising(true);
    try {
      const response = await fetch(
        `/api/backendfetch?requestID=random&_=${Date.now()}`,
      );
      const data = await response.json();
      if (data?.result?.id) {
        router.push(`/detail?type=${data.result.type}&id=${data.result.id}`);
      }
    } catch {
      // Silently ignore; the button simply does nothing on failure.
    } finally {
      setSurprising(false);
    }
  };
  // const query=
  const [pathname, setPathname] = useState(path);
  useEffect(() => {
    if (params.get("type") !== null) setPathname("/" + params.get("type"));
    // else setPathname(path);
    else {
      const arr = path?.split("/");
      setPathname("/" + arr[1]);
    }
    // console.log(path);
  }, [path, params]);
  return (
    <div className={styles.navbar}>
      <Link
        href="/"
        aria-label="Home"
        data-tooltip-id="tooltip"
        data-tooltip-content="Home"
      >
        {pathname === "/" ? (
          <MdHome className={styles.active} />
        ) : (
          <MdOutlineHome className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/search"
        aria-label="Search"
        data-tooltip-id="tooltip"
        data-tooltip-html="<div>Search <span class='tooltip-btn'>CTRL + K</span></div>"
      >
        {pathname === "/search" ? (
          <MdSearch className={styles.active} />
        ) : (
          <MdOutlineSearch className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/movie"
        aria-label="Movies"
        data-tooltip-id="tooltip"
        data-tooltip-content="Movies"
      >
        {pathname === "/movie" ? (
          <MdPlayCircle className={styles.active} />
        ) : (
          <MdOutlinePlayCircle className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/tv"
        aria-label="Tv shows"
        data-tooltip-id="tooltip"
        data-tooltip-content="TV shows"
      >
        {pathname === "/tv" ? (
          <MdTv className={styles.active} />
        ) : (
          <MdOutlineTv className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/anime"
        aria-label="Anime"
        data-tooltip-id="tooltip"
        data-tooltip-content="Anime"
        className={styles.mobileHide}
      >
        {pathname === "/anime" ? (
          <RiEye2Fill className={styles.active} />
        ) : (
          <RiEye2Line className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/kdrama"
        aria-label="K-Drama"
        data-tooltip-id="tooltip"
        data-tooltip-content="K-Drama"
        className={styles.mobileHide}
      >
        {pathname === "/kdrama" ? (
          <MdTheaterComedy className={styles.active} />
        ) : (
          <MdOutlineTheaterComedy className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/collections"
        aria-label="Collections"
        data-tooltip-id="tooltip"
        data-tooltip-content="Collections"
      >
        {pathname === "/collections" ? (
          <MdCollectionsBookmark className={styles.active} />
        ) : (
          <MdOutlineCollectionsBookmark className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/library"
        aria-label="Library"
        data-tooltip-id="tooltip"
        data-tooltip-content="Library"
      >
        {pathname === "/library" ? (
          <IoLibrary className={styles.active} />
        ) : (
          <IoLibraryOutline className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/sources"
        aria-label="Sources"
        data-tooltip-id="tooltip"
        data-tooltip-content="Sources"
        className={styles.mobileHide}
      >
        {pathname === "/sources" ? (
          <BsCollectionPlay className={styles.active} />
        ) : (
          <BsCollectionPlay className={styles.inactive} />
        )}
      </Link>
      <button
        onClick={surpriseMe}
        aria-label="Surprise Me"
        data-tooltip-id="tooltip"
        data-tooltip-content="Surprise Me — jump to a random title"
        className={styles.mobileHide}
        style={{
          background: "none",
          border: "none",
          cursor: surprising ? "wait" : "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <BsShuffle
          className={surprising ? styles.inactive : styles.inactive}
          style={{ opacity: surprising ? 0.4 : 1 }}
        />
      </button>
      <Link
        href="/ai"
        aria-label="AI Assistant"
        data-tooltip-id="tooltip"
        data-tooltip-content="AI Assistant"
        className={styles.mobileHide}
      >
        {pathname === "/ai" ? (
          <BsStars className={styles.active} />
        ) : (
          <BsStar className={styles.inactive} />
        )}
      </Link>
      <Link
        href="/settings"
        aria-label="Settings"
        data-tooltip-id="tooltip"
        data-tooltip-content="Settings"
        className={styles.mobileHide}
      >
        {pathname === "/settings" ||
        pathname === "/downloads" ||
        pathname === "/disclaimer" ||
        pathname === "/signup" ||
        pathname === "/login" ? (
          <MdSettings className={styles.active} />
        ) : (
          <MdOutlineSettings className={styles.inactive} />
        )}
      </Link>
      <ProfileSwitcher />
    </div>
  );
};

export default Navbar;
