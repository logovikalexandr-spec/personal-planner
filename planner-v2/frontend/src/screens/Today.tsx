import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DayTimeline, priorityColor } from "../components/DayTimeline";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { QuickAddBar } from "../components/QuickAddBar";
import { IcoBack, IcoChevron, IcoInbox } from "../components/icons";
import { getDayTasks, getProjects, getTasks, patchTask } from "../api";
import { tg } from "../telegram";
import type { ParseResult } from "../lib/quickParse";
import type { Project, Task } from "../types";

const FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
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

type LoadState = "loading" | "error" | "ready";

export function Today({
  reloadKey, onTapHour, onOpenTask, view, onViewChange, onOpenInbox, onQuickAdd, inboxCount,
}: {
  reloadKey: number;
  onTapHour: (hour: number) => void;
  onOpenTask?: (t: Task) => void;
  view: "timeline" | "tasks";
  onViewChange: (v: "timeline" | "tasks") => void;
  onOpenInbox: () => void;
  onQuickAdd: (p: ParseResult) => void;
  inboxCount: number;
}) {
  const iso = localToday();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [state, setState] = useState<LoadState>("loading");
  const [showDone, setShowDone] = useState(false);
  const firstRef = useRef(true); // скелетон/ошибку показываем только на первой загрузке, рефетчи — без мигания

  const load = useCallback(async () => {
    if (firstRef.current) setState("loading");
    try {
      const [ts, ps, ov] = await Promise.all([getDayTasks(iso), getProjects(), getTasks("overdue")]);
      setTasks(ts);
      setById(new Map(ps.map((p) => [p.id, p])));
      setOverdue(ov);
      firstRef.current = false;
      setState("ready");
    } catch {
      if (firstRef.current) setState("error");
    }
  }, [iso]);

  useEffect(() => {
    load().catch(() => {});
  }, [reloadKey, load]);

  const toggle = useCallback(async (t: Task) => {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    load();
  }, [load]);

  // ресайз/перенос блока: оптимистично меняем время локально (мгновенно, без рефетча
  // и мигания скелетоном) → патч в фоне; при ошибке тихо ресинкаем.
  const resize = useCallback((t: Task, patch: { due_time: string; end_time: string }) => {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, due_time: patch.due_time, end_time: patch.end_time } : x)));
    patchTask(t.id, patch).catch(() => load());
  }, [load]);

  const timed = useMemo(() => tasks.filter((t) => t.due_time), [tasks]);
  // all-day = с датой на сегодня, но без времени; открытые (не done/wont_do)
  const allday = useMemo(
    () => tasks.filter((t) => !t.due_time && t.status !== "done" && t.status !== "wont_do"),
    [tasks],
  );
  const closed = useMemo(
    () => tasks.filter((t) => t.status === "done" || t.status === "wont_do"),
    [tasks],
  );

  const jumpNow = useCallback(() => {
    document.getElementById("today-now")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const renderList = (items: Task[]) => (
    <div className="list">
      {items.map((t) => (
        <TaskItem key={t.id} task={t} onToggle={toggle} onOpen={onOpenTask} color={resolveColor(t.project_id, byId)} />
      ))}
    </div>
  );

  const skeleton = (
    <div className="today-pad" aria-busy="true" style={{ marginTop: "var(--s4)" }}>
      {[0, 1, 2].map((i) => <div key={i} className="lists-skeleton-row" />)}
    </div>
  );
  const errorBlock = (
    <div className="today-pad" style={{ marginTop: "var(--s4)" }}>
      <div className="card" style={{ textAlign: "center" }}>
        <div className="muted">Не удалось загрузить</div>
        <button className="btn btn-ghost" style={{ marginTop: "var(--s3)" }} onClick={() => load()}>Повторить</button>
      </div>
    </div>
  );

  // ── вид «Таймлайн» (главный) ────────────────────────────────────────────
  if (view === "timeline") {
    return (
      <div className="screen today">
        <div className="today-head">
          <div className="screen-hero today-pad today-hero-row">
            <div>
              <h1>Сегодня</h1>
              <div className="date today-date" style={{ textTransform: "capitalize" }}>{FMT.format(new Date())}</div>
              {tasks.length > 0 && (
                <div className="today-summary">{tasks.length} задач · {closed.length} закрыто</div>
              )}
            </div>
            <button className="cal-today" onClick={jumpNow}>Сегодня</button>
          </div>
          {allday.length > 0 && (
            <div className="cal-allday today-pad">
              <span className="cal-allday-label">весь<br />день</span>
              <div className="cal-allday-chips">
                {allday.map((t) => {
                  const c = resolveColor(t.project_id, byId);
                  return (
                    <button
                      key={t.id}
                      className="cal-chip"
                      style={{
                        background: c ? `${c}22` : "var(--surface)",
                        color: c ?? "var(--text)",
                        borderLeftColor: priorityColor(t.priority) ?? "transparent",
                      }}
                      onClick={() => onOpenTask?.(t)}
                    >
                      {t.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {timed.length === 0 && allday.length === 0 && closed.length === 0 && state === "ready" && (
          <div className="today-empty-hint">План на день пуст. Тап по часу или + добавит задачу.</div>
        )}
        {state === "loading" ? skeleton
          : state === "error" ? errorBlock
          : (
            <DayTimeline
              tasks={timed}
              byId={byId}
              isToday
              autoScroll={false}
              onTapHour={onTapHour}
              onToggle={toggle}
              onOpen={onOpenTask}
              onResize={resize}
              nowAnchorId="today-now"
            />
          )}
      </div>
    );
  }

  // ── вид «Задачи» (гибрид-список) ────────────────────────────────────────
  const nothing = overdue.length === 0 && allday.length === 0 && closed.length === 0;
  return (
    <div className="screen today">
      <div className="today-head">
        <div className="today-pad">
          <button className="today-back" onClick={() => onViewChange("timeline")}>
            <IcoBack /><span>Таймлайн</span>
          </button>
          <h1 style={{ marginTop: "var(--s2)" }}>Сегодня</h1>
        </div>
      </div>

      {state === "loading" ? skeleton
        : state === "error" ? errorBlock
        : (
          <div className="today-pad today-tasks">
            <button className="entry-card" onClick={onOpenInbox}>
              <span className="lead"><IcoInbox /></span>
              <span className="grow">Входящие</span>
              {inboxCount > 0 && <span className="count">{inboxCount}</span>}
              <span className="chev"><IcoChevron /></span>
            </button>

            <div className="today-qa">
              <QuickAddBar onAdd={onQuickAdd} placeholder="Новая задача на сегодня…" />
            </div>

            {overdue.length > 0 && (
              <>
                <div className="section-label section-overdue">Просрочено · {overdue.length}</div>
                {renderList(overdue)}
              </>
            )}

            {allday.length > 0 && (
              <>
                <div className="section-label">Без времени</div>
                {renderList(allday)}
              </>
            )}

            {closed.length > 0 && (
              <>
                <button className="section-label section-toggle" onClick={() => setShowDone((v) => !v)}>
                  <span>Закрыто · {closed.length}</span>
                  <span className={`tree-chev ${showDone ? "open" : ""}`}><IcoChevron /></span>
                </button>
                {showDone && renderList(closed)}
              </>
            )}

            {nothing && (
              <div style={{ marginTop: "var(--s4)" }}>
                <Empty text="На сегодня задач нет. Добавь через + или быстрый ввод выше." />
              </div>
            )}
          </div>
        )}
    </div>
  );
}
