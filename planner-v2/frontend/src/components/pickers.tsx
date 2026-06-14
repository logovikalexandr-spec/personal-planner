import { useEffect, useMemo, useRef, useState } from "react";
import { createProject, createTag, getProjects, getTags } from "../api";
import { childCountMap, flatten, indentFor, subtreeCountMap } from "../lib/projectTree";
import type { Priority, Project, Tag } from "../types";
import { Sheet } from "./Sheet";
import { IcoChevron } from "./icons";
import { ProjectSheet, type ProjectFormValue } from "./ProjectSheet";

// DESIGN.md §2 / PATTERNS.md «Приоритет»: high=Signal Red, medium=Amber, low=Ember, none=Steel (без синего, 1 акцент)
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--accent)",
  none: "var(--text-muted)",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Высокий приоритет",
  medium: "Средний приоритет",
  low: "Низкий приоритет",
  none: "Без приоритета",
};

// микро-пауза перед закрытием шторки: подсветка строки + ✓ успевают проиграть (DESIGN §6)
const SELECT_DELAY_MS = 140;

export function Flag({ color, filled = true }: { color: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" fill={filled ? color : "none"} />
    </svg>
  );
}

export function PriorityPicker({ value, onPick, onClose }: { value: Priority; onPick: (p: Priority) => void; onClose: () => void }) {
  const order: Priority[] = ["high", "medium", "low", "none"];
  const [picked, setPicked] = useState<Priority | null>(null);

  function choose(p: Priority) {
    if (picked != null) return;
    setPicked(p);
    onPick(p);
    window.setTimeout(onClose, SELECT_DELAY_MS);
  }

  return (
    <Sheet onClose={onClose}>
      {order.map((p) => {
        const sel = picked != null ? picked === p : value === p;
        return (
          <button
            key={p}
            className={`menu-item picker-row ${sel ? "selected" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
            onClick={() => choose(p)}
          >
            <Flag color={PRIORITY_COLOR[p]} filled={p !== "none"} />
            <span style={{ flex: 1, textAlign: "left" }}>{PRIORITY_LABEL[p]}</span>
            {sel && <span className="picker-check">✓</span>}
          </button>
        );
      })}
    </Sheet>
  );
}

export interface ProjectPickerSheetProps {
  value: number | null;
  onPick: (id: number | null) => void;
  onClose: () => void;
  /**
   * Контролируемый режим: если передан — picker не грузит сам, а отражает
   * переданное состояние (используется в TaskComposer и harness).
   * Если не передан — picker сам грузит проекты с локальным loading/error.
   */
  projects?: Project[];
  loading?: boolean;
  error?: boolean;
  /** Колбэк после создания проекта из picker'а (рефетч/локальный апдейт у вызывающего). */
  onProjectsChange?: (next: Project[]) => void;
  /** Повтор загрузки в контролируемом режиме (кнопка «Повторить» в состоянии ошибки). */
  onRetry?: () => void;
}

export function ProjectPickerSheet(props: ProjectPickerSheetProps) {
  const controlled = props.projects !== undefined;

  // неконтролируемый режим: собственный жизненный цикл загрузки
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [localLoading, setLocalLoading] = useState(!controlled);
  const [localError, setLocalError] = useState(false);

  function load() {
    setLocalLoading(true);
    setLocalError(false);
    getProjects()
      .then((ps) => { setLocalProjects(ps); setLocalLoading(false); })
      .catch(() => { setLocalError(true); setLocalLoading(false); });
  }

  useEffect(() => {
    if (!controlled) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projects = controlled ? props.projects! : localProjects;
  const loading = controlled ? !!props.loading : localLoading;
  const error = controlled ? !!props.error : localError;

  const { value, onPick, onClose, onProjectsChange, onRetry } = props;

  const [picked, setPicked] = useState<number | null | undefined>(undefined); // undefined = ничего ещё не выбрано в этом сеансе
  const [createOpen, setCreateOpen] = useState(false);

  // Сворачиваемое дерево (как в «Списках»): по умолчанию свёрнуто, авто-раскрываем
  // путь к текущему выбранному проекту, чтобы он был виден при открытии.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || projects.length === 0) return;
    didInit.current = true;
    if (value != null) {
      const byId = new Map(projects.map((p) => [p.id, p]));
      const anc = new Set<number>();
      let cur = byId.get(value);
      let g = 0;
      while (cur && cur.parent_id != null && g++ < 16) {
        anc.add(cur.parent_id);
        cur = byId.get(cur.parent_id);
      }
      if (anc.size) setExpanded(anc);
    }
  }, [projects, value]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const childCount = useMemo(() => childCountMap(projects), [projects]);
  const subtreeCount = useMemo(() => subtreeCountMap(projects), [projects]);
  const rows = flatten(projects, { expanded });

  function retry() {
    if (controlled) onRetry?.();
    else load();
  }

  function choose(id: number | null) {
    if (picked !== undefined) return; // защита от двойного тапа во время паузы
    setPicked(id);
    onPick(id);
    window.setTimeout(onClose, SELECT_DELAY_MS);
  }

  async function handleCreate(v: ProjectFormValue) {
    const created = await createProject(v.name, { parent_id: v.parent_id, color: v.color, icon: v.icon });
    const next = projects.some((p) => p.id === created.id) ? projects : [...projects, created];
    if (controlled) onProjectsChange?.(next);
    else setLocalProjects(next);
    setCreateOpen(false);
    choose(created.id); // выбрать только что созданный (decision A: убрать тупик пустого)
  }

  // строка выбора (общий рендер: Inbox + узлы дерева)
  const isPicked = (id: number | null) => (picked !== undefined ? picked === id : value === id);

  return (
    <>
      <Sheet onClose={onClose}>
        <div className="menu-head"><span style={{ fontWeight: 600 }}>Проект</span></div>

        {loading ? (
          <div className="picker-skeleton" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton picker-skel-row" />)}
          </div>
        ) : error ? (
          <div className="picker-state">
            <div className="muted">Не удалось загрузить проекты</div>
            <button className="btn btn-ghost" onClick={retry}>Повторить</button>
          </div>
        ) : (
          <>
            <button
              className={`menu-item picker-row ${isPicked(null) ? "selected" : ""}`}
              style={{ display: "flex", gap: 12, alignItems: "center" }}
              onClick={() => choose(null)}
            >
              <span className="drawer-ico">📥</span>
              <span style={{ flex: 1, textAlign: "left" }}>Входящие</span>
              {isPicked(null) && <span className="picker-check">✓</span>}
            </button>

            {rows.map(({ depth, ...p }) => {
              const pad = indentFor(depth);
              const hasChildren = (childCount.get(p.id) ?? 0) > 0;
              const cnt = subtreeCount.get(p.id) ?? 0;
              const open = expanded.has(p.id);
              return (
                <button
                  key={p.id}
                  className={`menu-item picker-row ${isPicked(p.id) ? "selected" : ""}`}
                  style={{ display: "flex", gap: 12, alignItems: "center", paddingLeft: pad }}
                  onClick={() => choose(p.id)}
                >
                  <span style={{ flex: "0 0 auto" }}>{p.icon ?? "•"}</span>
                  <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  {cnt > 0 && <span className="drawer-count">{cnt}</span>}
                  {hasChildren && (
                    <span
                      role="button"
                      className="tree-btn"
                      aria-label={open ? "Свернуть" : "Раскрыть"}
                      onClick={(e) => { e.stopPropagation(); toggle(p.id); }}
                    >
                      <span className={`tree-chev ${open ? "open" : ""}`}><IcoChevron /></span>
                    </span>
                  )}
                  {isPicked(p.id) && <span className="picker-check">✓</span>}
                </button>
              );
            })}

            {rows.length === 0 && (
              <div className="picker-empty muted">Проектов пока нет — создайте первый.</div>
            )}

            <button
              className="menu-item drawer-add picker-add"
              style={{ display: "flex", gap: 12, alignItems: "center" }}
              onClick={() => setCreateOpen(true)}
            >
              <span className="drawer-ico" style={{ color: "var(--text-muted)" }}>+</span>
              <span style={{ flex: 1, textAlign: "left" }}>Новый проект</span>
            </button>
          </>
        )}
      </Sheet>

      {createOpen && (
        <ProjectSheet
          projects={projects}
          mode="create"
          defaultParentId={null}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

export function TagPickerSheet({
  value, onChange, onClose,
}: { value: number[]; onChange: (ids: number[]) => void; onClose: () => void }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => { getTags().then(setTags).catch(() => setTags([])); }, []);

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  async function add() {
    const name = draft.trim();
    if (!name) return;
    const t = await createTag(name);
    setDraft("");
    setTags((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
    if (!value.includes(t.id)) onChange([...value, t.id]);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="menu-head"><span style={{ fontWeight: 600 }}>Теги</span></div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" placeholder="Новый тег..." value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <button className="btn" onClick={add}>+</button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {tags.map((t) => (
          <button key={t.id} className={value.includes(t.id) ? "btn-chip active" : "btn-chip"} onClick={() => toggle(t.id)}>
            #{t.name}
          </button>
        ))}
        {tags.length === 0 && <span className="muted">Тегов пока нет</span>}
      </div>
      <button className="btn btn-block" style={{ marginTop: 16 }} onClick={onClose}>Готово</button>
    </Sheet>
  );
}
