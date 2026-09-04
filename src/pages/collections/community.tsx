// Community lists — browse, open, like, and create user-curated collections.
// Lists live in Firestore; guests can browse, signed-in users can create and
// like. A list deep link (?id=…) opens that list directly.
import { useState, useEffect, useCallback } from "react";
import styles from "@/styles/Search.module.scss";
import btnStyles from "@/styles/Settings.module.scss";
import MovieCardSmall from "@/components/MovieCardSmall";
import Skeleton from "react-loading-skeleton";
import NProgress from "nprogress";
import { useRouter } from "next/router";
import { toast } from "sonner";
import {
  BsPeopleFill,
  BsHeart,
  BsHeartFill,
  BsPlusCircle,
  BsShare,
  BsBoxArrowUpRight,
} from "react-icons/bs";
import {
  isCommunityAvailable,
  isSignedIn,
  fetchRecentLists,
  fetchList,
  createCommunityList,
  toggleLike,
  listShareUrl,
  type CommunityList,
} from "@/Utils/communityLists";
import { auth } from "@/Utils/firebase";

const CommunityListsPage = () => {
  const router = useRouter();
  const [available] = useState(isCommunityAvailable());
  const [lists, setLists] = useState<CommunityList[]>([]);
  const [loading, setLoading] = useState(true);
  const [openList, setOpenList] = useState<CommunityList | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (auth) {
      const unsub = auth.onAuthStateChanged((u) => setUser(u));
      return () => unsub();
    }
  }, []);

  const loadLists = useCallback(async () => {
    setLoading(true);
    const data = await fetchRecentLists(30);
    setLists(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!available) {
      setLoading(false);
      return;
    }
    loadLists();
  }, [available, loadLists]);

  // Deep link: /collections/community?id=…
  useEffect(() => {
    const id = router?.query?.id;
    if (!id || typeof id !== "string" || !available) return;
    fetchList(id).then((list) => {
      if (list) setOpenList(list);
      else toast.error("List not found");
    });
  }, [router?.query?.id, available]);

  useEffect(() => {
    if (loading) NProgress.start();
    else NProgress.done(false);
  }, [loading]);

  const handleCreate = async () => {
    try {
      // New lists start from the watchlist itself, which is the fastest
      // way to publish something meaningful.
      const raw = localStorage.getItem("OpenStreamWatchlist");
      const wl = raw ? JSON.parse(raw) : { movie: [], tv: [] };
      const items = [
        ...(Array.isArray(wl?.movie) ? wl.movie : []).map((id: any) => ({
          type: "movie" as const,
          id,
        })),
        ...(Array.isArray(wl?.tv) ? wl.tv : []).map((id: any) => ({
          type: "tv" as const,
          id,
        })),
      ];
      if (items.length === 0) {
        toast.error(
          "Your watchlist is empty — bookmark a few titles first, then publish them as a list.",
        );
        return;
      }
      const id = await createCommunityList({
        name,
        description,
        items,
      });
      toast.success("List published!");
      setCreating(false);
      setName("");
      setDescription("");
      loadLists();
      setOpenList(await fetchList(id));
    } catch (e: any) {
      toast.error(e?.message || "Could not publish the list");
    }
  };

  const handleLike = async (list: CommunityList) => {
    if (!user) {
      toast.error("Sign in to like lists");
      return;
    }
    try {
      await toggleLike(list.id);
      const fresh = await fetchList(list.id);
      if (fresh) {
        setOpenList((prev) => (prev?.id === fresh.id ? fresh : prev));
        setLists((prev) => prev.map((l) => (l.id === fresh.id ? fresh : l)));
      }
    } catch {
      toast.error("Could not update like");
    }
  };

  const handleShare = async (list: CommunityList) => {
    const url = listShareUrl(list.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: list.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied!");
      }
    } catch {
      // share cancelled
    }
  };

  if (!available) {
    return (
      <div className={styles.MoviePage}>
        <h1>Community Lists</h1>
        <p style={{ textAlign: "center", opacity: 0.6 }}>
          Community lists need cloud sync configured. Add your Firebase keys in
          Settings to enable them.
        </p>
      </div>
    );
  }

  // ─── Single list view ──────────────────────────────────────────────────────
  if (openList) {
    const liked = user && (openList.likedBy || []).includes(user.uid);
    return (
      <div className={styles.MoviePage}>
        <button
          className={styles.backLink}
          onClick={() => setOpenList(null)}
          style={{
            background: "none",
            border: "none",
            color: "#4f8cff",
            cursor: "pointer",
            marginBottom: "0.6rem",
            fontSize: "0.85rem",
          }}
        >
          ← All community lists
        </button>
        <h1>{openList.name}</h1>
        {openList.description && (
          <p style={{ opacity: 0.7, marginBottom: "1rem" }}>
            {openList.description}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            marginBottom: "1.2rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ opacity: 0.6, fontSize: "0.8rem" }}>
            by {openList.authorName} · {openList.items.length} titles
          </span>
          <button
            onClick={() => handleLike(openList)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "none",
              border: "none",
              color: liked ? "#ff6b8b" : "rgba(255,255,255,0.65)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {liked ? <BsHeartFill /> : <BsHeart />} {openList.likes || 0}
          </button>
          <button
            onClick={() => handleShare(openList)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.65)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            <BsShare /> Share
          </button>
        </div>
        <div className={styles.movieList}>
          {openList.items.map((item) => (
            <MovieCardSmall
              key={`${item.type}-${item.id}`}
              data={{
                id: item.id,
                title: item.title,
                poster_path: item.posterPath,
              }}
              media_type={item.type}
            />
          ))}
          {openList.items.length === 0 && <p>No titles in this list yet.</p>}
        </div>
      </div>
    );
  }

  // ─── Browse view ───────────────────────────────────────────────────────────
  return (
    <div className={styles.MoviePage}>
      <h1>
        <BsPeopleFill style={{ verticalAlign: "-0.15em" }} /> Community Lists
      </h1>
      <p
        style={{
          textAlign: "center",
          opacity: 0.6,
          maxWidth: 560,
          margin: "0 auto 1.2rem",
        }}
      >
        Hand-picked collections from viewers like you. Publish your watchlist as
        a list in one tap, share the link, and let others discover your taste.
      </p>

      <div style={{ textAlign: "center", marginBottom: "1.6rem" }}>
        {user ? (
          creating ? (
            <div
              style={{
                maxWidth: 480,
                margin: "0 auto",
                textAlign: "left",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "1rem",
              }}
            >
              <h3 style={{ margin: "0 0 0.8rem" }}>Publish your watchlist</h3>
              <input
                placeholder="List name (e.g. Best slow-burn K-dramas)"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  marginBottom: "0.6rem",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "0.55rem 0.8rem",
                  color: "inherit",
                }}
              />
              <textarea
                placeholder="Describe it (optional)"
                value={description}
                maxLength={300}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: "100%",
                  marginBottom: "0.8rem",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "0.55rem 0.8rem",
                  color: "inherit",
                  resize: "vertical",
                }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setCreating(false)}
                  className={btnStyles.downloadButton}
                  style={{ padding: "0.4rem 1rem" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  style={{
                    background: "#4f8cff",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "0.4rem 1rem",
                    cursor: name.trim() ? "pointer" : "not-allowed",
                    fontWeight: 600,
                  }}
                >
                  Publish
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "rgba(79,140,255,0.14)",
                border: "1px solid rgba(79,140,255,0.45)",
                color: "#4f8cff",
                borderRadius: "2rem",
                padding: "0.5rem 1.2rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <BsPlusCircle /> Publish my watchlist as a list
            </button>
          )
        ) : (
          <p style={{ opacity: 0.55, fontSize: "0.85rem" }}>
            Sign in to publish lists and like — browsing is open to everyone.
          </p>
        )}
      </div>

      <div className={styles.movieList}>
        {lists.map((list) => (
          <div
            key={list.id}
            onClick={() => setOpenList(list)}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12,
              padding: "1rem 1.2rem",
              cursor: "pointer",
              transition: "border-color 0.15s ease",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            <strong>{list.name}</strong>
            {list.description && (
              <span style={{ opacity: 0.6, fontSize: "0.8rem" }}>
                {list.description}
              </span>
            )}
            <span style={{ opacity: 0.45, fontSize: "0.75rem" }}>
              by {list.authorName} · {list.items?.length || 0} titles ·{" "}
              {list.likes || 0} likes
            </span>
          </div>
        ))}
        {loading &&
          [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} height={90} />)}
        {!loading && lists.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.5 }}>
            No community lists yet — be the first to publish one!
          </p>
        )}
      </div>
    </div>
  );
};

export default CommunityListsPage;
