import { IcoCalendar, IcoGantt, IcoGoals, IcoToday, IcoTracking } from "./icons";

export type TabKey = "today" | "calendar" | "gantt" | "goals" | "tracking";

const TABS: { key: TabKey; label: string; Ico: (p: { active?: boolean }) => React.ReactElement }[] = [
  { key: "today", label: "Задачи", Ico: IcoToday },
  { key: "calendar", label: "Календарь", Ico: IcoCalendar },
  { key: "gantt", label: "Гант", Ico: IcoGantt },
  { key: "goals", label: "Цели", Ico: IcoGoals },
  { key: "tracking", label: "Привычки", Ico: IcoTracking },
];

export function BottomTabs({
  active, onChange, inboxCount,
}: { active: TabKey; onChange: (k: TabKey) => void; inboxCount: number }) {
  return (
    <nav className="tabbar">
      {TABS.map(({ key, label, Ico }) => (
        <button key={key} className={active === key ? "active" : ""} onClick={() => onChange(key)}>
          <Ico active={active === key} />
          <span>{label}</span>
          {key === "today" && inboxCount > 0 && <span className="tab-badge">{inboxCount}</span>}
        </button>
      ))}
    </nav>
  );
}
