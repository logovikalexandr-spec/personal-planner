import { IcoCalendar, IcoGoals, IcoProjects, IcoTasks, IcoToday } from "./icons";

export type TabKey = "today" | "calendar" | "tasks" | "goals" | "projects";

const TABS: { key: TabKey; label: string; Ico: (p: { active?: boolean }) => React.ReactElement }[] = [
  { key: "today", label: "Сегодня", Ico: IcoToday },
  { key: "calendar", label: "Календарь", Ico: IcoCalendar },
  { key: "tasks", label: "Задачи", Ico: IcoTasks },
  { key: "goals", label: "Цели", Ico: IcoGoals },
  { key: "projects", label: "Проекты", Ico: IcoProjects },
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
