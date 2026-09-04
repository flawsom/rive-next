// Community lists — user-curated, shareable public collections
// ("Best slow-burn K-dramas", "Comfort anime for rainy days").
// Firestore-backed: anyone can read lists; signed-in users can create and
// like. Designed to degrade gracefully when Firebase isn't configured.

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

export interface CommunityList {
  id: string;
  name: string;
  description?: string;
  /** "movie" | "tv" | "mixed" */
  mediaType: "movie" | "tv" | "mixed";
  /** TMDB ids with type: [{ type, id, title, posterPath }] */
  items: CommunityListItem[];
  authorId: string;
  authorName: string;
  createdAt?: number;
  likes: number;
  likedBy: string[];
}

export interface CommunityListItem {
  type: "movie" | "tv";
  id: string | number;
  title?: string;
  posterPath?: string | null;
}

const COLLECTION = "communityLists";
const MAX_ITEMS = 50;

export function isCommunityAvailable(): boolean {
  return !!db;
}

export function isSignedIn(): boolean {
  return !!(auth && auth.currentUser);
}

/** Create a list (requires sign-in). Returns the new list id. */
export async function createCommunityList(input: {
  name: string;
  description?: string;
  items: CommunityListItem[];
}): Promise<string> {
  if (!db) throw new Error("Community lists require cloud configuration.");
  const user = auth!.currentUser;
  if (!user) throw new Error("Sign in to create a list.");

  const payload: Omit<CommunityList, "id"> = {
    name: (input.name || "").trim().slice(0, 80),
    description: (input.description || "").trim().slice(0, 300) || undefined,
    mediaType: deriveMediaType(input.items),
    items: input.items.slice(0, MAX_ITEMS),
    authorId: user.uid,
    authorName: user.displayName || "Viewer",
    createdAt: Date.now(),
    likes: 0,
    likedBy: [],
  };
  if (!payload.name) throw new Error("Give your list a name.");

  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

function deriveMediaType(items: CommunityListItem[]): "movie" | "tv" | "mixed" {
  const hasMovie = items.some((i) => i.type === "movie");
  const hasTv = items.some((i) => i.type === "tv");
  if (hasMovie && hasTv) return "mixed";
  if (hasTv) return "tv";
  return "movie";
}

/** Fetch recent lists, newest first. */
export async function fetchRecentLists(max = 24): Promise<CommunityList[]> {
  if (!db) return [];
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy("createdAt", "desc"),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as any) }) as CommunityList,
    );
  } catch {
    return [];
  }
}

/** Fetch the current user's own lists. */
export async function fetchMyLists(): Promise<CommunityList[]> {
  if (!db || !auth?.currentUser) return [];
  try {
    const all = await fetchRecentLists(100);
    const uid = auth.currentUser.uid;
    return all.filter((l) => l.authorId === uid);
  } catch {
    return [];
  }
}

export async function fetchList(id: string): Promise<CommunityList | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as any) } as CommunityList;
  } catch {
    return null;
  }
}

/** Add one title to a list you own. */
export async function addItemToList(
  listId: string,
  item: CommunityListItem,
): Promise<void> {
  if (!db) throw new Error("Community lists require cloud configuration.");
  const user = auth!.currentUser;
  if (!user) throw new Error("Sign in first.");
  await updateDoc(doc(db, COLLECTION, listId), {
    items: arrayUnion(item),
    mediaType: "mixed", // recomputed on read by media type mix
  });
}

/** Remove one title from a list you own. */
export async function removeItemFromList(
  listId: string,
  item: CommunityListItem,
): Promise<void> {
  if (!db) throw new Error("Community lists require cloud configuration.");
  await updateDoc(doc(db, COLLECTION, listId), {
    items: arrayRemove(item),
  });
}

/** Toggle a like. One like per user, tracked in likedBy. */
export async function toggleLike(listId: string): Promise<void> {
  if (!db) throw new Error("Community lists require cloud configuration.");
  const user = auth!.currentUser;
  if (!user) throw new Error("Sign in to like lists.");
  const ref = doc(db, COLLECTION, listId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as CommunityList;
  const liked = (data.likedBy || []).includes(user.uid);
  await updateDoc(ref, {
    likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    likes: liked ? increment(-1) : increment(1),
  });
}

/** Delete a list (owner only). */
export async function deleteCommunityList(listId: string): Promise<void> {
  if (!db) throw new Error("Community lists require cloud configuration.");
  const user = auth!.currentUser;
  if (!user) return;
  const snap = await getDoc(doc(db, COLLECTION, listId));
  if (!snap.exists()) return;
  if ((snap.data() as any).authorId !== user.uid) return; // owner-only
  await setDoc(doc(db, COLLECTION, listId), { deleted: true }, { merge: true });
}

/** Share deep link for a list. */
export function listShareUrl(listId: string): string {
  if (typeof window === "undefined")
    return `/collections/community?id=${listId}`;
  return `${window.location.origin}/collections/community?id=${listId}`;
}
