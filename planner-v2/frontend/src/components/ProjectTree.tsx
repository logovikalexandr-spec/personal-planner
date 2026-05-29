import { useMemo, useState, type SyntheticEvent } from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "../types";
import { IcoDot, IcoMore } from "./icons";
import { tg } from "../telegram";

const INDENT = 22;

export interface FlatProject extends Project {
  depth: number;
}

interface Projection {
  depth: number;
  parentId: number | null;
}

function getDescendants(items: FlatProject[], id: number): number[] {
  const out: number[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const it of items) {
      if (it.parent_id === cur) { out.push(it.id); stack.push(it.id); }
    }
  }
  return out;
}

function flatten(projects: Project[], expanded: Set<number>): FlatProject[] {
  const byParent = new Map<number | null, Project[]>();
  for (const p of projects) {
    if (p.is_inbox) continue;
    const k = p.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(p);
  }
  const out: FlatProject[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const p of byParent.get(parent) ?? []) {
      out.push({ ...p, depth });
      if (expanded.has(p.id)) walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function arrayMoveLocal<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

function getProjection(items: FlatProject[], activeId: number, overId: number, dragOffsetX: number): Projection {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const newItems = arrayMoveLocal(items, activeIndex, overIndex);
  const prev = newItems[overIndex - 1];
  const next = newItems[overIndex + 1];
  const dragDepth = Math.round(dragOffsetX / INDENT);
  const projectedRaw = (items[activeIndex]?.depth ?? 0) + dragDepth;

  const maxDepth = prev ? Math.min(prev.depth + 1, 2) : 0;
  const minDepth = next ? next.depth : 0;
  let depth = projectedRaw;
  if (depth > maxDepth) depth = maxDepth;
  if (depth < minDepth) depth = minDepth;

  let parentId: number | null = null;
  if (depth > 0 && prev) {
    if (depth === prev.depth) parentId = prev.parent_id;
    else if (depth > prev.depth) parentId = prev.id;
    else {
      const ancestor = newItems.slice(0, overIndex).reverse().find((i) => i.depth === depth);
      parentId = ancestor?.parent_id ?? null;
    }
  }
  return { depth, parentId };
}

function Icon({ p }: { p: Project }) {
  if (p.icon) return <span style={{ fontSize: 18, lineHeight: 1 }}>{p.icon}</span>;
  if (p.color)
    return <span style={{ display: "block", width: 11, height: 11, borderRadius: "50%", background: p.color, margin: "0 auto" }} />;
  return <IcoDot />;
}

function Row({
  item, projectedDepth, isActiveSelected, hasChildren, expanded, count, onSelect, onToggle, onMenu,
}: {
  item: FlatProject;
  projectedDepth: number;
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

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: 16 + projectedDepth * INDENT,
    opacity: isDragging ? 0.35 : 1,
  };

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      className={`drawer-row tree-row ${isActiveSelected ? "active" : ""}`}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
    >
      <span className="drawer-ico"><Icon p={item} /></span>
      <span className="drawer-label">{item.pinned ? "📌 " : ""}{item.name}</span>
      {count > 0 && <span className="drawer-count">{count}</span>}
      {hasChildren && (
        <button className="tree-btn" onPointerDown={stop} onClick={(e) => { stop(e); onToggle(); }}>
          <span className={`tree-chev ${expanded ? "open" : ""}`}>▸</span>
        </button>
      )}
      <button className="tree-btn" onPointerDown={stop} onClick={(e) => { stop(e); onMenu(); }} aria-label="Меню">
        <IcoMore />
      </button>
    </div>
  );
}

export function ProjectTree({
  projects, activeProjectId, expanded, subtreeCount, onSelect, onToggle, onMenu, onReorder,
}: {
  projects: Project[];
  activeProjectId: number | null;
  expanded: Set<number>;
  subtreeCount: (id: number) => number;
  onSelect: (p: Project) => void;
  onToggle: (id: number) => void;
  onMenu: (p: Project) => void;
  onReorder: (items: { id: number; parent_id: number | null; order_index: number }[]) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  // hold-to-drag: 220ms press picks up; moving before that scrolls the drawer
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const flat = useMemo(() => flatten(projects, expanded), [projects, expanded]);

  // hasChildren from the FULL list, independent of expand state
  const childCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of projects) {
      if (p.is_inbox || p.parent_id == null) continue;
      m.set(p.parent_id, (m.get(p.parent_id) ?? 0) + 1);
    }
    return m;
  }, [projects]);

  const visible = useMemo(() => {
    if (activeId == null) return flat;
    const desc = new Set(getDescendants(flat, activeId));
    return flat.filter((i) => !desc.has(i.id));
  }, [flat, activeId]);

  const projection =
    activeId != null && overId != null ? getProjection(visible, activeId, overId, offsetX) : null;

  const ids = visible.map((i) => i.id);

  function handleStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
    setOverId(Number(e.active.id));
    (tg() as { HapticFeedback?: { impactOccurred?: (s: string) => void } } | undefined)
      ?.HapticFeedback?.impactOccurred?.("medium");
  }
  function handleMove(e: DragMoveEvent) {
    setOffsetX(e.delta.x);
    if (e.over) setOverId(Number(e.over.id));
  }
  function handleEnd(e: DragEndEvent) {
    const aId = activeId;
    const proj = projection;
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
    if (aId == null || !e.over || !proj) return;

    const overIndex = visible.findIndex((i) => i.id === Number(e.over!.id));
    const activeIndex = visible.findIndex((i) => i.id === aId);
    const reordered = arrayMoveLocal(visible, activeIndex, overIndex).map((i) =>
      i.id === aId ? { ...i, parent_id: proj.parentId, depth: proj.depth } : i,
    );
    const counters = new Map<number | null, number>();
    const payload = reordered.map((i) => {
      const n = counters.get(i.parent_id) ?? 0;
      counters.set(i.parent_id, n + 1);
      return { id: i.id, parent_id: i.parent_id, order_index: n };
    });
    onReorder(payload);
  }

  const activeItem = flat.find((i) => i.id === activeId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleStart}
      onDragMove={handleMove}
      onDragEnd={handleEnd}
      onDragCancel={() => { setActiveId(null); setOverId(null); setOffsetX(0); }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {visible.map((item) => (
          <Row
            key={item.id}
            item={item}
            projectedDepth={activeId === item.id && projection ? projection.depth : item.depth}
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
      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
        {activeItem ? (
          <div className="drawer-row drag-ghost">
            <span className="drawer-ico"><Icon p={activeItem} /></span>
            <span className="drawer-label">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
