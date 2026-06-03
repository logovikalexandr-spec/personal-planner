import { useCallback, useEffect, useMemo, useState } from "react";
import { DayTimeline } from "../components/DayTimeline";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { IcoChevron, IcoInbox } from "../components/icons";
import { getDayTasks, getProjects, patchTask } from "../api";
import { tg } from "../telegram";
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

export function Today({
  reloadKey, inboxCount, onInbox, onTapHour, onOpenTask,
}: { reloadKey: number; inboxCount: number; onInbox: () => void; onTapHour: (hour: number) => void; onOpenTask?: (t: Task) => void }) {
  const iso = localToday();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());

  async function load() {
    const [ts, ps] = await Promise.all([getDayTasks(iso), getProjects()]);
    setTasks(ts);
    setById(new Map(ps.map((p) => [p.id, p])));
  }
  useEffect(() => {
    load().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const toggle = useCallback(async (t: Task) => {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  const untimed = useMemo(() => tasks.filter((t) => !t.due_time), [tasks]);
  const doneCount = useMemo(() => tasks.filter((t) => t.status === "done").length, [tasks]);

  return (
    <div className="screen today">
      <div className="today-head">
        <div className="screen-hero today-pad">
          <h1>Сегодня</h1>
          <div className="date today-date" style={{ textTransform: "capitalize" }}>{FMT.format(new Date())}</div>
          {tasks.length > 0 && (
            <div className="today-summary">{tasks.length} задач · {doneCount} закрыто</div>
          )}
        </div>

        <div className="today-pad">
          <div className="entry-card" onClick={onInbox}>
            <span className="lead"><IcoInbox /></span>
            <span className="grow">Разобрать Inbox</span>
            {inboxCount > 0 && <span className="count">{inboxCount}</span>}
            <span className="chev"><IcoChevron /></span>
          </div>
        </div>
      </div>

      <DayTimeline tasks={tasks} byId={byId} isToday autoScroll={false} onTapHour={onTapHour} onToggle={toggle} />

      {untimed.length > 0 ? (
        <div className="today-pad">
          <div className="section-label">Без времени</div>
          <div className="list">
            {untimed.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={toggle} onOpen={onOpenTask} color={resolveColor(t.project_id, byId)} />
            ))}
          </div>
        </div>
      ) : (
        tasks.length === 0 && (
          <div className="today-pad">
            <Empty text="План на день пуст. Тап по часу или + добавит задачу." />
          </div>
        )
      )}
    </div>
  );
}
