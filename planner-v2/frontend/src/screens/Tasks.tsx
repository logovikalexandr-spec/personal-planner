import { useEffect, useState } from "react";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { getTasks, patchTask } from "../api";
import type { Task } from "../types";

export function Tasks({ reloadKey }: { reloadKey: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  async function load() {
    setTasks(await getTasks("all"));
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
      <div className="screen-hero"><h1>Задачи</h1></div>
      {tasks.length === 0 && <Empty text="Список пуст. Жми + чтобы добавить." />}
      <div className="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
