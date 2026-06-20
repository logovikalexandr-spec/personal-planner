import { useMemo, useState } from "react";
import { IcoChevron } from "./icons";
import { TaskItem } from "./TaskItem";
import { addDays, fmtAgendaDay, localISO } from "../lib/calDates";
import { resolveColor } from "../lib/projectColor";
import type { Milestone, Project, Task } from "../types";

const HORIZON = 14; // сколько дней вперёд показывает лента

/**
 * Лента (Agenda) — вертикальный скан ближайших дней (Things-стиль Upcoming).
 * Просрочка закреплена сверху и СВОРАЧИВАЕТСЯ (тап по заголовку). Задачи —
 * общий компонент TaskItem (как в Today/Списках/везде). Вехи-рубежи — отдельной
 * строкой без чекбокса. Пустые дни — тонкая строка «свободно».
 */
export function CalendarAgenda({
  start, tasks, overdue, milestones, byId, today, onToggle, onOpen,
}: {
  start: Date;
  tasks: Task[];
  overdue: Task[];
  milestones: Milestone[];
  byId: Map<number, Project>;
  today: Date;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
}) {
  const [overdueOpen, setOverdueOpen] = useState(true);

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date);
      if (arr) arr.push(t);
      else m.set(t.due_date, [t]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.due_time ?? "99").localeCompare(b.due_time ?? "99"));
    }
    return m;
  }, [tasks]);

  const msByDay = useMemo(() => {
    const m = new Map<string, Milestone[]>();
    for (const ms of milestones) (m.get(ms.milestone_date) ?? m.set(ms.milestone_date, []).get(ms.milestone_date)!).push(ms);
    return m;
  }, [milestones]);

  const days = useMemo(
    () => Array.from({ length: HORIZON }, (_, i) => addDays(start, i)),
    [start],
  );

  const renderTask = (t: Task) => (
    <div className="ca-item" key={t.id} data-testid={`ca-task-${t.id}`}>
      <TaskItem task={t} onToggle={onToggle} onOpen={onOpen} color={resolveColor(t.project_id, byId)} />
    </div>
  );

  return (
    <div className="ca" data-testid="cal-agenda">
      {overdue.length > 0 && (
        <div className="ca-day" data-testid="ca-overdue">
          <button
            className="ca-od-hdr"
            data-testid="ca-overdue-toggle"
            onClick={() => setOverdueOpen((o) => !o)}
            aria-expanded={overdueOpen}
          >
            <span className="d">Просрочено · {overdue.length}</span>
            <span className={`ca-od-chev${overdueOpen ? " open" : ""}`}><IcoChevron /></span>
          </button>
          {overdueOpen && (
            <>
              <div className="ca-od-rule" />
              {overdue.map(renderTask)}
            </>
          )}
        </div>
      )}

      {days.map((d, idx) => {
        const iso = localISO(d);
        const items = byDay.get(iso) ?? [];
        const flags = msByDay.get(iso) ?? [];
        const { label, meta } = fmtAgendaDay(d, today);
        return (
          <div className="ca-day" key={iso}>
            <div className={`ca-hdr${idx === 0 && overdue.length === 0 ? " first" : ""}`}>
              <span className="d">{label}</span>
              {meta && <span className="meta">{meta}</span>}
            </div>
            <div className="ca-rule" />
            {flags.map((f) => {
              const c = resolveColor(f.project_id, byId) ?? "var(--text-muted)";
              const proj = byId.get(f.project_id);
              return (
                <div className="ca-veha" key={`ms-${f.id}`} data-testid={`ca-veha-${f.id}`}>
                  <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 1v10" stroke={c} strokeWidth="1.4" fill="none" />
                    <path d="M2 1.5h6l-1.4 2L8 5.5H2z" fill={c} />
                  </svg>
                  <span className="vn">{f.name}</span>
                  <span className="vtag">веха</span>
                  {proj && <span className="vt">{proj.name}</span>}
                </div>
              );
            })}
            {items.length === 0 && flags.length === 0 ? (
              <div className="ca-free">свободно</div>
            ) : (
              items.map(renderTask)
            )}
          </div>
        );
      })}
    </div>
  );
}
