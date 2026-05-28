export type TabKey = "today" | "calendar" | "tasks" | "goals" | "projects";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "calendar", label: "Календарь" },
  { key: "tasks", label: "Задачи" },
  { key: "goals", label: "Цели" },
  { key: "projects", label: "Проекты" },
];

export function BottomTabs({
  active,
  onChange,
  inboxCount,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  inboxCount: number;
}) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button key={t.key} className={active === t.key ? "active" : ""} onClick={() => onChange(t.key)}>
          <span>{t.label}</span>
          {t.key === "today" && inboxCount > 0 && <span className="tab-badge">{inboxCount}</span>}
        </button>
      ))}
    </nav>
  );
}
