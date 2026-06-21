import { useEffect, useRef, useState } from "react";
import {
  createTask, deleteTask, getProjects, getTaskDetail, patchTask, putReminders,
} from "../api";
import { tg } from "../telegram";
import { confirmDialog } from "../lib/confirm";
import type {
  DateDurationValue,
} from "./DateDurationSheet";
import type {
  Priority, Project, RecurrenceJson, Reminder, ReminderInput, TaskDetail as TaskDetailT,
} from "../types";
import { Checklist } from "./Checklist";
import { DateDurationSheet } from "./DateDurationSheet";
import {
  Flag, PRIORITY_COLOR, PriorityPicker, ProjectPickerSheet, TagPickerSheet,
} from "./pickers";
import { TaskItem } from "./TaskItem";
import {
  IcoBack, IcoBell, IcoCalendar2, IcoCheck, IcoList2, IcoMore, IcoPlus,
  IcoRepeat, IcoTag, IcoTrash, IcoXCircle,
} from "./icons";

type Picker = "date" | "priority" | "project" | "tag" | null;

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Высокий", medium: "Средний", low: "Низкий", none: "Нет",
};
const WD_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Подтверждение через общий util: в Telegram — нативный showConfirm, в PWA/браузере — window.confirm
// (showConfirm-заглушка SDK вне Telegram не зовёт колбэк → удаление «висело»). См. lib/confirm.
const confirmDelete = confirmDialog;

function prioClass(p: Priority): string {
  return p === "high" ? "prio-high" : p === "medium" ? "prio-medium" : p === "low" ? "prio-low" : "";
}
// Заметки: textarea растёт под контент до max-height (CSS), дальше скролл внутри.
const NOTES_MAX = 156;
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, NOTES_MAX)}px`;
}
function fmtDate(iso: string | null, time: string | null, end: string | null): string {
  if (!iso) return "Нет";
  const d = new Date(iso + "T00:00:00");
  const md = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(d);
  if (!time) return md;
  const t = time.slice(0, 5);
  const e = end ? `–${end.slice(0, 5)}` : "";
  return `${md}, ${t}${e}`;
}
function recurText(r: RecurrenceJson | null | undefined): string {
  if (!r) return "Нет";
  const u = { daily: "день", weekly: "неделю", monthly: "месяц", yearly: "год" }[r.freq];
  const base = r.interval > 1 ? `Каждые ${r.interval} · ${u}` : `Каждый ${u}`;
  if (r.freq === "weekly" && r.weekdays?.length) {
    return `${base} · ${r.weekdays.map((d) => WD_SHORT[d]).join(", ")}`;
  }
  return base;
}
function reminderText(r: Reminder): string {
  if (r.kind === "absolute") return r.at_time?.slice(0, 5) ?? "вкл";
  const m = r.offset_minutes ?? 0;
  if (m === 0) return "вовремя";
  if (m % 10080 === 0) return `за ${m / 10080} нед.`;
  if (m % 1440 === 0) return `за ${m / 1440} дн.`;
  if (m % 60 === 0) return `за ${m / 60} ч.`;
  return `за ${m} мин`;
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

export function TaskDetail({
  taskId, onClose, onChanged, onOpenTask,
}: { taskId: number; onClose: () => void; onChanged: () => void; onOpenTask?: (id: number) => void }) {
  const [task, setTask] = useState<TaskDetailT | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [byId, setById] = useState<Map<number, Project>>(new Map());
  const [picker, setPicker] = useState<Picker>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [subDraft, setSubDraft] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // ⋯ меню шапки (Подзадача/Не буду делать/Удалить)
  const notesRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    setStatus("loading");
    try {
      const [t, ps] = await Promise.all([getTaskDetail(taskId), getProjects()]);
      setTask(t);
      setTitleDraft(t.title);
      setNotesDraft(t.description ?? "");
      setById(new Map(ps.map((p) => [p.id, p])));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // длинная заметка существующей задачи: растянуть поле под контент при открытии
  useEffect(() => {
    if (status === "ready" && notesRef.current) autoGrow(notesRef.current);
  }, [status]);

  function patchLocal(p: Partial<TaskDetailT>) {
    setTask((cur) => (cur ? { ...cur, ...p } : cur));
  }

  async function commitTitle() {
    if (!task) return;
    const t = titleDraft.trim();
    if (!t || t === task.title) { setTitleDraft(task.title); return; }
    patchLocal({ title: t });
    await patchTask(task.id, { title: t });
    onChanged();
  }
  async function commitNotes() {
    if (!task) return;
    const n = notesDraft.trim();
    if (n === (task.description ?? "")) return;
    patchLocal({ description: n || null });
    await patchTask(task.id, { description: n || null });
    onChanged();
  }

  async function toggleDone() {
    if (!task) return;
    tg()?.HapticFeedback?.impactOccurred?.("light");
    const next = task.status === "done" || task.status === "wont_do" ? "todo" : "done";
    patchLocal({ status: next });
    await patchTask(task.id, { status: next });
    onChanged();
  }
  async function toggleSub(s: TaskDetailT["subtasks"][number]) {
    if (!task) return;
    tg()?.HapticFeedback?.impactOccurred?.("light");
    const next = s.status === "done" || s.status === "wont_do" ? "todo" : "done";
    patchLocal({ subtasks: (task.subtasks ?? []).map((x) => (x.id === s.id ? { ...x, status: next } : x)) });
    await patchTask(s.id, { status: next });
    onChanged();
  }
  async function addSubtask() {
    if (!task) return;
    const t = subDraft.trim();
    if (!t) { setAddingSub(false); return; }
    setSubDraft("");
    await createTask(t, { parent_task_id: task.id, project_id: task.project_id });
    await load();
    onChanged();
  }
  async function deleteSubtask(s: TaskDetailT["subtasks"][number]) {
    if (!task) return;
    await deleteTask(s.id);
    await load();
    onChanged();
  }
  async function setPriority(p: Priority) {
    if (!task) return;
    patchLocal({ priority: p });
    await patchTask(task.id, { priority: p });
    onChanged();
  }
  async function setProject(id: number | null) {
    if (!task) return;
    patchLocal({ project_id: id });
    await patchTask(task.id, { project_id: id });
    onChanged();
  }
  async function applyDate(v: DateDurationValue) {
    if (!task) return;
    patchLocal({
      due_date: v.due_date, due_time: v.due_time, end_time: v.end_time,
      recurrence_json: v.recurrence_json,
    });
    await patchTask(task.id, {
      due_date: v.due_date, due_time: v.due_time, end_time: v.end_time,
      recurrence_json: v.recurrence_json,
    });
    const saved = await putReminders(task.id, v.reminders);
    patchLocal({ reminders: saved });
    onChanged();
  }

  async function markWontDo() {
    if (!task) return;
    patchLocal({ status: "wont_do" });
    await patchTask(task.id, { status: "wont_do" });
    onChanged();
    onClose();
  }
  async function remove() {
    if (!task) return;
    // window.confirm в Telegram WebView не работает (no-op/false) → нативный showConfirm, фолбэк для браузера.
    const ok = await confirmDelete(`Удалить «${task.title}»?`, { body: "Задача удалится навсегда. Отменить нельзя." });
    if (!ok) return;
    await deleteTask(task.id);
    onChanged();
    onClose();
  }

  // ── loading: скелетон строк (НЕ спиннер, DESIGN §7) ──
  if (status === "loading") {
    return (
      <div className="screen detail">
        <div className="detail-top">
          <button className="detail-ic" onClick={onClose} aria-label="Назад"><IcoBack /></button>
        </div>
        <div className="detail-body">
          <div className="skeleton" style={{ height: 30, width: "70%", marginBottom: 16 }} />
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 46, marginBottom: 8 }} />)}
        </div>
      </div>
    );
  }
  if (status === "error" || !task) {
    return (
      <div className="screen detail">
        <div className="detail-top">
          <button className="detail-ic" onClick={onClose} aria-label="Назад"><IcoBack /></button>
        </div>
        <div className="detail-state">
          <div className="muted">Не удалось загрузить задачу.</div>
          <button className="btn btn-ghost" onClick={load}>Повторить</button>
        </div>
      </div>
    );
  }

  const done = task.status === "done";
  const wontDo = task.status === "wont_do";
  const closed = done || wontDo;   // wont_do = как выполненная (зачёркнут), но крестик
  const pColor = PRIORITY_COLOR[task.priority];
  const proj = task.project_id != null ? byId.get(task.project_id) : undefined;
  const dateActive = !!task.due_date;
  const dateInitial: DateDurationValue = {
    due_date: task.due_date, due_time: task.due_time, end_time: task.end_time,
    all_day: !!task.due_date && !task.due_time,
    recurrence_json: task.recurrence_json ?? null,
    reminders: task.reminders.map<ReminderInput>((r) => ({
      kind: r.kind, offset_minutes: r.offset_minutes ?? null, at_time: r.at_time ?? null,
    })),
  };

  return (
    <div className="screen detail">
      <div className="detail-top">
        <button className="detail-ic" onClick={onClose} aria-label="Назад"><IcoBack /></button>
        <div style={{ flex: 1 }} />
        <div className="detail-menu-wrap">
          <button className="detail-ic" aria-label="Ещё" aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}><IcoMore /></button>
          {menuOpen && (
            <>
              <div className="detail-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="detail-menu" role="menu">
                <button role="menuitem" onClick={() => { setMenuOpen(false); setAddingSub(true); }}>
                  <IcoPlus />Подзадача
                </button>
                <button role="menuitem" onClick={() => { setMenuOpen(false); markWontDo(); }}>
                  <IcoXCircle />Не буду делать
                </button>
                <button role="menuitem" className="danger" onClick={() => { setMenuOpen(false); remove(); }}>
                  <IcoTrash />Удалить
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="detail-body">
        {/* inline title + checkbox в цвете приоритета */}
        <div className="detail-title-row">
          <button
            className={`checkbox detail-cb ${closed ? "done" : ""} ${wontDo ? "wontdo" : ""}`}
            style={{ borderColor: closed ? undefined : pColor }}
            onClick={toggleDone} role="checkbox" aria-checked={closed} aria-label={wontDo ? "не буду делать" : "Выполнено"}
          >
            {done ? <IcoCheck /> : wontDo ? <IcoXCircle /> : null}
          </button>
          <textarea
            className={`detail-title-input ${closed ? "title-done" : ""}`}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            rows={1}
            placeholder="Название задачи"
          />
        </div>

        <textarea
          ref={notesRef}
          className="detail-notes"
          value={notesDraft}
          onChange={(e) => { setNotesDraft(e.target.value); autoGrow(e.currentTarget); }}
          onBlur={commitNotes}
          placeholder="Заметки…"
          rows={2}
        />

        {/* строки полей */}
        <button className="detail-row" onClick={() => setPicker("date")}>
          <span className="detail-lab"><span className="detail-glyph"><IcoCalendar2 /></span>Дата · время</span>
          <span className="detail-val">
            {dateActive
              ? <span className="pill-ember">{fmtDate(task.due_date, task.due_time, task.end_time)}</span>
              : <span className="muted mono">Нет</span>}
          </span>
        </button>

        <button className="detail-row" onClick={() => setPicker("priority")}>
          <span className="detail-lab"><span className="detail-glyph"><Flag color="currentColor" filled={false} /></span>Приоритет</span>
          <span className="detail-val">
            <span className="pill">
              {task.priority !== "none" && <span className="pill-dot" style={{ background: pColor }} />}
              {PRIORITY_LABEL[task.priority]}
            </span>
          </span>
        </button>

        <button className="detail-row" onClick={() => setPicker("project")}>
          <span className="detail-lab"><span className="detail-glyph"><IcoList2 /></span>Список</span>
          <span className="detail-val">
            <span className="tagpill">{proj ? `${proj.icon ?? "•"} ${proj.name}` : "📥 Входящие"}</span>
          </span>
        </button>

        <div className="detail-row">
          <span className="detail-lab">
            <span className="detail-glyph">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>
            </span>Вклад в успех
          </span>
          <span className="detail-val">
            {task.impact != null
              ? <span className="imp">{task.impact}%</span>
              : <span className="muted mono">Ещё не оценено · обсуди с ассистентом</span>}
          </span>
        </div>

        <button className="detail-row" onClick={() => setPicker("date")}>
          <span className="detail-lab"><span className="detail-glyph"><IcoRepeat /></span>Повтор</span>
          <span className="detail-val mono" style={{ color: task.recurrence_json ? "var(--text)" : "var(--text-muted)" }}>
            {recurText(task.recurrence_json)}
          </span>
        </button>

        <button className="detail-row" onClick={() => setPicker("date")}>
          <span className="detail-lab"><span className="detail-glyph"><IcoBell /></span>Напоминания</span>
          <span className="detail-val">
            {task.reminders?.length
              ? task.reminders.map((r, i) => <span key={r.id ?? i} className="pill">{reminderText(r)}</span>)
              : <span className="muted mono">Нет</span>}
          </span>
        </button>

        <button className="detail-row" onClick={() => setPicker("tag")}>
          <span className="detail-lab"><span className="detail-glyph"><IcoTag /></span>Теги</span>
          <span className="detail-val">
            {task.tags?.length
              ? task.tags.map((t) => <span key={t.id} className="tagpill">#{t.name}</span>)
              : <span className="muted mono">Нет</span>}
          </span>
        </button>

        {/* чеклист + кольцо прогресса */}
        <Checklist
          taskId={task.id}
          items={task.checkitems ?? []}
          onChange={(items) => { patchLocal({ checkitems: items }); }}
        />

        {/* подзадачи (полные задачи, НЕ двигают кольцо) */}
        <div className="detail-sub-head">
          <span className="detail-sub-title">Подзадачи</span>
          {(task.subtasks?.length ?? 0) > 0 && (
            <span className="detail-sub-count mono">
              {task.subtasks!.filter((s) => s.status === "done").length}/{task.subtasks!.length}
            </span>
          )}
        </div>
        {/* Вариант A (рейка): подзадачи связаны с задачей вертикальной линией-деревом.
            Свайп подзадачи влево → Изменить (открыть деталь) / Удалить. */}
        {(task.subtasks?.length ?? 0) > 0 && (
          <div className="detail-sub-rail">
            {task.subtasks!.map((s) => (
              <div key={s.id} className="sub-rail-row">
                <TaskItem
                  task={s}
                  onToggle={() => toggleSub(s)}
                  onOpen={onOpenTask ? () => onOpenTask(s.id) : undefined}
                  onSwipeComplete={() => toggleSub(s)}
                  onSwipeEdit={onOpenTask ? () => onOpenTask(s.id) : undefined}
                  onSwipeDelete={() => deleteSubtask(s)}
                  color={resolveColor(s.project_id, byId)}
                />
              </div>
            ))}
          </div>
        )}
        {addingSub ? (
          <div className="add-confirm-row">
            <span className="add-row-ico"><IcoPlus /></span>
            <input
              className="add-confirm-input"
              autoFocus
              placeholder="Название подзадачи"
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); if (e.key === "Escape") { setSubDraft(""); setAddingSub(false); } }}
              onBlur={addSubtask}
            />
            <button
              className="add-confirm-btn"
              aria-label="Сохранить подзадачу"
              disabled={!subDraft.trim()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={addSubtask}
            >
              <IcoCheck />
            </button>
          </div>
        ) : (
          <button className="add-row" aria-label="Добавить подзадачу" onClick={() => setAddingSub(true)}>
            <span className="add-row-ico"><IcoPlus /></span>
            <span>Добавить подзадачу</span>
          </button>
        )}
      </div>

      {picker === "date" && (
        <DateDurationSheet initial={dateInitial} onApply={applyDate} onClose={() => setPicker(null)} />
      )}
      {picker === "priority" && (
        <PriorityPicker value={task.priority} onPick={setPriority} onClose={() => setPicker(null)} />
      )}
      {picker === "project" && (
        <ProjectPickerSheet value={task.project_id} onPick={setProject} onClose={() => setPicker(null)} />
      )}
      {picker === "tag" && (
        <TagPickerSheet
          value={task.tags?.map((t) => t.id) ?? []}
          onChange={async (ids) => { patchLocal({ tags: ids.map((id) => ({ id, name: "" })) }); await patchTask(task.id, { tag_ids: ids }); await load(); onChanged(); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
