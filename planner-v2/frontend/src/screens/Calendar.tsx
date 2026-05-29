import { useEffect, useMemo, useRef, useState } from "react";
import { createTask, getDayTasks, getProjects, patchTask } from "../api";
import { AddSheet } from "../components/AddSheet";
import { tg } from "../telegram";
import type { Priority, Project, Task } from "../types";

const HOUR_H = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function localISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
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

export function Calendar() {
  const [day, setDay] = useState<Date>(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [addHour, setAddHour] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const iso = localISO(day);
  const isToday = iso === localISO(new Date());

  async function load() {
    const [ts, ps] = await Promise.all([getDayTasks(iso), getProjects()]);
    setTasks(ts);
    setById(new Map(ps.map((p) => [p.id, p])));
  }

  useEffect(() => {
    load().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusHour = isToday ? new Date().getHours() : 7;
    el.scrollTop = Math.max(0, focusHour * HOUR_H - HOUR_H);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  const timed = useMemo(() => tasks.filter((t) => t.due_time), [tasks]);
  const untimed = useMemo(() => tasks.filter((t) => !t.due_time), [tasks]);

  function shiftDay(delta: number) {
    const d = new Date(day);
    d.setDate(d.getDate() + delta);
    setDay(d);
  }

  async function toggle(t: Task) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    load();
  }

  async function addAt(title: string, prio: Priority) {
    if (addHour == null) return;
    const start = `${`${addHour}`.padStart(2, "0")}:00:00`;
    const end = `${`${Math.min(addHour + 1, 23)}`.padStart(2, "0")}:00:00`;
    await createTask(title, { priority: prio, due_date: iso, due_time: start, end_time: end });
    setAddHour(null);
    load();
  }

  const d1 = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(day);
  const d2 = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(day);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="screen" style={{ paddingLeft: 0, paddingRight: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => shiftDay(-1)} aria-label="Назад">‹</button>
        <div className="cal-title">
          <div className="d1">{d1}</div>
          <div className="d2">{d2}</div>
        </div>
        {!isToday && <button className="cal-today" onClick={() => setDay(new Date())}>Сегодня</button>}
        <button className="cal-nav" onClick={() => shiftDay(1)} aria-label="Вперёд">›</button>
      </div>

      {untimed.length > 0 && (
        <div className="cal-allday">
          {untimed.map((t) => {
            const c = resolveColor(t.project_id, byId);
            return (
              <span
                key={t.id}
                className={`cal-chip ${t.status === "done" ? "done" : ""}`}
                style={c ? { borderLeftColor: c } : undefined}
                onClick={() => toggle(t)}
              >
                {t.title}
              </span>
            );
          })}
        </div>
      )}

      <div className="cal-scroll" ref={scrollRef} style={{ flex: 1 }}>
        <div className="cal-grid" style={{ height: HOURS.length * HOUR_H }}>
          {HOURS.map((h) => (
            <div key={h} className="cal-hour" style={{ height: HOUR_H }} onClick={() => setAddHour(h)}>
              <span className="cal-hourlabel">{`${h}`.padStart(2, "0")}:00</span>
            </div>
          ))}

          {isToday && (
            <div className="cal-now" style={{ top: (nowMin / 60) * HOUR_H }} />
          )}

          {timed.map((t) => {
            const start = parseMin(t.due_time)!;
            const endRaw = parseMin(t.end_time);
            const dur = endRaw && endRaw > start ? endRaw - start : 60;
            const c = resolveColor(t.project_id, byId);
            const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
            return (
              <div
                key={t.id}
                className={`cal-block ${t.status === "done" ? "done" : ""}`}
                style={{
                  top: (start / 60) * HOUR_H + 1,
                  height: Math.max((dur / 60) * HOUR_H - 2, 22),
                  borderLeftColor: c ?? "var(--accent)",
                  background: c ? `${c}22` : "var(--surface-2)",
                }}
                onClick={(e) => { e.stopPropagation(); toggle(t); }}
              >
                <div className="bt">{proj?.icon ? `${proj.icon} ` : ""}{t.title}</div>
                <div className="bm">
                  {hhmm(start)}{endRaw && endRaw > start ? `–${hhmm(endRaw)}` : ""}
                  {t.recurrence ? "  🔁" : ""}{t.reminder_at ? "  ⏰" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {addHour != null && (
        <AddSheet onClose={() => setAddHour(null)} onAdd={addAt} />
      )}
    </div>
  );
}
