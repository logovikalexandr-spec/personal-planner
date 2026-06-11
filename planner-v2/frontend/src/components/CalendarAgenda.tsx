import { useMemo } from "react";
import { IcoCheck } from "./icons";
import { addDays, fmtAgendaDay, localISO } from "../lib/calDates";
import { resolveColor, tint } from "../lib/projectColor";
import type { Project, Task } from "../types";

const HORIZON = 14; // сколько дней вперёд показывает лента

/**
 * Лента (Agenda) — вертикальный скан ближайших дней (Things-стиль Upcoming).
 * Чекбокс прямо в строке, метка проекта, время слева, high-приоритет = красный бейдж.
 * Пустые дни — тонкая строка «свободно», чтобы лента не рвалась.
 */
export function CalendarAgenda({
  start, tasks, byId, onToggle, onOpen,
}: {
  start: Date;
  tasks: Task[];
  byId: Map<number, Project>;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
}) {
  const today = useMemo(() => new Date(), []);

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

  const days = useMemo(
    () => Array.from({ length: HORIZON }, (_, i) => addDays(start, i)),
    [start],
  );

  return (
    <div className="ca">
      {days.map((d, idx) => {
        const iso = localISO(d);
        const items = byDay.get(iso) ?? [];
        const { label, meta } = fmtAgendaDay(d, today);
        return (
          <div className="ca-day" key={iso}>
            <div className={`ca-hdr${idx === 0 ? " first" : ""}`}>
              <span className="d">{label}</span>
              {meta && <span className="meta">{meta}</span>}
            </div>
            <div className="ca-rule" />
            {items.length === 0 ? (
              <div className="ca-free">свободно</div>
            ) : (
              items.map((t) => {
                const c = resolveColor(t.project_id, byId);
                const cm = c ?? "var(--text-muted)";
                const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
                const done = t.status === "done";
                return (
                  <div
                    className="ca-task"
                    key={t.id}
                    style={{ ["--c" as string]: cm }}
                    onClick={() => onOpen(t)}
                  >
                    <button
                      className={`ca-chk${done ? " done" : ""}`}
                      style={{ ["--cm" as string]: cm }}
                      onClick={(e) => { e.stopPropagation(); onToggle(t); }}
                      aria-label={done ? "Снять отметку" : "Выполнить"}
                    >
                      {done && <IcoCheck />}
                    </button>
                    <div className="ca-body">
                      <div className={`ca-name${done ? " done" : ""}`}>{t.title}</div>
                      <div className="ca-sub">
                        {t.due_time && <span className="ca-time">{t.due_time.slice(0, 5)}</span>}
                        {proj && !proj.is_inbox && (
                          <span
                            className="ca-cant"
                            style={{ color: cm, background: tint(c, 0.13) }}
                          >
                            {proj.name}
                          </span>
                        )}
                        {t.priority === "high" && <span className="ca-cant ca-danger">важно</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
