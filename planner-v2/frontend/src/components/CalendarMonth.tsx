import { useMemo } from "react";
import { dowShort, localISO, monthMatrix, sameDay } from "../lib/calDates";
import { resolveColor } from "../lib/projectColor";
import type { Milestone, Project, Task } from "../types";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Месяц = обзор спреда и дедлайнов. Точки = задачи (цвет проекта, макс 3 +N),
 * флажки = вехи этапов. Тап дня → задачи на дату. НЕ планирование (это в «Неделе»).
 */
export function CalendarMonth({
  month, tasks, milestones, byId, today, onTapDay,
}: {
  month: Date;
  tasks: Task[];
  milestones: Milestone[];
  byId: Map<number, Project>;
  today: Date;
  onTapDay: (d: Date) => void;
}) {
  const cells = useMemo(() => monthMatrix(month.getFullYear(), month.getMonth()), [month]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      (m.get(t.due_date) ?? m.set(t.due_date, []).get(t.due_date)!).push(t);
    }
    return m;
  }, [tasks]);

  const flagsByDay = useMemo(() => {
    const m = new Map<string, Milestone[]>();
    for (const ms of milestones) {
      (m.get(ms.milestone_date) ?? m.set(ms.milestone_date, []).get(ms.milestone_date)!).push(ms);
    }
    return m;
  }, [milestones]);

  return (
    <div className="cm">
      <div className="cm-dow">
        {DOW.map((d, i) => (
          <div key={d} className={i >= 5 ? "we" : ""}>{d}</div>
        ))}
      </div>
      <div className="cm-grid">
        {cells.map((d) => {
          const iso = localISO(d);
          const out = d.getMonth() !== month.getMonth();
          const isToday = sameDay(d, today);
          const we = (d.getDay() + 6) % 7 >= 5;
          const dayTasks = tasksByDay.get(iso) ?? [];
          const flags = flagsByDay.get(iso) ?? [];
          const dots = dayTasks.slice(0, 3);
          const extra = dayTasks.length - dots.length;
          return (
            <button
              key={iso}
              className={`cm-cell${out ? " out" : ""}${isToday ? " today" : ""}${we ? " we" : ""}`}
              onClick={() => onTapDay(d)}
              aria-label={`${d.getDate()} ${dowShort(d)}`}
            >
              <div className="cm-num">{d.getDate()}</div>
              {flags.slice(0, 1).map((f) => {
                const c = resolveColor(f.project_id, byId) ?? "var(--text-muted)";
                return (
                  <div className="cm-flag" key={f.id} title={f.name}>
                    <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
                      <path d="M2 1v10" stroke={c} strokeWidth="1.4" fill="none" />
                      <path d="M2 1.5h6l-1.4 2L8 5.5H2z" fill={c} />
                    </svg>
                    <span className="ft">{f.name}</span>
                  </div>
                );
              })}
              {dots.length > 0 && (
                <div className="cm-dots">
                  {dots.map((t) => (
                    <span
                      key={t.id}
                      className="cm-pt"
                      style={{ background: resolveColor(t.project_id, byId) ?? "var(--text-muted)" }}
                    />
                  ))}
                  {extra > 0 && <span className="cm-more">+{extra}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="cm-hint">Тап дня → задачи на эту дату</div>
    </div>
  );
}
