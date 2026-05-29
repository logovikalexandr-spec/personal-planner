import { useEffect, useState } from "react";
import { createTask, getProjects } from "../api";
import type { Priority, Project } from "../types";
import { Sheet } from "./Sheet";
import { DateSheet, type DateValue } from "./DateSheet";
import { Flag, PRIORITY_COLOR, PriorityPicker, ProjectPickerSheet, TagPickerSheet } from "./pickers";
import { IcoExpand, IcoMore, IcoSend } from "./icons";

type Picker = "date" | "priority" | "project" | "tag" | null;

function dateSummary(v: DateValue): string | null {
  if (!v.due_date) return null;
  const d = new Date(v.due_date + "T00:00:00");
  const md = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d);
  const t = v.due_time ? ` ${v.due_time.slice(0, 5)}` : "";
  const rep = v.recurrence ? " 🔁" : "";
  const rem = v.reminder_at ? " ⏰" : "";
  return `${md}${t}${rep}${rem}`;
}

export function TaskComposer({
  initialDate, initialTime, initialEnd, defaultProjectId = null, onClose, onSaved,
}: {
  initialDate?: string | null;
  initialTime?: string | null;
  initialEnd?: string | null;
  defaultProjectId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [picker, setPicker] = useState<Picker>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
  const [priority, setPriority] = useState<Priority>("none");
  const [date, setDate] = useState<DateValue>({
    due_date: initialDate ?? null, due_time: initialTime ?? null, end_time: initialEnd ?? null,
    reminder_at: null, recurrence: null,
  });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState("");

  useEffect(() => { getProjects().then(setProjects).catch(() => setProjects([])); }, []);

  // blur the title before opening a picker so the keyboard drops and doesn't cover it
  function openPicker(p: Picker) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setPicker(p);
  }

  const proj = projectId != null ? projects.find((p) => p.id === projectId) : undefined;
  const ds = dateSummary(date);

  async function save() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const created = await createTask(t, {
        project_id: projectId, priority,
        due_date: date.due_date, due_time: date.due_time, end_time: date.end_time,
        reminder_at: date.reminder_at, recurrence: date.recurrence,
        description: description.trim() || null,
        tag_ids: tagIds.length ? tagIds : undefined,
      });
      for (const st of subtasks) {
        if (st.trim()) await createTask(st.trim(), { parent_task_id: created.id, project_id: projectId });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function addSub() {
    const s = subDraft.trim();
    if (!s) return;
    setSubtasks((p) => [...p, s]);
    setSubDraft("");
  }

  const composer = (
    <Sheet onClose={onClose}>
      <input
        className="input"
        autoFocus
        placeholder="Новая задача..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !expanded && save()}
      />

      {expanded && (
        <>
          <textarea
            className="input"
            placeholder="Описание..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ marginTop: 8, resize: "none", fontFamily: "var(--font)" }}
          />
          <div className="section-label" style={{ margin: "12px 0 6px" }}>Подзадачи</div>
          {subtasks.map((s, i) => (
            <div key={i} className="row" style={{ gap: 8, padding: "4px 0" }}>
              <span className="muted">○</span>
              <span style={{ flex: 1 }}>{s}</span>
              <button className="tree-btn" onClick={() => setSubtasks((p) => p.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Добавить подзадачу..." value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} style={{ flex: 1 }} />
            <button className="btn" onClick={addSub}>+</button>
          </div>
        </>
      )}

      <div className="composer-bar">
        <button className="cbar-btn" onClick={() => openPicker("date")}>
          <span className="cbar-ico">📅</span>
          {ds && <span className="cbar-txt">{ds}</span>}
        </button>
        <button className="cbar-btn" onClick={() => openPicker("priority")}>
          <Flag color={PRIORITY_COLOR[priority]} filled={priority !== "none"} />
        </button>
        <button className="cbar-btn" onClick={() => openPicker("project")}>
          <span className="cbar-ico">{proj?.icon ?? "📥"}</span>
          <span className="cbar-txt">{proj?.name ?? "Входящие"}</span>
        </button>
        <button className="cbar-btn" onClick={() => openPicker("tag")}>
          <span className="cbar-ico">🏷️</span>
          {tagIds.length > 0 && <span className="cbar-txt">{tagIds.length}</span>}
        </button>
        <button className="cbar-btn" onClick={() => setExpanded((x) => !x)} aria-label="Развернуть">
          {expanded ? <IcoMore /> : <IcoExpand />}
        </button>
        <div style={{ flex: 1 }} />
        <button className="cbar-send" disabled={!title.trim() || saving} onClick={save} aria-label="Сохранить">
          <IcoSend />
        </button>
      </div>
    </Sheet>
  );

  return (
    <>
      {composer}
      {picker === "date" && <DateSheet initial={date} onApply={setDate} onClose={() => setPicker(null)} />}
      {picker === "priority" && <PriorityPicker value={priority} onPick={setPriority} onClose={() => setPicker(null)} />}
      {picker === "project" && <ProjectPickerSheet projects={projects} value={projectId} onPick={setProjectId} onClose={() => setPicker(null)} />}
      {picker === "tag" && <TagPickerSheet value={tagIds} onChange={setTagIds} onClose={() => setPicker(null)} />}
    </>
  );
}
