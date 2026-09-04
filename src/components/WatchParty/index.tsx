// Watch Party panel — host creates a room and shares the code; guests join
// and their player follows the host. Wired into the watch page for direct
// playback (embeds can't be driven cross-origin, so watch parties activate
// when the custom player is the active surface).
//
// Contract with the page:
//  - Host mode: calls `registerControls({ publish })`; the page invokes
//    publish(playing, positionSeconds) on every play/pause/seek.
//  - Guest mode: every host snapshot invokes `onHostCommand(playing, seconds)`
//    so the page can seek/play to match.
import React, { useEffect, useRef, useState } from "react";
import {
  isWatchPartyAvailable,
  createWatchParty,
  joinWatchParty,
  publishWatchPartyState,
  subscribeWatchParty,
  heartbeatWatchParty,
  type WatchPartyState,
} from "@/Utils/watchParty";
import {
  BsPeopleFill,
  BsLink45Deg,
  BsBoxArrowInRight,
  BsBroadcast,
} from "react-icons/bs";
import styles from "./style.module.scss";

export interface WatchPartyControls {
  publish?: (playing: boolean, positionSeconds: number) => void;
}

interface WatchPartyProps {
  mediaType: "movie" | "tv";
  mediaId: string;
  season?: number;
  episode?: number;
  title?: string;
  registerControls?: (controls: WatchPartyControls | null) => void;
  /** Guest: invoked on every authoritative host event. */
  onHostCommand?: (playing: boolean, positionSeconds: number) => void;
  /** True while the custom player owns playback (watch parties need it). */
  directPlayback?: boolean;
}

const memberId = `m${Date.now().toString(36)}${Math.floor(
  Math.random() * 1e6,
).toString(36)}`;

const WatchParty: React.FC<WatchPartyProps> = ({
  mediaType,
  mediaId,
  season,
  episode,
  title,
  registerControls,
  onHostCommand,
  directPlayback = false,
}) => {
  const [available] = useState(isWatchPartyAvailable());
  const [mode, setMode] = useState<"idle" | "host" | "guest">("idle");
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const unsubsRef = useRef<Array<() => void>>([]);
  const commandRef = useRef<typeof onHostCommand>();
  commandRef.current = onHostCommand;

  useEffect(
    () => () => {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
      registerControls?.(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const teardown = () => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    registerControls?.(null);
  };

  const startHost = async () => {
    setError("");
    try {
      teardown();
      const room = await createWatchParty({
        playing: false,
        position: 0,
        mediaType,
        mediaId,
        season,
        episode,
        hostName: name || "Host",
      });
      setCode(room.code);
      setMode("host");
      setStatus("Room live — you are the host");
      const hb = setInterval(() => {
        heartbeatWatchParty(room.code, memberId, name || "Host");
      }, 20_000);
      heartbeatWatchParty(room.code, memberId, name || "Host");
      unsubsRef.current.push(() => clearInterval(hb));
      registerControls?.({
        publish: (playing, positionSeconds) => {
          publishWatchPartyState(room.code, {
            playing,
            position: positionSeconds,
            mediaType,
            mediaId,
            season,
            episode,
            hostName: name || "Host",
          });
        },
      });
    } catch (e: any) {
      setError(e?.message || "Could not create the room.");
    }
  };

  const startJoin = async () => {
    setError("");
    const normalized = joinCode.trim().toUpperCase();
    try {
      const state = await joinWatchParty(normalized);
      if (!state) {
        setError("Room not found. Check the code.");
        return;
      }
      if (
        state.mediaType !== mediaType ||
        String(state.mediaId) !== String(mediaId)
      ) {
        setError(
          "This room is watching a different title — open that title first.",
        );
        return;
      }
      teardown();
      setCode(normalized);
      setMode("guest");
      setStatus("Following the host");
      commandRef.current?.(state.playing, state.position);
      const hb = setInterval(() => {
        heartbeatWatchParty(normalized, memberId, name || "Guest");
      }, 20_000);
      heartbeatWatchParty(normalized, memberId, name || "Guest");
      unsubsRef.current.push(() => clearInterval(hb));
      const unsub = subscribeWatchParty(normalized, (next: WatchPartyState) => {
        commandRef.current?.(next.playing, next.position);
      });
      if (unsub) unsubsRef.current.push(unsub);
    } catch (e: any) {
      setError(e?.message || "Could not join the room.");
    }
  };

  const leave = () => {
    teardown();
    setMode("idle");
    setCode("");
    setStatus("");
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?party=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the code is visible to copy manually.
    }
  };

  if (!available || !directPlayback) return null;

  return (
    <div className={styles.wrap}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <BsBroadcast /> Watch Party
        {mode !== "idle" && <span className={styles.liveDot} />}
      </button>

      {open && (
        <div className={styles.panel}>
          {mode === "idle" && (
            <>
              <p className={styles.hint}>
                Watch {title ? <b>{title}</b> : "this title"} in sync with
                friends — everyone follows one host.
              </p>
              <div className={styles.nameRow}>
                <input
                  className={styles.input}
                  placeholder="Your name"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className={styles.actions}>
                <button className={styles.primaryBtn} onClick={startHost}>
                  <BsPeopleFill /> Host a room
                </button>
                <div className={styles.joinRow}>
                  <input
                    className={`${styles.input} ${styles.codeInput}`}
                    placeholder="CODE"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                  <button className={styles.secondaryBtn} onClick={startJoin}>
                    <BsBoxArrowInRight /> Join
                  </button>
                </div>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </>
          )}

          {mode === "host" && (
            <>
              <p className={styles.hint}>
                Room code <b className={styles.code}>{code}</b> — friends open
                this title, choose Join, and enter the code.
              </p>
              <div className={styles.linkRow}>
                <button className={styles.linkBtn} onClick={copyLink}>
                  <BsLink45Deg /> {copied ? "Link copied!" : "Copy invite link"}
                </button>
                <button className={styles.leaveBtn} onClick={leave}>
                  Leave
                </button>
              </div>
              <p className={styles.status}>{status}</p>
            </>
          )}

          {mode === "guest" && (
            <div className={styles.linkRow}>
              <p className={styles.status}>
                In room <b className={styles.code}>{code}</b> · {status}
              </p>
              <button className={styles.leaveBtn} onClick={leave}>
                Leave
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WatchParty;
