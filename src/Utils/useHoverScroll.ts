import { useEffect, useRef } from "react";

/**
 * Premium hover-wheel horizontal scrolling for media rows.
 *
 * Hovering a row and scrolling the mouse wheel glides it sideways with an
 * eased, inertia-like motion (Netflix/Disney+ feel) instead of the page
 * jumping down or a clunky scrollbar drag. Details that make it feel right:
 *
 * - Vertical wheel delta is translated to horizontal motion with a slight gain.
 * - Motion is animated through a rAF lerp (ease-out), so each notch of the
 *   wheel glides to its target instead of snapping. `scroll-behavior` is
 *   forced to `auto` on the element because the global stylesheet's `smooth`
 *   would fight the per-frame updates and feel rubber-bandy.
 * - Wheel events are only claimed while the row can still scroll in that
 *   direction; at either edge the page scrolls normally (no scroll-jacking).
 * - Trackpad horizontal swipes and Shift+wheel pass through untouched.
 * - Touch devices are unaffected (native touch scrolling).
 *
 * Two React surfaces share the same engine:
 *  - useHoverScroll(): one scrollable element (ref).
 *  - useHoverScrollDelegate(): a container that manages every descendant
 *    marked with `data-hscroll` (one listener for a whole page of rows).
 */

interface GlideState {
  target: number;
  animating: boolean;
  raf: number;
  settleTimer: number;
}

function attach(el: HTMLElement): () => void {
  // rAF-lerped scrolling needs raw scrollLeft writes; the global
  // `scroll-behavior: smooth` would double-animate every write.
  el.style.scrollBehavior = "auto";

  const state: GlideState = {
    target: el.scrollLeft,
    animating: false,
    raf: 0,
    settleTimer: 0,
  };

  const maxScroll = () => el.scrollWidth - el.clientWidth;

  const stop = () => {
    state.animating = false;
  };

  const tick = () => {
    const distance = state.target - el.scrollLeft;
    if (Math.abs(distance) < 0.5) {
      el.scrollLeft = state.target;
      state.animating = false;
      return;
    }
    el.scrollLeft += distance * 0.16; // ease-out glide
    state.raf = requestAnimationFrame(tick);
  };

  const animate = () => {
    if (state.animating) return;
    state.animating = true;
    state.raf = requestAnimationFrame(tick);
  };

  const onWheel = (e: WheelEvent) => {
    // Shift+wheel is already horizontal; trackpad deltaX too — leave both
    // to the browser. Only claim the vertical wheel.
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.deltaY === 0) return;

    const max = maxScroll();
    if (max <= 4) return; // nothing to scroll

    const atStart = el.scrollLeft <= 0;
    const atEnd = el.scrollLeft >= max - 0.5;
    const scrollingDown = e.deltaY > 0;

    // At an edge opposite to the scroll direction: hand back to the page.
    if ((atStart && !scrollingDown) || (atEnd && scrollingDown)) {
      stop();
      state.target = el.scrollLeft;
      return;
    }

    e.preventDefault();
    const gain = 1.15;
    let next = state.target + e.deltaY * gain;
    // Burst scrolling keeps momentum: allow the target to run past the edge
    // slightly so consecutive notches don't die short of the end.
    if (scrollingDown && next > max) next = max + 240;
    if (!scrollingDown && next < 0) next = -240;
    state.target = Math.max(-240, Math.min(max + 240, next));
    animate();

    // When the wheel pauses, settle the target back into real bounds so the
    // row rests at a sensible position.
    window.clearTimeout(state.settleTimer);
    state.settleTimer = window.setTimeout(() => {
      state.target = Math.max(0, Math.min(maxScroll(), state.target));
    }, 120);
  };

  const onScroll = () => {
    // External scrolls (touch, scrollbar drag) resync the animation target.
    if (!state.animating) state.target = el.scrollLeft;
  };

  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("scroll", onScroll);
    window.clearTimeout(state.settleTimer);
    cancelAnimationFrame(state.raf);
  };
}

export function useHoverScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attach(el);
  }, []);

  return ref;
}

export function useHoverScrollDelegate<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const attached = new Map<HTMLElement, () => void>();
    const ensure = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest<HTMLElement>("[data-hscroll]");
      if (!row || !root.contains(row) || attached.has(row)) return;
      attached.set(row, attach(row));
    };

    const onWheelCapture = (e: WheelEvent) => ensure(e.target);
    const onTouchStartCapture = (e: TouchEvent) => ensure(e.target);
    // Mutation-safe: rows mount progressively (in-view loading), so also
    // sweep once and on every capture-phase wheel.
    root.querySelectorAll<HTMLElement>("[data-hscroll]").forEach((row) => {
      if (!attached.has(row)) attached.set(row, attach(row));
    });

    root.addEventListener("wheel", onWheelCapture, { capture: true });
    root.addEventListener("touchstart", onTouchStartCapture, {
      capture: true,
    });
    return () => {
      root.removeEventListener("wheel", onWheelCapture, { capture: true });
      root.removeEventListener("touchstart", onTouchStartCapture, {
        capture: true,
      });
      attached.forEach((detach) => detach());
      attached.clear();
    };
  }, []);

  return ref;
}
