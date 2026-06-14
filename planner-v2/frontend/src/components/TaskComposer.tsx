import { useEffect, useMemo, useState } from "react";
import { createTag, createTask, getProjects, getTags } from "../api";
import type { Priority, Project, Tag } from "../types";
import { Sheet } from "./Sheet";
import { DateSheet, type DateValue } from "./DateSheet";
import { Flag, PRIORITY_COLOR, PriorityPicker, ProjectPickerSheet, TagPickerSheet } from "./pickers";
import { IcoExpand, IcoMore, IcoSend } from "./icons";
import { quickParse } from "../lib/quickParse";

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
  initialDate, initialTime, initialEnd, defaultProjectId = null, initialTitle = "", initialPicker = null, onClose, onSaved,
}: {
  initialDate?: string | null;
  initialTime?: string | null;
  initialEnd?: string | null;
  defaultProjectId?: number | null;
  initialTitle?: string;       // текст, перенесённый из quick-add при «Развернуть»/тапе чипа
  initialPicker?: Picker;      // сразу открыть нужный пикер (тап чипа дата/приоритет/тег)
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projLoading, setProjLoading] = useState(true);
  const [projError, setProjError] = useState(false);
  const [picker, setPicker] = useState<Picker>(initialPicker);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
  const [priority, setPriority] = useState<Priority>("none");
  const [date, setDate] = useState<DateValue>({
    due_date: initialDate ?? null, due_time: initialTime ?? null, end_date: null, end_time: initialEnd ?? null,
    reminder_at: null, recurrence: null,
  });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState("");

  useEffect(() => { getTags().then(setAllTags).catch(() => {}); }, []);

  // Волна 2 F2: live NL-парсинг title. Показываем что распознано; применяем на save
  // (только поля, которые пользователь не задал вручную). Мокап wave2.html #2.
  const parsed = useMemo(() => quickParse(title), [title]);

  function loadProjects() {
    setProjLoading(true);
    setProjError(false);
    getProjects()
      .then((ps) => { setProjects(ps); setProjLoading(false); })
      .catch(() => { setProjError(true); setProjLoading(false); });
  }
  useEffect(() => { loadProjects(); }, []);

  // blur the title before opening a picker so the keyboard drops and doesn't cover it
  function openPicker(p: Picker) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setPicker(p);
  }

  const proj = projectId != null ? projects.find((p) => p.id === projectId) : undefined;
  const ds = dateSummary(date);

  // распознанный из NL ~проект → id (по имени, без регистра)
  function parsedProjectId(): number | null {
    if (!parsed.projectName) return null;
    const hit = projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase());
    return hit ? hit.id : null;
  }
  // распознанные #теги → id (создаём недостающие)
  async function parsedTagIds(): Promise<number[]> {
    if (parsed.tagNames.length === 0) return [];
    const ids: number[] = [];
    let known = allTags;
    for (const n of parsed.tagNames) {
      let hit = known.find((t) => t.name.toLowerCase() === n.toLowerCase());
      if (!hit) { try { hit = await createTag(n); known = [...known, hit]; } catch { /* skip */ } }
      if (hit) ids.push(hit.id);
    }
    setAllTags(known);
    return ids;
  }

  async function save() {
    if (saving) return;
    // применяем NL-парсинг: cleaned title + поля, которые пользователь не задал вручную
    const cleanTitle = (parsed.title || title).trim();
    if (!cleanTitle) return;
    setSaving(true);
    try {
      const nlProj = projectId == null ? parsedProjectId() : null;
      const nlTags = await parsedTagIds();
      const mergedTagIds = Array.from(new Set([...tagIds, ...nlTags]));
      const created = await createTask(cleanTitle, {
        project_id: projectId ?? nlProj,
        priority: priority !== "none" ? priority : (parsed.priority ?? "none"),
        due_date: date.due_date ?? parsed.due_date ?? null,
        due_time: date.due_time ?? parsed.due_time ?? null,
        end_date: date.end_date,
        end_time: date.end_time,
        reminder_at: date.reminder_at, recurrence: date.recurrence,
        description: description.trim() || null,
        tag_ids: mergedTagIds.length ? mergedTagIds : undefined,
      });
      for (const st of subtasks) {
        if (st.trim()) await createTask(st.trim(), { parent_task_id: created.id, project_id: projectId ?? nlProj });
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
        autoFocus={!initialPicker}
        placeholder="Новая задача..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !expanded && save()}
      />

      {parsed.tokens.length > 0 && (
        <div className="qa-recognized">
          {parsed.tokens.map((tok, i) => (
            <span
              key={i}
              className="qa-rec-chip"
              style={tok.kind === "project" ? { color: "var(--project-tag)", background: "rgba(111,207,151,0.16)", borderColor: "transparent" } : undefined}
            >
              {tok.label}
            </span>
          ))}
        </div>
      )}

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
      {picker === "project" && (
        <ProjectPickerSheet
          projects={projects}
          loading={projLoading}
          error={projError}
          value={projectId}
          onPick={setProjectId}
          onProjectsChange={setProjects}
          onRetry={loadProjects}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "tag" && <TagPickerSheet value={tagIds} onChange={setTagIds} onClose={() => setPicker(null)} />}
    </>
  );
}
