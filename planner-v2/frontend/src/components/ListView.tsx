import { useEffect, useState } from "react";
import { Empty } from "./Empty";
import { TaskListBody } from "./TaskListBody";
import { DateSheet, type DateValue } from "./DateSheet";
import { PriorityPicker, ProjectPickerSheet } from "./pickers";
import { Inbox } from "../screens/Inbox";
import { deleteTask, getProjects, getTasks, patchTask } from "../api";
import type { ActiveList, Priority, Project, Task } from "../types";
import { tg } from "../telegram";
import { IcoMenu } from "./icons";

function resolveColor(projectId: number | null, byId: Map<number, Project>): string | null {
  let cur = projectId != null ? byId.get(projectId) : undefined;
  let guard = 0;
  while (cur && guard++ < 8) {
    if (cur.color) return cur.color;
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

const isOpen = (t: Task) => t.status === "todo" || t.status === "in_progress";

// Любой список = ОТКРЫТЫЕ (по scope) + закрытые за 7 дней (done/cancelled) для секций внизу.
// Возвращаем единый массив; TaskListBody раскладывает по статусу (открытые в группы, done/cancelled — секции).
async function fetchFor(a: ActiveList): Promise<Task[]> {
  const pid = a.kind === "project" ? a.id : undefined;
  const incl = a.kind === "project";

  let openP: Promise<Task[]>;
  if (a.kind === "project") {
    openP = getTasks("all", a.id, true).then((ts) => ts.filter(isOpen));
  } else if (a.key === "today") {
    openP = getTasks("today");                 // только сегодняшние открытые (без просрочки)
  } else if (a.key === "overdue") {
    openP = getTasks("overdue");               // отдельный список просрочки
  } else if (a.key === "next7") {
    openP = getTasks("week");
  } else if (a.key === "tomorrow") {
    const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    openP = getTasks("all").then((ts) => ts.filter((t) => t.due_date === tmr && isOpen(t)));
  } else {
    openP = getTasks("all").then((ts) => ts.filter(isOpen));   // «Все» — только открытые
  }

  const [open, done, cancelled] = await Promise.all([
    openP,
    getTasks("done", pid, incl),       // done за 7 дней (бэк), для секции «Выполнено»
    getTasks("cancelled", pid, incl),  // wont_do за 7 дней, для секции «Отменено»
  ]);
  return [...open, ...done, ...cancelled];
}

type BatchPicker = "date" | "project" | "priority" | null;

export function ListView({
  active, reloadKey, onMenu, onInboxChange, onOpenTask,
}: { active: ActiveList; reloadKey: number; onMenu: () => void; onInboxChange: () => void; onOpenTask?: (t: Task) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [picker, setPicker] = useState<BatchPicker>(null);
  const [pickTargets, setPickTargets] = useState<Task[]>([]); // на кого применить выбор из picker'а

  const isInbox = active.kind === "smart" && active.key === "inbox";

  useEffect(() => {
    getProjects().then((ps) => setById(new Map(ps.map((p) => [p.id, p])))).catch(() => {});
  }, [reloadKey]);

  async function load() {
    if (isInbox) return;
    setStatus("loading");
    try {
      setTasks(await fetchFor(active));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, active.kind === "project" ? active.id : active.kind === "smart" ? active.key : ""]);

  // Оптимистик: меняем статус ЛОКАЛЬНО, без load() → нет setStatus("loading") →
  // список не заменяется скелетоном → скролл НЕ сбрасывается («экран тащило»).
  // Задача остаётся на месте (стабильная сортировка по id). load() только при ошибке.
  async function toggle(t: Task) {
    const next = t.status === "done" || t.status === "wont_do" ? "todo" : "done";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try { await patchTask(t.id, { status: next }); } catch { load(); }
  }

  // ── F2 действия (свайп = одна, batch = набор) ──
  async function doComplete(ts: Task[]) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    const ids = new Set(ts.map((t) => t.id));
    setTasks((prev) => prev.map((x) => (ids.has(x.id) ? { ...x, status: "done" } : x)));
    try { await Promise.all(ts.map((t) => patchTask(t.id, { status: "done" }))); } catch { load(); }
  }
  async function doDelete(ts: Task[]) {
    const ids = new Set(ts.map((t) => t.id));
    setTasks((prev) => prev.filter((x) => !ids.has(x.id)));
    try { await Promise.all(ts.map((t) => deleteTask(t.id))); } catch { load(); }
  }
  function openPickerFor(p: BatchPicker, ts: Task[]) {
    setPickTargets(ts);
    setPicker(p);
  }
  async function applyDate(v: DateValue) {
    await Promise.all(pickTargets.map((t) =>
      patchTask(t.id, { due_date: v.due_date, due_time: v.due_time, end_date: v.end_date, end_time: v.end_time })));
    setPicker(null);
    await load();
  }
  async function applyProject(id: number | null) {
    await Promise.all(pickTargets.map((t) => patchTask(t.id, { project_id: id })));
    setPicker(null);
    await load();
  }
  async function applyPriority(p: Priority) {
    await Promise.all(pickTargets.map((t) => patchTask(t.id, { priority: p })));
    setPicker(null);
    await load();
  }

  return (
    <div className="screen">
      <div className="row" style={{ gap: 4, marginBottom: "var(--s3)" }}>
        <button className="hamb" onClick={onMenu} aria-label="Меню"><IcoMenu /></button>
        <h1 style={{ margin: 0 }}>{active.title}</h1>
      </div>
      {isInbox ? (
        <Inbox onChange={onInboxChange} />
      ) : status === "loading" ? (
        <div className="list" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}
        </div>
      ) : status === "error" ? (
        <Empty
          text="Не удалось загрузить список."
          action={<button className="btn btn-ghost" onClick={load}>Повторить</button>}
        />
      ) : tasks.length === 0 ? (
        <Empty text="Пусто. Жми + чтобы добавить." />
      ) : (
        <TaskListBody
          tasks={tasks}
          colorOf={(t) => resolveColor(t.project_id, byId)}
          groupByProjectMap={active.kind === "smart" ? byId : undefined}
          onOpen={onOpenTask}
          onToggle={toggle}
          onComplete={doComplete}
          onDelete={doDelete}
          onDate={(ts) => openPickerFor("date", ts)}
          onMove={(ts) => openPickerFor("project", ts)}
          onPriority={(ts) => openPickerFor("priority", ts)}
        />
      )}

      {picker === "date" && (
        <DateSheet
          initial={{ due_date: null, due_time: null, end_date: null, end_time: null, reminder_at: null, recurrence: null }}
          onApply={applyDate}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "project" && (
        <ProjectPickerSheet value={null} onPick={applyProject} onClose={() => setPicker(null)} />
      )}
      {picker === "priority" && (
        <PriorityPicker value="none" onPick={applyPriority} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}
