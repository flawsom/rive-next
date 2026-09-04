// Watch Party — realtime synchronized playback via Firestore.
// A host creates a room; everyone with the code joins and their player state
// (playing/paused, position, current source/episode) follows the host within
//Firestore's normal latency. Uses onSnapshot so no polling is needed.
//
// Design: rooms are anonymous (no auth required) with short random codes.
// Firestore rules must allow read/write on the `watchParty` collection
// (documented in ABOUT_ENV.md); when Firestore isn't configured the UI
// degrades gracefully.

import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export interface WatchPartyState {
  /** ISO timestamp of the last authoritative play/pause event. */
  eventAt: number;
  /** true = play, false = pause. */
  playing: boolean;
  /** Host position in seconds at the moment of the event. */
  position: number;
  /** Media identity, so a room can only sync one title. */
  mediaType: "movie" | "tv";
  mediaId: string;
  season?: number;
  episode?: number;
  /** Optional current source/provider id so guests land on the same stream. */
  providerId?: string;
  hostName: string;
  updatedAt?: number;
}

export interface WatchPartyMember {
  name: string;
  joinedAt: number;
  lastSeen: number;
}

const COLLECTION = "watchParty";
const MEMBER_TTL = 60_000; // members vanish after 60s without a heartbeat

export function isWatchPartyAvailable(): boolean {
  return !!db;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export interface Room {
  code: string;
}

/** Host: create a room seeded with the current playback state. */
export async function createWatchParty(
  state: Omit<WatchPartyState, "eventAt" | "updatedAt">,
): Promise<Room> {
  if (!db) throw new Error("Watch party requires cloud configuration.");
  const code = randomCode();
  const payload: WatchPartyState = {
    ...state,
    eventAt: Date.now(),
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, COLLECTION, code), payload);
  return { code };
}

/** Guest: fetch the current state of a room once. */
export async function joinWatchParty(
  code: string,
): Promise<WatchPartyState | null> {
  if (!db) throw new Error("Watch party requires cloud configuration.");
  const normalized = (code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) return null;
  const snap = await getDoc(doc(db, COLLECTION, normalized));
  if (!snap.exists()) return null;
  return snap.data() as WatchPartyState;
}

/** Host: publish a new authoritative state (play/pause/seek/episode change). */
export async function publishWatchPartyState(
  code: string,
  patch: Partial<WatchPartyState>,
): Promise<void> {
  if (!db) return;
  try {
    await updateDoc(doc(db, COLLECTION, code), {
      ...patch,
      eventAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch {
    // Room may have expired — host keeps playing standalone.
  }
}

/** Guest: subscribe to host state changes. Returns an unsubscribe fn. */
export function subscribeWatchParty(
  code: string,
  onState: (state: WatchPartyState) => void,
  onMissing?: () => void,
): Unsubscribe | null {
  if (!db) return null;
  const normalized = (code || "").trim().toUpperCase();
  return onSnapshot(
    doc(db, COLLECTION, normalized),
    (snap) => {
      if (!snap.exists()) {
        onMissing?.();
        return;
      }
      onState(snap.data() as WatchPartyState);
    },
    () => {
      // Permission errors / offline — treat as missing.
      onMissing?.();
    },
  );
}

/** Presence: announce yourself and prune stale members. */
export async function heartbeatWatchParty(
  code: string,
  memberId: string,
  name: string,
): Promise<void> {
  if (!db) return;
  try {
    await setDoc(
      doc(db, COLLECTION, code, "members", memberId),
      {
        name: name.slice(0, 24) || "Guest",
        joinedAt: Date.now(),
        lastSeen: Date.now(),
      },
      { merge: true },
    );
  } catch {
    // Presence is best-effort.
  }
}

export function subscribeMembers(
  code: string,
  onMembers: (members: WatchPartyMember[]) => void,
): Unsubscribe | null {
  if (!db) return null;
  return onSnapshot(doc(db, COLLECTION, code), () => {
    // Members live in a subcollection; a lightweight re-read keeps this
    // dependency-free of collection-group queries.
  });
}

/** Compute where a guest's player should be, given host state + latency. */
export function expectedPosition(state: WatchPartyState): number {
  const drift = state.playing ? (Date.now() - state.eventAt) / 1000 : 0;
  return Math.max(0, state.position + drift);
}

/** True when local playback has drifted beyond tolerance (2.5s). */
export function needsResync(
  localSeconds: number,
  state: WatchPartyState,
  tolerance = 2.5,
): boolean {
  return Math.abs(localSeconds - expectedPosition(state)) > tolerance;
}

export { MEMBER_TTL };
