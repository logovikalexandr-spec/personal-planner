import { useEffect, useMemo, useRef, useState } from "react";
import { createProject, deleteProject, getCounts, getProjects, patchProject, reorderProjects } from "../api";
import { canHaveChild, subtreeCountMap } from "../lib/projectTree";
import { IcoAll, IcoInbox, IcoNext7, IcoOverdue, IcoPlus, IcoTodaySmall, IcoTomorrow } from "./icons";
import { ProjectTree, type TreeLoadState } from "./ProjectTree";
import { ProjectMenu } from "./ProjectMenu";
import { ProjectSheet, type ProjectFormValue } from "./ProjectSheet";
import { confirmDialog } from "../lib/confirm";
import type { ActiveList, Counts, Project, SmartKey } from "../types";

// Унифицированный заголовок секции смарт-списков (Drawer + Lists — один текст).
export const SMART_SECTION_LABEL = "Смарт-списки";

const SMART: { key: SmartKey; title: string; Ico: () => JSX.Element }[] = [
  { key: "all", title: "Все", Ico: IcoAll },
  { key: "today", title: "Сегодня", Ico: IcoTodaySmall },
  { key: "tomorrow", title: "Завтра", Ico: IcoTomorrow },
  { key: "next7", title: "Следующие 7 дней", Ico: IcoNext7 },
  { key: "overdue", title: "Просрочено", Ico: IcoOverdue },
  { key: "inbox", title: "Входящие", Ico: IcoInbox },
];

function countFor(k: SmartKey, c: Counts | null): number {
  if (!c) return 0;
  if (k === "all") return c.all;
  if (k === "today") return c.today;
  if (k === "overdue") return c.overdue;
  if (k === "tomorrow") return c.tomorrow;
  if (k === "next7") return c.next7;
  if (k === "inbox") return c.inbox;
  return 0;
}

type SheetState =
  | { mode: "create"; parentId: number | null }
  | { mode: "edit"; project: Project };

export interface ProjectTreePanelProps {
  active: ActiveList;
  /**
   * Выбор смарт-списка/проекта. В screen-режиме просто меняет активный список
   * (Drawer не закрывается, потому что его нет). В drawer-режиме вызывающая
   * сторона дополнительно закрывает Drawer (через onAfterSelect).
   */
  onSelect: (a: ActiveList) => void;
  /** drawer = оверлей-шторка; screen = полноэкранный таб «Списки». */
  variant: "drawer" | "screen";
  /** Drawer-режим: вызывается ПОСЛЕ onSelect, чтобы закрыть Drawer. */
  onAfterSelect?: () => void;
  /** Сообщать наружу о drag (Drawer выключает edge-swipe/swipe-close во время drag). */
  onDragActiveChange?: (active: boolean) => void;
}

export function ProjectTreePanel({
  active, onSelect, variant, onAfterSelect, onDragActiveChange,
}: ProjectTreePanelProps) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [treeState, setTreeState] = useState<TreeLoadState>("loading");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [menuFor, setMenuFor] = useState<Project | null>(null);
  const didInitExpand = useRef(false);

  function loadProjects() {
    setTreeState("loading");
    getProjects().then((ps) => {
      setProjects(ps);
      setTreeState("ready");
      // Дефолт — всё СВЁРНУТО (по слову владельца): подсписки скрыты, раскрывает сам.
      // Раскрываем только цепочку к активному проекту, чтобы он был виден.
      if (!didInitExpand.current) {
        didInitExpand.current = true;
        if (active.kind === "project") {
          const byId = new Map(ps.map((p) => [p.id, p]));
          const chain = new Set<number>();
          let cur = byId.get(active.id)?.parent_id ?? null;
          while (cur != null) { chain.add(cur); cur = byId.get(cur)?.parent_id ?? null; }
          if (chain.size) setExpanded(chain);
        }
      }
    }).catch(() => setTreeState("error"));
  }
  useEffect(() => {
    getCounts().then(setCounts).catch(() => setCounts(null));
    loadProjects();
  }, []);

  const subtree = useMemo(() => subtreeCountMap(projects), [projects]);
  const subtreeCount = (id: number) => subtree.get(id) ?? 0;

  function toggle(id: number) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectList(a: ActiveList) {
    onSelect(a);
    if (variant === "drawer") onAfterSelect?.();
  }

  const isActiveSmart = (k: SmartKey) => active.kind === "smart" && active.key === k;
  const activeProjectId = active.kind === "project" ? active.id : null;

  async function handleSubmit(value: ProjectFormValue) {
    if (sheet?.mode === "edit") {
      await patchProject(sheet.project.id, value);
    } else {
      const created = await createProject(value.name, { parent_id: value.parent_id, color: value.color, icon: value.icon });
      if (created.parent_id != null) setExpanded((s) => new Set(s).add(created.parent_id!));
    }
    setSheet(null);
    loadProjects();
  }
  async function togglePin(p: Project) {
    setMenuFor(null);
    await patchProject(p.id, { pinned: !p.pinned });
    loadProjects();
  }
  function requestDelete(p: Project) {
    setMenuFor(null);
    confirmDialog(`Удалить «${p.name}»?`, { body: "Задачи уйдут во «Входящие»." }).then((ok) => {
      if (ok) deleteProject(p.id).then(loadProjects);
    });
  }
  async function handleReorder(items: { id: number; parent_id: number | null; order_index: number }[]) {
    const patchMap = new Map(items.map((i) => [i.id, i]));
    setProjects((prev) =>
      prev
        .map((p) => { const u = patchMap.get(p.id); return u ? { ...p, parent_id: u.parent_id, order_index: u.order_index } : p; })
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order_index - b.order_index || a.name.localeCompare(b.name)),
    );
    // Оптимистик уже переставил локально тем же sort, что персистит сервер (pinned, order_index,
    // name) → серверная правда == текущий стейт. НЕ перезагружаем на успехе: loadProjects дёргал
    // treeState→"loading" (скелетон-флип) + полный setProjects ремонтил dnd-список = экран дёргался
    // после дропа. Перезагрузка ТОЛЬКО при ошибке — откатить к правде сервера.
    try { await reorderProjects(items); } catch { loadProjects(); }
  }

  return (
    <>
      <div className="drawer-section">{SMART_SECTION_LABEL}</div>
      {SMART.map(({ key, title, Ico }) => (
        <div
          key={key}
          className={`drawer-row ${isActiveSmart(key) ? "active" : ""}`}
          onClick={() => selectList({ kind: "smart", key, title })}
        >
          <span className="drawer-ico"><Ico /></span>
          <span className="drawer-label">{title}</span>
          {countFor(key, counts) > 0 && <span className="drawer-count">{countFor(key, counts)}</span>}
        </div>
      ))}

      <div className="drawer-sep" />
      <div className="drawer-section">Проекты</div>
      <ProjectTree
        projects={projects}
        activeProjectId={activeProjectId}
        expanded={expanded}
        subtreeCount={subtreeCount}
        onSelect={(p) => selectList({ kind: "project", id: p.id, title: p.name })}
        onToggle={toggle}
        onMenu={(p) => setMenuFor(p)}
        onReorder={handleReorder}
        onDragActiveChange={onDragActiveChange}
        state={treeState}
        onRetry={loadProjects}
      />
      <div className="drawer-row drawer-add" onClick={() => setSheet({ mode: "create", parentId: null })}>
        <span className="drawer-ico"><IcoPlus /></span>
        <span className="drawer-label">Проект</span>
      </div>

      {menuFor && (
        <ProjectMenu
          project={menuFor}
          canCreateSub={canHaveChild(menuFor.id, projects)}
          onClose={() => setMenuFor(null)}
          onCreateSub={() => { const id = menuFor.id; setMenuFor(null); setSheet({ mode: "create", parentId: id }); }}
          onEdit={() => { const p = menuFor; setMenuFor(null); setSheet({ mode: "edit", project: p }); }}
          onTogglePin={() => togglePin(menuFor)}
          onDelete={() => requestDelete(menuFor)}
        />
      )}
      {sheet && (
        <ProjectSheet
          projects={projects}
          mode={sheet.mode}
          initial={sheet.mode === "edit" ? sheet.project : undefined}
          defaultParentId={sheet.mode === "create" ? sheet.parentId : undefined}
          onClose={() => setSheet(null)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
