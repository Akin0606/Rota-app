import { useEffect, useRef, useState } from "react";

// Keeps a conditionally-rendered element in the DOM long enough to play an
// *exit* transition. Without this, an element that unmounts the instant its
// `open` flag flips can only ever animate its entrance — the exit teleports.
//
// Returns `{ render, state }`:
//   - `render` stays true through the close animation, then flips false so the
//     caller can unmount.
//   - `state` is the value to hang CSS off (`data-state="open" | "closed"`).
//     It starts "closed" even when `open` is true on first mount, then flips to
//     "open" on the next frame — so every appearance animates *in* from the
//     closed styles rather than snapping to the settled state.
//
// `duration` must be ≥ the longest exit transition on the element, or it will
// unmount mid-animation. Matches the CSS in globals.css (.cp-overlay et al.).
export function usePresence(open: boolean, duration = 320) {
  const [render, setRender] = useState(open);
  const [state, setState] = useState<"open" | "closed">("closed");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (open) {
      setRender(true);
      // Double rAF: let the browser paint the "closed" styles once, then flip
      // to "open" so the transition actually runs (a single frame is unreliable
      // across browsers when the element mounted this same tick).
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setState("open")),
      );
      // Safety net for a backgrounded tab, where rAF is paused: without this a
      // surface opened while hidden would sit at opacity:0 until the tab is
      // focused. rAF wins the race whenever the tab is visible (≈2 frames beats
      // 80ms), so the normal path still gets its clean paint gap.
      const fallback = setTimeout(() => setState("open"), 80);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(fallback);
      };
    }

    setState("closed");
    timer.current = setTimeout(() => setRender(false), duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, duration]);

  return { render, state } as const;
}
