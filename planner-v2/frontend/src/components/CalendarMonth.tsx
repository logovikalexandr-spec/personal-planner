import { useMemo } from "react";
import { TaskItem } from "./TaskItem";
import { dowShort, localISO, monthMatrix, sameDay } from "../lib/calDates";
import { resolveColor } from "../lib/projectColor";
import type { Milestone, Project, Task } from "../types";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function Flag({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
      <path d="M2 1v10" stroke={color} strokeWidth="1.4" fill="none" />
      <path d="M2 1.5h6l-1.4 2L8 5.5H2z" fill={color} />
    </svg>
  );
}

/**
 * Месяц = обзор спреда и дедлайнов. Точки = задачи (цвет проекта, макс 3 +N),
 * флажки = вехи этапов. Тап дня → выбор + панель дня под сеткой (flow 10).
 * Сводка вех месяца + легенда проектов. НЕ планирование (это в «Неделе»).
 */
export function CalendarMonth({
  month, tasks, milestones, byId, today, selected, onTapDay, onOpenTask, onToggle,
}: {
  month: Date;
  tasks: Task[];
  milestones: Milestone[];
  byId: Map<number, Project>;
  today: Date;
  selected: Date | null;
  onTapDay: (d: Date) => void;
  onOpenTask: (t: Task) => void;
  onToggle: (t: Task) => void;
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

  // вехи текущего месяца, по дате
  const monthMs = useMemo(
    () => milestones
      .filter((ms) => {
        const d = ms.milestone_date.split("-").map(Number);
        return d[0] === month.getFullYear() && d[1] - 1 === month.getMonth();
      })
      .sort((a, b) => a.milestone_date.localeCompare(b.milestone_date)),
    [milestones, month],
  );

  const selISO = selected ? localISO(selected) : null;
  const selTasks = selISO ? (tasksByDay.get(selISO) ?? []) : [];

  return (
    <div className="cm" data-testid="cal-month">
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
          const isSel = selected != null && sameDay(d, selected);
          const we = (d.getDay() + 6) % 7 >= 5;
          const dayTasks = tasksByDay.get(iso) ?? [];
          const flags = flagsByDay.get(iso) ?? [];
          const dots = dayTasks.slice(0, 3);
          const extra = dayTasks.length - dots.length;
          return (
            <button
              key={iso}
              data-testid={`cm-cell-${iso}`}
              className={`cm-cell${out ? " out" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}${we ? " we" : ""}`}
              onClick={() => onTapDay(d)}
              aria-label={`${d.getDate()} ${dowShort(d)}`}
            >
              <div className="cm-num">{d.getDate()}</div>
              {flags.slice(0, 1).map((f) => (
                <div className="cm-flag" key={f.id} title={f.name}>
                  <Flag color={resolveColor(f.project_id, byId) ?? "var(--text-muted)"} />
                  <span className="ft">{f.name}</span>
                </div>
              ))}
              {dots.length > 0 && (
                <div className="cm-dots">
                  {dots.map((t) => (
                    <span key={t.id} className="cm-pt" style={{ background: resolveColor(t.project_id, byId) ?? "var(--text-muted)" }} />
                  ))}
                  {extra > 0 && <span className="cm-more">+{extra}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* сводка вех месяца */}
      <div className="cm-mstrip" data-testid="cm-mstrip">
        <div className="cap">Вехи · {monthMs.length}</div>
        {monthMs.length === 0 ? (
          <div className="cm-mempty">
            <Flag color="var(--text-muted)" />В этом месяце нет вех-рубежей
          </div>
        ) : (
          <div className="cm-mchips">
            {monthMs.map((ms) => {
              const dd = ms.milestone_date.split("-");
              return (
                <div className="cm-mchip" key={ms.id}>
                  <Flag color={resolveColor(ms.project_id, byId) ?? "var(--text-muted)"} />
                  <span className="dt">{dd[2]}.{dd[1]}</span> {ms.name}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* панель выбранного дня под сеткой (flow 10) */}
      {selected && (
        <div className="cm-daypanel" data-testid="cm-daypanel">
          <div className="cm-dp-hdr">
            <span className="d">{dowShort(selected)} {selected.getDate()} {MONTHS_GEN[selected.getMonth()]}</span>
            <span className="cnt">{selTasks.length === 0 ? "нет задач" : `${selTasks.length} задач`}</span>
          </div>
          {selTasks.length === 0 ? (
            <div className="cm-dp-empty">На этот день задач нет</div>
          ) : (
            selTasks.map((t) => (
              // общий TaskItem (как в Today/Списках/Ленте) — единый дизайн карточек
              <div className="cm-dp-item" key={t.id} data-testid={`cm-dp-task-${t.id}`}>
                <TaskItem task={t} onToggle={onToggle} onOpen={onOpenTask} color={resolveColor(t.project_id, byId)} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
