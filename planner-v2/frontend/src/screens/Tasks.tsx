import { useEffect, useState } from "react";
import { Empty } from "../components/Empty";
import { TaskListBody } from "../components/TaskListBody";
import { DateSheet, type DateValue } from "../components/DateSheet";
import { PriorityPicker, ProjectPickerSheet } from "../components/pickers";
import { deleteTask, getTasks, patchTask } from "../api";
import type { Priority, Task } from "../types";
import { tg } from "../telegram";

type BatchPicker = "date" | "project" | "priority" | null;

export function Tasks({ reloadKey, onOpenTask }: { reloadKey: number; onOpenTask?: (t: Task) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [picker, setPicker] = useState<BatchPicker>(null);
  const [pickTargets, setPickTargets] = useState<Task[]>([]);

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
      <div className="screen-hero"><h1>Задачи</h1></div>
      {tasks.length === 0 ? (
        <Empty text="Список пуст. Жми + чтобы добавить." />
      ) : (
        <TaskListBody
          tasks={tasks}
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
