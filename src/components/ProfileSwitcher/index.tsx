// Netflix-style profile switcher — avatar chip in the navbar with a dropdown
// for switching between profiles, creating new ones (with kids mode), and
// deleting non-active profiles. Switching broadcasts openstream:profile-changed;
// pages re-read their scoped storage on that event.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getProfiles,
  getActiveProfile,
  switchProfile,
  createProfile,
  deleteProfile,
  updateProfile,
  isKidsMode,
  type StreamProfile,
} from "@/Utils/profiles";
import {
  IoPerson,
  IoPersonOutline,
  IoAdd,
  IoClose,
  IoCheckmark,
} from "react-icons/io5";
import styles from "./style.module.scss";

const AVATAR_COLORS = [
  "#4f8cff",
  "#7c5cff",
  "#ff6b8b",
  "#2dd4bf",
  "#f5a524",
  "#38bdf8",
];

const avatarColor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initials = (name: string): string =>
  (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const ProfileSwitcher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<StreamProfile[]>([]);
  const [active, setActive] = useState<StreamProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kids, setKids] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setProfiles(getProfiles());
    setActive(getActiveProfile());
  }, []);

  useEffect(() => {
    refresh();
    const onProfileChange = () => refresh();
    window.addEventListener("openstream:profile-changed", onProfileChange);
    return () =>
      window.removeEventListener("openstream:profile-changed", onProfileChange);
  }, [refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleCreate = () => {
    if (!name.trim()) return;
    createProfile(name, kids);
    setName("");
    setKids(false);
    setCreating(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteProfile(id);
    refresh();
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.chip}
        onClick={() => setOpen((v) => !v)}
        aria-label="Profiles"
        data-tooltip-id="tooltip"
        data-tooltip-content={
          active
            ? `Profile: ${active.name}${isKidsMode() ? " (Kids)" : ""}`
            : "Profiles"
        }
      >
        <span
          className={styles.avatar}
          style={{ background: avatarColor(active?.id || "viewer") }}
        >
          {initials(active?.name || "V")}
        </span>
        {active?.kids ? <span className={styles.kidsDot}>K</span> : null}
      </button>

      {open && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.heading}>Profiles</div>
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`${styles.row} ${p.id === active?.id ? styles.activeRow : ""}`}
              role="menuitem"
              tabIndex={0}
              onClick={() => {
                switchProfile(p.id);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  switchProfile(p.id);
                  setOpen(false);
                }
              }}
            >
              <span
                className={styles.avatarSmall}
                style={{ background: avatarColor(p.id) }}
              >
                {initials(p.name)}
              </span>
              <span className={styles.name}>
                {p.name}
                {p.kids ? <em className={styles.kidsTag}>Kids</em> : null}
              </span>
              {p.id === active?.id ? (
                <IoCheckmark className={styles.check} />
              ) : (
                p.id !== "viewer" && (
                  <button
                    className={styles.delete}
                    aria-label={`Delete profile ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                  >
                    <IoClose />
                  </button>
                )
              )}
            </div>
          ))}

          {creating ? (
            <div className={styles.createBox}>
              <input
                className={styles.input}
                autoFocus
                maxLength={24}
                placeholder="Profile name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              <label className={styles.kidsToggle}>
                <input
                  type="checkbox"
                  checked={kids}
                  onChange={(e) => setKids(e.target.checked)}
                />
                Kids mode
              </label>
              <div className={styles.createActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button className={styles.createBtn} onClick={handleCreate}>
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.addRow} onClick={() => setCreating(true)}>
              <IoAdd /> New profile
            </button>
          )}

          {active && active.id !== "viewer" ? (
            <button
              className={styles.kidsRow}
              onClick={() => {
                updateProfile(active.id, { kids: !active.kids });
                refresh();
              }}
            >
              {active.kids ? "Disable kids mode" : "Enable kids mode"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ProfileSwitcher;
