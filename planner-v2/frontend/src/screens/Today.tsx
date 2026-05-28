import { useEffect, useState } from "react";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { getTasks, patchTask } from "../api";
import type { Task } from "../types";

const FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

export function Today({ reloadKey, inboxCount, onInbox }: { reloadKey: number; inboxCount: number; onInbox: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setTasks(await getTasks("today"));
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }
  useEffect(() => {
    load();
  }, [reloadKey]);

  async function toggle(t: Task) {
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    await load();
  }

  return (
    <div className="screen">
      <div className="screen-hero">
        <h1>Сегодня</h1>
        <div className="date">{FMT.format(new Date())}</div>
      </div>

      <div className="entry-card" onClick={onInbox}>
        <span className="lead">In</span>
        <span className="grow">Разобрать Inbox</span>
        {inboxCount > 0 && <span className="count">{inboxCount}</span>}
        <span className="chev">{"›"}</span>
      </div>

      <div className="section-label">Задачи на сегодня</div>
      {err && <div className="card">Ошибка: {err}</div>}
      {!err && tasks.length === 0 && <Empty text="На сегодня пусто. Жми + чтобы добавить." />}
      <div className="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
