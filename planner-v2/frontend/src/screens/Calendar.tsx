import { useCallback, useEffect, useMemo, useState } from "react";
import { getMilestones, getProjects, getTasks, getTasksRange, patchTask } from "../api";
import { CalendarWeek } from "../components/CalendarWeek";
import { CalendarMonth } from "../components/CalendarMonth";
import { CalendarAgenda } from "../components/CalendarAgenda";
import { TaskComposer } from "../components/TaskComposer";
import { TaskDetail } from "../components/TaskDetail";
import {
  addDays, fmtMonthYear, fmtWeekRange, localISO, monthMatrix, sameDay, weekDays,
} from "../lib/calDates";
import { tg } from "../telegram";
import type { CalendarView, Milestone, Project, Task } from "../types";

type Status = "loading" | "ready" | "error";

/** Окно дат текущего вида: [from, to] ISO (включительно) для range-запроса. */
function viewWindow(view: CalendarView, anchor: Date, today: Date): { from: string; to: string } {
  if (view === "week") {
    const d = weekDays(anchor);
    return { from: localISO(d[0]), to: localISO(d[6]) };
  }
  if (view === "month") {
    const cells = monthMatrix(anchor.getFullYear(), anchor.getMonth());
    return { from: localISO(cells[0]), to: localISO(cells[41]) };
  }
  return { from: localISO(today), to: localISO(addDays(today, 14)) };
}

export function Calendar() {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [status, setStatus] = useState<Status>("loading");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [undated, setUndated] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [composer, setComposer] = useState<{ date: string; time: string | null } | null>(null);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const today = useMemo(() => new Date(), []);
  const win = useMemo(() => viewWindow(view, anchor, today), [view, anchor, today]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const reqs: [Promise<Task[]>, Promise<Milestone[]>, Promise<Project[]>] = [
        getTasksRange(win.from, win.to),
        getMilestones(win.from, win.to),
        getProjects(),
      ];
      const [ts, ms, ps] = await Promise.all(reqs);
      setTasks(ts);
      setMilestones(ms);
      setById(new Map(ps.map((p) => [p.id, p])));
      if (view === "week") {
        const all = await getTasks("all");
        setUndated(all.filter((t) => !t.due_date && t.status !== "done" && t.status !== "wont_do"));
      }
      if (view === "agenda") {
        setOverdue(await getTasks("overdue"));
      }
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [win.from, win.to, view]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const bump = () => setReloadKey((k) => k + 1);

  async function toggle(t: Task) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    // оптимистично
    const next = t.status === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    setOverdue((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    await patchTask(t.id, { status: next });
    bump();
  }

  function shift(delta: number) {
    const d = new Date(anchor);
    if (view === "week") d.setDate(d.getDate() + delta * 7);
    else if (view === "month") d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  }

  function goToday() {
    setAnchor(new Date());
    setSelected(new Date());
  }

  const isCurrentPeriod =
    view === "week" ? weekDays(anchor).some((d) => sameDay(d, today))
    : view === "month" ? anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth()
    : true;

  const rangeLabel =
    view === "week" ? fmtWeekRange(weekDays(anchor))
    : view === "month" ? fmtMonthYear(anchor)
    : "Ближайшие 14 дней";

  const showNav = view !== "agenda";

  return (
    <div className="cal2" data-testid="screen-calendar" data-view={view}>
      <div style={{ padding: "var(--s5) var(--s4) 0" }}>
        <h1>Календарь</h1>
        <div className="seg" role="tablist">
          <button className={view === "week" ? "seg-on" : ""} data-testid="seg-week" onClick={() => setView("week")}>Неделя</button>
          <button className={view === "month" ? "seg-on" : ""} data-testid="seg-month" onClick={() => setView("month")}>Месяц</button>
          <button className={view === "agenda" ? "seg-on" : ""} data-testid="seg-agenda" onClick={() => setView("agenda")}>Лента</button>
        </div>
        <div className="cal2-range">
          {showNav && <button className="nav" data-testid="cal-prev" aria-label="Назад" onClick={() => shift(-1)}>‹</button>}
          <span className="rlbl" data-testid="cal-range">{rangeLabel}</span>
          {showNav && <button className="nav" data-testid="cal-next" aria-label="Вперёд" onClick={() => shift(1)}>›</button>}
          {!isCurrentPeriod && <button className="cal2-today" data-testid="cal-today" onClick={goToday}>Сегодня</button>}
        </div>
      </div>

      <div className="cal2-scroll">
        {status === "error" ? (
          <div className="cal-state" data-testid="cal-error">
            <div className="ttl">Не удалось загрузить</div>
            <div className="sub">Проверь соединение и попробуй ещё раз.</div>
            <button className="retry" onClick={load}>Повторить</button>
          </div>
        ) : status === "loading" ? (
          <div className="cal-skel" data-testid="cal-loading">
            {Array.from({ length: 7 }, (_, i) => <div className="col skeleton" key={i} />)}
          </div>
        ) : view === "week" ? (
          <CalendarWeek
            weekStart={weekDays(anchor)[0]}
            tasks={tasks}
            undated={undated}
            milestones={milestones}
            byId={byId}
            today={today}
            onTapBlock={(t) => setOpenedId(t.id)}
            onTapSlot={(d, h) => setComposer({ date: localISO(d), time: `${`${Math.max(0, Math.min(23, h))}`.padStart(2, "0")}:00:00` })}
            onOpenUndated={(t) => setOpenedId(t.id)}
          />
        ) : view === "month" ? (
          <CalendarMonth
            month={anchor}
            tasks={tasks}
            milestones={milestones}
            byId={byId}
            today={today}
            selected={selected}
            onTapDay={(d) => setSelected(d)}
            onOpenTask={(t) => setOpenedId(t.id)}
          />
        ) : (
          <CalendarAgenda
            start={today}
            tasks={tasks}
            overdue={overdue}
            milestones={milestones}
            byId={byId}
            today={today}
            onToggle={toggle}
            onOpen={(t) => setOpenedId(t.id)}
          />
        )}
      </div>

      {composer && (
        <TaskComposer
          initialDate={composer.date}
          initialTime={composer.time ?? undefined}
          onClose={() => setComposer(null)}
          onSaved={() => { setComposer(null); bump(); }}
        />
      )}
      {openedId != null && (
        <TaskDetail taskId={openedId} onClose={() => setOpenedId(null)} onChanged={bump} onOpenTask={(id) => setOpenedId(id)} />
      )}
    </div>
  );
}
