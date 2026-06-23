import { useEffect, useRef } from "react";
import { IcoCalendar, IcoGantt, IcoGoals, IcoToday, IcoTracking } from "./icons";

export type TabKey = "today" | "calendar" | "gantt" | "goals" | "tracking";

// Прижать таб-бар к низу ВИДИМОГО вьюпорта через visualViewport (приём из useBottomAnchor).
// На iOS position:fixed+bottom «улетает» вверх при overscroll коротких табов (Цели/Гант) →
// чёрный провал. Якорим ВЕРХ = vvBottom − полная высота бара (вкл safe-area). В iOS standalone
// (viewport-fit=cover) vv.height = весь экран со safe-area → бар точно на нижней кромке.
function useStickBottom(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return; // нет vv (десктоп/Telegram) → CSS bottom:0 fallback
    const place = () => {
      const node = ref.current;
      if (!node) return;
      node.style.top = `${Math.round(vv.offsetTop + vv.height - node.offsetHeight)}px`;
      node.style.bottom = "auto";
    };
    place();
    const raf = requestAnimationFrame(place);
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    window.addEventListener("scroll", place, true);
    const ro = new ResizeObserver(place); // пересчёт при скрытии/показе (inline-draft на Today)
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
      window.removeEventListener("scroll", place, true);
      ro.disconnect();
    };
  }, [ref]);
}

const TABS: { key: TabKey; label: string; Ico: (p: { active?: boolean }) => React.ReactElement }[] = [
  { key: "today", label: "Задачи", Ico: IcoToday },
  { key: "calendar", label: "Календарь", Ico: IcoCalendar },
  { key: "gantt", label: "Гант", Ico: IcoGantt },
  { key: "goals", label: "Цели", Ico: IcoGoals },
  { key: "tracking", label: "Привычки", Ico: IcoTracking },
];

export function BottomTabs({
  active, onChange,
}: { active: TabKey; onChange: (k: TabKey) => void }) {
  const navRef = useRef<HTMLElement>(null);
  useStickBottom(navRef);
  return (
    <nav className="tabbar" ref={navRef}>
      {TABS.map(({ key, label, Ico }) => (
        <button key={key} className={active === key ? "active" : ""} onClick={() => onChange(key)}>
          <Ico active={active === key} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
