import { IcoCalendar, IcoGantt, IcoGoals, IcoToday, IcoTracking } from "./icons";

export type TabKey = "today" | "calendar" | "gantt" | "goals" | "tracking";

const TABS: { key: TabKey; label: string; Ico: (p: { active?: boolean }) => React.ReactElement }[] = [
  { key: "today", label: "Задачи", Ico: IcoToday },
  { key: "calendar", label: "Календарь", Ico: IcoCalendar },
  { key: "gantt", label: "Гант", Ico: IcoGantt },
  { key: "goals", label: "Цели", Ico: IcoGoals },
  { key: "tracking", label: "Привычки", Ico: IcoTracking },
];

// Навбар = статичный CSS position:fixed bottom:0 (см. theme.css). JS-анкер по visualViewport
// убран: на коротких табах (Гант/Цели) overscroll-баунс дёргал vv-события → бар дрожал.
// MAXLIFT-замер доказал: бар и так всегда внизу, анкер не нужен.
export function BottomTabs({
  active, onChange,
}: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map(({ key, label, Ico }) => (
        <button key={key} className={active === key ? "active" : ""} onClick={() => onChange(key)}>
          <Ico active={active === key} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
