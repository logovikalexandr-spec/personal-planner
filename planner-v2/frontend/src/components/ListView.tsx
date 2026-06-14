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

async function fetchFor(a: ActiveList): Promise<Task[]> {
  if (a.kind === "project") return getTasks("all", a.id, true);
  if (a.kind === "smart") {
    if (a.key === "today") return getTasks("today");
    if (a.key === "next7" || a.key === "week") return getTasks("week");
    if (a.key === "tomorrow") {
      const all = await getTasks("all");
      const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      return all.filter((t) => t.due_date === tmr);
    }
  }
  return getTasks("all");
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

  async function toggle(t: Task) {
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    await load();
  }

  // ── F2 действия (свайп = одна, batch = набор) ──
  async function doComplete(ts: Task[]) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    await Promise.all(ts.map((t) => patchTask(t.id, { status: "done" })));
    await load();
  }
  async function doDelete(ts: Task[]) {
    await Promise.all(ts.map((t) => deleteTask(t.id)));
    await load();
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
