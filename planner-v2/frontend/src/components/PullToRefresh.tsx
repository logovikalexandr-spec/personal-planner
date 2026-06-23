import { useEffect, useRef, useState } from "react";
import { CLAIM_PX, MAX_PULL, TRIGGER_PX, decide, pullProgress, pullVisual, shouldRefresh, type PullDecision } from "../lib/pullRefresh";
import { refreshApp } from "../lib/pwa";

// Pull-to-refresh: на верху любого экрана потянул вниз → крутилка → reload свежего шелла.
// Глобальный capture-листенер «забирает» жест только когда активный скроллер на самом верху
// и палец идёт вниз; иначе не вмешивается (внутренний скролл таймлайна/календаря/списка цел).

// Ближайший прокручиваемый предок (для списков/календаря/детали).
function nearestScroller(node: Element | null): HTMLElement | null {
  let el: Element | null = node;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    }
    el = el.parentElement;
  }
  return null;
}

// «Скроллер под пальцем на самом верху?» Таймлайн Today = GPU-transform (читаем translateY).
function atTop(target: Element | null): boolean {
  const tlHost = target?.closest?.(".daytimeline--static");
  if (tlHost) {
    const grid = tlHost.querySelector(".cal-grid") as HTMLElement | null;
    if (grid) {
      const ty = new DOMMatrixReadOnly(getComputedStyle(grid).transform).f; // смещение скролла
      return Math.abs(ty) <= 0.5;
    }
    return true;
  }
  const sc = nearestScroller(target);
  if (sc) return sc.scrollTop <= 0;
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

function overlayOpen(): boolean {
  return !!document.querySelector(".detail-overlay, .drawer, .qa-overlay, .qa-scrim");
}

export function PullToRefresh() {
  const [visual, setVisual] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const g = useRef({ active: false, claimed: "pending" as PullDecision, sx: 0, sy: 0, visual: 0, refreshing: false });

  useEffect(() => {
    const st = g.current;

    const onStart = (e: TouchEvent) => {
      if (st.refreshing) return;
      if (e.touches.length !== 1) { st.active = false; return; }
      const t = e.touches[0];
      if (overlayOpen() || !atTop(t.target as Element)) { st.active = false; return; }
      st.active = true; st.claimed = "pending"; st.sx = t.clientX; st.sy = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!st.active || st.refreshing) return;
      const t = e.touches[0];
      const dx = t.clientX - st.sx;
      const dy = t.clientY - st.sy;
      if (st.claimed === "pending") {
        // NOTE: do NOT call e.preventDefault() here while still "pending".
        // Calling it before the gesture is confirmed triggers iOS compositor to adjust the
        // document scroll layer on short (non-scrollable) tabs, which visually jitters the
        // position:fixed tabbar. preventDefault is called below once claimed==="pull" is confirmed.
        st.claimed = decide(dx, dy);
        if (st.claimed === "reject") { st.active = false; return; }
        if (st.claimed === "pending") return;
      }
      if (st.claimed === "pull") {
        // забираем жест: глушим нижний скролл/таймлайн (capture → до их bubble-листенеров)
        e.preventDefault();
        e.stopPropagation();
        const v = pullVisual(dy);
        st.visual = v;
        setVisual(v);
      }
    };

    const onEnd = () => {
      if (!st.active) return;
      st.active = false;
      if (st.claimed === "pull" && shouldRefresh(st.visual)) {
        st.refreshing = true;
        setRefreshing(true);
        setVisual(TRIGGER_PX);
        refreshApp(); // reload свежего шелла (страница уйдёт)
      } else {
        st.visual = 0;
        setVisual(0);
      }
    };

    document.addEventListener("touchstart", onStart, { capture: true, passive: false });
    document.addEventListener("touchmove", onMove, { capture: true, passive: false });
    document.addEventListener("touchend", onEnd, { capture: true });
    document.addEventListener("touchcancel", onEnd, { capture: true });
    return () => {
      document.removeEventListener("touchstart", onStart, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchmove", onMove, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchend", onEnd, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchcancel", onEnd, { capture: true } as EventListenerOptions);
    };
  }, []);

  const progress = pullProgress(visual);
  if (visual <= 0 && !refreshing) return null;

  return (
    <div className="ptr" aria-hidden style={{ transform: `translateX(-50%) translateY(${Math.min(visual, MAX_PULL)}px)` }}>
      <div
        className={`ptr-spin${refreshing ? " spinning" : ""}`}
        style={refreshing ? undefined : { opacity: 0.3 + progress * 0.7, transform: `rotate(${progress * 270}deg)` }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="var(--border)" strokeWidth="2.4" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
