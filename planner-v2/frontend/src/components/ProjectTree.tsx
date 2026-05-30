import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import {
  DndContext, MouseSensor, TouchSensor, closestCenter,
  useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Project } from "../types";
import { childCountMap, flatten, indentFor, type FlatProject } from "../lib/projectTree";
import { IcoChevron, IcoDot, IcoMore, IcoPin } from "./icons";
import { tg } from "../telegram";

export type { FlatProject };

function arrayMoveLocal<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

function Icon({ p }: { p: Project }) {
  if (p.icon) return <span style={{ fontSize: 18, lineHeight: 1 }}>{p.icon}</span>;
  if (p.color)
    return <span style={{ display: "block", width: 11, height: 11, borderRadius: "50%", background: p.color, margin: "0 auto" }} />;
  return <IcoDot />;
}

function Row({
  item, isActiveSelected, hasChildren, expanded, count, onSelect, onToggle, onMenu,
}: {
  item: FlatProject;
  isActiveSelected: boolean;
  hasChildren: boolean;
  expanded: boolean;
  count: number;
  onSelect: () => void;
  onToggle: () => void;
  onMenu: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const translate = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined;
  const style = {
    transform: isDragging && translate ? `${translate} scale(1.02)` : translate,
    transition,
    paddingLeft: indentFor(item.depth),
    zIndex: isDragging ? 50 : undefined,
  };

  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const stopActivators = { onPointerDown: stop, onTouchStart: stop, onMouseDown: stop };

  return (
    <div
      ref={setNodeRef}
      className={`drawer-row tree-row ${isActiveSelected ? "active" : ""} ${isDragging ? "lifted" : ""}`}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
    >
      <span className="drawer-ico"><Icon p={item} /></span>
      <span className="drawer-label">
        {item.pinned && <span className="tree-pin"><IcoPin /></span>}
        {item.name}
      </span>
      {count > 0 && <span className="drawer-count">{count}</span>}
      {hasChildren && (
        <button className="tree-btn" {...stopActivators} onClick={(e) => { stop(e); onToggle(); }}>
          <span className={`tree-chev ${expanded ? "open" : ""}`}><IcoChevron /></span>
        </button>
      )}
      <button className="tree-btn" {...stopActivators} onClick={(e) => { stop(e); onMenu(); }} aria-label="Меню">
        <IcoMore />
      </button>
    </div>
  );
}

export function ProjectTree({
  projects, activeProjectId, expanded, subtreeCount, onSelect, onToggle, onMenu, onReorder, onDragActiveChange,
}: {
  projects: Project[];
  activeProjectId: number | null;
  expanded: Set<number>;
  subtreeCount: (id: number) => number;
  onSelect: (p: Project) => void;
  onToggle: (id: number) => void;
  onMenu: (p: Project) => void;
  onReorder: (items: { id: number; parent_id: number | null; order_index: number }[]) => void;
  onDragActiveChange?: (active: boolean) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);

  // ONE touch sensor only (Pointer+Touch together breaks on iOS WebView). Mouse for desktop.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 10 } }),
  );

  // While dragging, kill native scroll without touching touch-action (which would
  // cancel the active touch on iOS). Non-passive preventDefault leaves the gesture intact.
  useEffect(() => {
    if (activeId == null) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [activeId]);

  const flat = useMemo(() => flatten(projects, { expanded }), [projects, expanded]);

  const childCount = useMemo(() => childCountMap(projects), [projects]);

  const ids = flat.map((i) => i.id);

  function handleStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
    onDragActiveChange?.(true);
    (tg() as { HapticFeedback?: { impactOccurred?: (s: string) => void } } | undefined)
      ?.HapticFeedback?.impactOccurred?.("medium");
  }

  function handleEnd(e: DragEndEvent) {
    const aId = activeId;
    setActiveId(null);
    onDragActiveChange?.(false);
    if (aId == null || !e.over) return;
    const overId = Number(e.over.id);
    if (overId === aId) return;

    const activeItem = flat.find((i) => i.id === aId);
    if (!activeItem) return;
    const parent = activeItem.parent_id ?? null;

    const aIdx = flat.findIndex((i) => i.id === aId);
    const oIdx = flat.findIndex((i) => i.id === overId);
    if (aIdx < 0 || oIdx < 0) return;

    // reorder within the SAME parent only — never reparent via drag
    const moved = arrayMoveLocal(flat, aIdx, oIdx);
    const siblings = moved.filter((i) => (i.parent_id ?? null) === parent);
    const payload = siblings.map((i, idx) => ({ id: i.id, parent_id: parent, order_index: idx }));
    onReorder(payload);
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      collisionDetection={closestCenter}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => { setActiveId(null); onDragActiveChange?.(false); }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {flat.map((item) => (
          <Row
            key={item.id}
            item={item}
            isActiveSelected={activeProjectId === item.id}
            hasChildren={(childCount.get(item.id) ?? 0) > 0}
            expanded={expanded.has(item.id)}
            count={subtreeCount(item.id)}
            onSelect={() => onSelect(item)}
            onToggle={() => onToggle(item.id)}
            onMenu={() => onMenu(item)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
