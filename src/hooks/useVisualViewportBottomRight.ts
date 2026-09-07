import { useEffect, useState } from "react";

// Mobile browsers resize the LAYOUT viewport differently from what's
// actually on-screen while the address bar is showing (it reserves space
// that hasn't collapsed yet). A plain `position: fixed; bottom: 0` element
// anchors to that layout viewport, which can extend below the area the
// user can actually see -- so it renders "at the bottom of the page,"
// only scrolling into view once the toolbar collapses and the visual
// viewport grows to match. Anchoring off VisualViewport's live
// offset/height instead always lands the element at the true visible
// bottom-right corner of the screen, regardless of toolbar state or scroll.
export function useVisualViewportBottomRight() {
  const [inset, setInset] = useState({ bottom: 0, right: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setInset({
        bottom: Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)),
        right: Math.max(0, window.innerWidth - (vv.width + vv.offsetLeft))
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return inset;
}
