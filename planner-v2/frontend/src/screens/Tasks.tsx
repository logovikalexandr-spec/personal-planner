import { useEffect, useState } from "react";
import { AddTaskBar } from "../components/AddTaskBar";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { createTask, getTasks, patchTask } from "../api";
import type { Task } from "../types";

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  async function load() {
    setTasks(await getTasks("all"));
  }
  useEffect(() => {
    load();
  }, []);
  async function add(title: string) {
    await createTask(title);
    await load();
  }
  async function toggle(t: Task) {
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    await load();
  }
  return (
    <div className="screen">
      <h1>Задачи</h1>
      <AddTaskBar onAdd={add} />
      {tasks.length === 0 && <Empty text="Список пуст." />}
      <div className="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
