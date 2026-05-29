import { useEffect, useState } from "react";
import { Empty } from "./Empty";
import { TaskItem } from "./TaskItem";
import { Inbox } from "../screens/Inbox";
import { getProjects, getTasks, patchTask } from "../api";
import type { ActiveList, Project, Task } from "../types";
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

export function ListView({
  active, reloadKey, onMenu, onInboxChange,
}: { active: ActiveList; reloadKey: number; onMenu: () => void; onInboxChange: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [err, setErr] = useState<string | null>(null);

  const isInbox = active.kind === "smart" && active.key === "inbox";

  useEffect(() => {
    getProjects().then((ps) => setById(new Map(ps.map((p) => [p.id, p])))).catch(() => {});
  }, [reloadKey]);

  async function load() {
    if (isInbox) return;
    try {
      setTasks(await fetchFor(active));
      setErr(null);
    } catch (e) {
      setErr(String(e));
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

  return (
    <div className="screen">
      <div className="row" style={{ gap: 4, marginBottom: "var(--s3)" }}>
        <button className="hamb" onClick={onMenu} aria-label="Меню"><IcoMenu /></button>
        <h1 style={{ margin: 0 }}>{active.title}</h1>
      </div>
      {isInbox ? (
        <Inbox onChange={onInboxChange} />
      ) : (
        <>
          {err && <div className="card">Ошибка: {err}</div>}
          {!err && tasks.length === 0 && <Empty text="Пусто. Жми + чтобы добавить." />}
          <div className="list">
            {tasks.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={toggle} color={resolveColor(t.project_id, byId)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
