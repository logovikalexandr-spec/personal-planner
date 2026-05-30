import { useEffect, useMemo, useState } from "react";
import { getDayTasks, getProjects, patchTask } from "../api";
import { DayTimeline } from "../components/DayTimeline";
import { TaskComposer } from "../components/TaskComposer";
import { tg } from "../telegram";
import type { Project, Task } from "../types";

function localISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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

  const d1 = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(day);
  const d2 = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(day);

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

      <DayTimeline
        tasks={tasks}
        byId={byId}
        isToday={isToday}
        autoScroll
        onTapHour={(h) => setAddHour(h)}
        onToggle={toggle}
      />

      {addHour != null && (
        <TaskComposer
          initialDate={iso}
          initialTime={`${`${addHour}`.padStart(2, "0")}:00:00`}
          initialEnd={`${`${Math.min(addHour + 1, 23)}`.padStart(2, "0")}:00:00`}
          onClose={() => setAddHour(null)}
          onSaved={() => { setAddHour(null); load(); }}
        />
      )}
    </div>
  );
}
