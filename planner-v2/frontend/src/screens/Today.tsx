import { useEffect, useState } from "react";
import { AddTaskBar } from "../components/AddTaskBar";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { createTask, getTasks, patchTask } from "../api";
import type { Task } from "../types";

export function Today({ onInbox }: { onInbox: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setTasks(await getTasks("today"));
    } catch (e) {
      setErr(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(title: string) {
    const today = new Date().toISOString().slice(0, 10);
    await createTask(title, { due_date: today });
    await load();
  }
  async function toggle(t: Task) {
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    await load();
  }

  return (
    <div className="screen">
      <h1>Сегодня</h1>
      <button className="btn-ghost" onClick={onInbox} style={{ marginBottom: 12 }}>Разобрать Inbox</button>
      <AddTaskBar onAdd={add} />
      {err && <div className="card">Ошибка: {err}</div>}
      {!err && tasks.length === 0 && <Empty text="На сегодня пусто. Добавь задачу выше." />}
      <div className="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
