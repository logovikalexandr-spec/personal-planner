import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteTask, getMilestones, getProjects, getTasks, getTasksRange, patchTask } from "../api";
import { useRefreshSignal } from "../lib/refreshSignal";
import { CalendarDays } from "../components/CalendarDays";
import { CalendarWeek } from "../components/CalendarWeek";
import { CalendarMonth } from "../components/CalendarMonth";
import { CalendarAgenda } from "../components/CalendarAgenda";
import { TaskComposer } from "../components/TaskComposer";
import { TaskDetail } from "../components/TaskDetail";
import {
  addDays, daysList, fmtMonthYear, fmtWeekRange, localISO, monthMatrix, sameDay,
} from "../lib/calDates";
import { resolveColor } from "../lib/projectColor";
import { tg } from "../telegram";
import { confirmDialog } from "../lib/confirm";
import type { CalendarView, DayCount, Milestone, Project, Task } from "../types";

type Status = "loading" | "ready" | "error";

const DAY_COUNTS: DayCount[] = [2, 3, 4, 7];
const DAYCOUNT_KEY = "cal.dayCount";

function loadDayCount(): DayCount {
  const raw = Number(localStorage.getItem(DAYCOUNT_KEY));
  return DAY_COUNTS.includes(raw as DayCount) ? (raw as DayCount) : 2;
}

/** Окно дат текущего вида: [from, to] ISO (включительно) для range-запроса. */
function viewWindow(view: CalendarView, anchor: Date, today: Date, dayCount: DayCount): { from: string; to: string } {
  if (view === "days") {
    const d = daysList(anchor, dayCount);
    return { from: localISO(d[0]), to: localISO(d[d.length - 1]) };
  }
  if (view === "month") {
    const cells = monthMatrix(anchor.getFullYear(), anchor.getMonth());
    return { from: localISO(cells[0]), to: localISO(cells[41]) };
  }
  return { from: localISO(today), to: localISO(addDays(today, 14)) };
}

export function Calendar({ onOpenDay }: { onOpenDay: (iso: string) => void }) {
  const [view, setView] = useState<CalendarView>("days");
  const [dayCount, setDayCount] = useState<DayCount>(loadDayCount);
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
  const [trayOpen, setTrayOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const today = useMemo(() => new Date(), []);
  const win = useMemo(() => viewWindow(view, anchor, today, dayCount), [view, anchor, today, dayCount]);
  const days = useMemo(() => daysList(anchor, dayCount), [anchor, dayCount]);

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
      if (view === "days") {
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
  useRefreshSignal(load); // pull-to-refresh

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

  // удаление задачи из ленты (свайп «Удалить») — подтверждение через TG, потом DELETE + рефетч
  function removeTask(t: Task) {
    confirmDialog(`Удалить «${t.title}»?`).then((ok) => { if (ok) deleteTask(t.id).then(bump).catch(() => {}); });
  }

  // drag блока в колонке «Дни»: оптимистично меняем время → патч в фоне (как Today.resize).
  const resize = useCallback((t: Task, patch: { due_time: string; end_time: string }) => {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, due_time: patch.due_time, end_time: patch.end_time } : x)));
    patchTask(t.id, patch).catch(() => bump());
  }, []);

  function shift(delta: number) {
    const d = new Date(anchor);
    if (view === "days") d.setDate(d.getDate() + delta * dayCount);
    else if (view === "month") d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  }

  // смена кол-ва дней: запоминаем + переякориваем на сегодня (окно предсказуемо стартует с текущего дня)
  function changeDayCount(n: DayCount) {
    setDayCount(n);
    localStorage.setItem(DAYCOUNT_KEY, String(n));
    setAnchor(new Date());
  }

  function goToday() {
    setAnchor(new Date());
    setSelected(new Date());
  }

  const isCurrentPeriod =
    view === "days" ? days.some((d) => sameDay(d, today))
    : view === "month" ? anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth()
    : true;

  const rangeLabel =
    view === "days" ? fmtWeekRange(days)
    : view === "month" ? fmtMonthYear(anchor)
    : "Ближайшие 14 дней";

  const showNav = view !== "agenda";

  return (
    <div className="cal2" data-testid="screen-calendar" data-view={view}>
      <div style={{ padding: "var(--s5) var(--s4) 0" }}>
        <div className="cal2-head">
          <h1>Календарь</h1>
          {!isCurrentPeriod && <button className="cal2-today" data-testid="cal-today" onClick={goToday}>Сегодня</button>}
        </div>
        <div className="seg" role="tablist">
          <button className={view === "days" ? "seg-on" : ""} data-testid="seg-days" onClick={() => setView("days")}>Дни</button>
          <button className={view === "month" ? "seg-on" : ""} data-testid="seg-month" onClick={() => setView("month")}>Месяц</button>
          <button className={view === "agenda" ? "seg-on" : ""} data-testid="seg-agenda" onClick={() => setView("agenda")}>Лента</button>
        </div>
        <div className="cal2-range">
          {showNav && <button className="nav" data-testid="cal-prev" aria-label="Назад" onClick={() => shift(-1)}>‹</button>}
          <span className="rlbl" data-testid="cal-range">{rangeLabel}</span>
          {showNav && <button className="nav" data-testid="cal-next" aria-label="Вперёд" onClick={() => shift(1)}>›</button>}
          {view === "days" && (
            <div className="cal2-dstep" role="group" aria-label="Кол-во дней">
              {DAY_COUNTS.map((n) => (
                <button
                  key={n}
                  className={`${dayCount === n ? "on" : ""}${n === 7 ? " seven" : ""}`}
                  data-testid={`dstep-${n}`}
                  aria-label={n === 7 ? "Неделя" : `${n} дня`}
                  aria-pressed={dayCount === n}
                  onClick={() => changeDayCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
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
        ) : view === "days" && dayCount === 7 ? (
          // «7» = точно старый недельный вид (CalendarWeek), как просил владелец
          <CalendarWeek
            weekStart={days[0]}
            tasks={tasks}
            milestones={milestones}
            byId={byId}
            today={today}
            onTapBlock={(t) => setOpenedId(t.id)}
            onTapSlot={(d, h) => setComposer({ date: localISO(d), time: `${`${Math.max(0, Math.min(23, h))}`.padStart(2, "0")}:00:00` })}
          />
        ) : view === "days" ? (
          <CalendarDays
            days={days}
            tasks={tasks}
            milestones={milestones}
            byId={byId}
            today={today}
            onOpenTask={(t) => setOpenedId(t.id)}
            onOpenDay={(d) => onOpenDay(localISO(d))}
            onToggle={toggle}
            onResize={resize}
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
            onToggle={toggle}
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
            onSwipeComplete={toggle}
            onSwipeEdit={(t) => setOpenedId(t.id)}
            onSwipeDelete={removeTask}
          />
        )}
      </div>

      {/* ЛОТОК «Без даты» (A8) — шелф над таб-баром, СИБЛИНГ скролла (не клипается overflow). */}
      {view === "days" && status === "ready" && (
        <div className="cw-tray" data-testid="cw-tray" data-open={trayOpen ? "1" : "0"}>
          <button className="cw-th" onClick={() => setTrayOpen((v) => !v)} aria-expanded={trayOpen}>
            <span className="cw-grab" />
            <span className="t">Без даты · <b>{undated.length}</b></span>
            <span className="cl">{trayOpen ? "⌄ свернуть" : "⌃ потяни"}</span>
          </button>
          {trayOpen && (
            undated.length > 0 ? (
              <div className="cw-ucards">
                {undated.map((t) => {
                  const c = resolveColor(t.project_id, byId);
                  const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
                  return (
                    <button
                      key={t.id}
                      className="cw-ucard"
                      style={{ ["--c" as string]: c ?? "var(--accent)" }}
                      onClick={() => setOpenedId(t.id)}
                    >
                      <div className="nm">{t.title}</div>
                      {proj && !proj.is_inbox && <div className="pr">{proj.name}</div>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cw-tray-empty">Все задачи на датах</div>
            )
          )}
        </div>
      )}

      {composer && (
        <TaskComposer
          initialDate={composer.date}
          initialTime={composer.time ?? undefined}
          onClose={() => setComposer(null)}
          onSaved={() => { setComposer(null); bump(); }}
        />
      )}
      {openedId != null && (
        // полноэкранный оверлей (как на табе «Задачи»), а не в потоке снизу
        <div className="detail-overlay">
          <TaskDetail taskId={openedId} onClose={() => setOpenedId(null)} onChanged={bump} onOpenTask={(id) => setOpenedId(id)} />
        </div>
      )}
    </div>
  );
}
