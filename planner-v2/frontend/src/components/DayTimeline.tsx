import { memo, useEffect, useMemo, useRef, useState } from "react";
import { IcoBellMicro, IcoRepeatMicro, IcoCheck } from "./icons";
import type { Priority, Project, Task } from "../types";

const HOUR_H = 56;
const START_HOUR = 5; // таймлайн начинается с 05:00 (ночь 00–04 скрыта, если на неё нет задач)

function parseMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}
function resolveColor(projectId: number | null, byId: Map<number, Project>): string | null {
  let cur = projectId != null ? byId.get(projectId) : undefined;
  let g = 0;
  while (cur && g++ < 8) {
    if (cur.color) return cur.color;
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

/** Единый маппинг приоритета → цвет канта (общий с TaskItem). */
export function priorityColor(priority: Priority): string | null {
  if (priority === "high") return "var(--danger)";
  if (priority === "medium") return "var(--warning)";
  if (priority === "low") return "var(--accent)";
  return null;
}

export const DayTimeline = memo(function DayTimeline({
  tasks, byId, isToday, onTapHour, onToggle, onOpen, autoScroll = true,
}: {
  tasks: Task[];
  byId: Map<number, Project>;
  isToday: boolean;
  onTapHour: (hour: number) => void;
  onToggle: (t: Task) => void;
  onOpen?: (t: Task) => void;
  autoScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timed = useMemo(() => tasks.filter((t) => t.due_time), [tasks]);

  // Начало сетки: 05:00, но растягиваем раньше, если есть задача до 05:00 (edge — задача не теряется).
  const startHour = useMemo(() => {
    let min = START_HOUR;
    for (const t of timed) {
      const m = parseMin(t.due_time);
      if (m != null) min = Math.min(min, Math.floor(m / 60));
    }
    return min;
  }, [timed]);
  const HOURS = useMemo(
    () => Array.from({ length: 24 - startHour }, (_, i) => startHour + i),
    [startHour],
  );
  const offsetMin = startHour * 60;

  // Поминутный пересчёт линии «сейчас» (мгновенный, без transition — §6).
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    if (!isToday) return;
    const id = window.setInterval(() => {
      setNowMin(new Date().getHours() * 60 + new Date().getMinutes());
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isToday]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const focusHour = isToday ? new Date().getHours() : 9;
    el.scrollTop = Math.max(0, (focusHour - startHour) * HOUR_H - HOUR_H);
  }, [autoScroll, isToday, startHour]);

  return (
    <div className={`cal-scroll ${autoScroll ? "" : "daytimeline--static"}`} ref={scrollRef} style={{ flex: autoScroll ? 1 : "none" }}>
      <div className="cal-grid" style={{ height: HOURS.length * HOUR_H }}>
        {HOURS.map((h) => (
          <div key={h} className="cal-hour" style={{ height: HOUR_H }} onClick={() => onTapHour(h)}>
            <span className="cal-hourlabel">{`${h}`.padStart(2, "0")}:00</span>
          </div>
        ))}

        {isToday && nowMin >= offsetMin && (
          <div className="cal-now" style={{ top: ((nowMin - offsetMin) / 60) * HOUR_H }} />
        )}

        {timed.map((t) => {
          const start = parseMin(t.due_time)!;
          const endRaw = parseMin(t.end_time);
          const dur = endRaw && endRaw > start ? endRaw - start : 60;
          const c = resolveColor(t.project_id, byId);
          const prio = priorityColor(t.priority);
          const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
          return (
            <div
              key={t.id}
              className={`cal-block ${t.status === "done" ? "done" : ""}`}
              style={{
                top: ((start - offsetMin) / 60) * HOUR_H + 1,
                height: Math.max((dur / 60) * HOUR_H - 2, 22),
                borderLeftColor: prio ?? c ?? "var(--accent)",
                background: c ? `${c}22` : "var(--surface-2)",
              }}
              onClick={(e) => { e.stopPropagation(); onOpen?.(t); }}
            >
              <div
                className={`cal-cb ${t.status === "done" ? "done" : ""}`}
                onClick={(e) => { e.stopPropagation(); onToggle(t); }}
                role="button"
                aria-label="done"
              >
                {t.status === "done" ? <IcoCheck /> : null}
              </div>
              <div className="cal-block-main">
                <div className="bt">{proj?.icon ? `${proj.icon} ` : ""}{t.title}</div>
                <div className="bm">
                  <span>{hhmm(start)}{endRaw && endRaw > start ? `–${hhmm(endRaw)}` : ""}</span>
                  {t.recurrence ? <IcoRepeatMicro /> : null}
                  {t.reminder_at ? <IcoBellMicro /> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
