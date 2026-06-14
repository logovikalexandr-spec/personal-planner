import { useMemo } from "react";
import { IcoCheck } from "./icons";
import { addDays, fmtAgendaDay, localISO, parseISO } from "../lib/calDates";
import { resolveColor, tint } from "../lib/projectColor";
import type { Milestone, Project, Task } from "../types";

const HORIZON = 14; // сколько дней вперёд показывает лента
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function fmtWasDate(iso: string): string {
  const d = parseISO(iso);
  return `было ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

function TaskRow({ t, byId, onToggle, onOpen, overdue }: {
  t: Task; byId: Map<number, Project>; onToggle: (t: Task) => void; onOpen: (t: Task) => void; overdue?: boolean;
}) {
  const c = resolveColor(t.project_id, byId);
  const cm = c ?? "var(--text-muted)";
  const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
  const done = t.status === "done";
  return (
    <div
      className={`ca-task${overdue ? " od" : ""}`}
      data-testid={`ca-task-${t.id}`}
      style={{ ["--c" as string]: cm }}
      onClick={() => onOpen(t)}
    >
      <button
        className={`ca-chk${done ? " done" : ""}`}
        style={{ borderColor: cm, background: done ? cm : undefined }}
        onClick={(e) => { e.stopPropagation(); onToggle(t); }}
        aria-label={done ? "Снять отметку" : "Выполнить"}
      >
        {done && <IcoCheck />}
      </button>
      <div className="ca-body">
        <div className={`ca-name${done ? " done" : ""}`}>{t.title}</div>
        <div className="ca-sub">
          {overdue && t.due_date && <span className="ca-od-date">{fmtWasDate(t.due_date)}</span>}
          {!overdue && t.due_time && <span className="ca-time">{t.due_time.slice(0, 5)}</span>}
          {proj && !proj.is_inbox && (
            <span className="ca-cant" style={{ color: cm, background: tint(c, 0.13) }}>{proj.name}</span>
          )}
          {t.stage_label && <span className="ca-cant ca-stage">{t.stage_label}</span>}
          {t.priority === "high" && <span className="ca-cant ca-danger">важно</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Лента (Agenda) — вертикальный скан ближайших дней (Things-стиль Upcoming).
 * Просрочка закреплена сверху (forward-скан теряет хвосты). Вехи-рубежи —
 * отдельной строкой без чекбокса. Чекбокс прямо в строке, метка проекта/этапа,
 * high-приоритет = красный бейдж. Пустые дни — тонкая строка «свободно».
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

  return (
    <div className="ca" data-testid="cal-agenda">
      {overdue.length > 0 && (
        <div className="ca-day" data-testid="ca-overdue">
          <div className="ca-od-hdr"><span className="d">Просрочено · {overdue.length}</span></div>
          <div className="ca-od-rule" />
          {overdue.map((t) => (
            <TaskRow key={t.id} t={t} byId={byId} onToggle={onToggle} onOpen={onOpen} overdue />
          ))}
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
              items.map((t) => (
                <TaskRow key={t.id} t={t} byId={byId} onToggle={onToggle} onOpen={onOpen} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
