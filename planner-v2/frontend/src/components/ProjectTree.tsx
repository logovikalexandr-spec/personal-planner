import { useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "../types";
import { IcoDot } from "./icons";

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
      if (it.parent_id === cur) {
        out.push(it.id);
        stack.push(it.id);
      }
    }
  }
  return out;
}

// flatten respecting expanded state; collapsed nodes hide their subtree
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

function getProjection(
  items: FlatProject[],
  activeId: number,
  overId: number,
  dragOffsetX: number,
): Projection {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const newItems = arrayMoveLocal(items, activeIndex, overIndex);
  const prev = newItems[overIndex - 1];
  const next = newItems[overIndex + 1];
  const dragDepth = Math.round(dragOffsetX / INDENT);
  const projectedRaw = (items[activeIndex]?.depth ?? 0) + dragDepth;

  const maxDepth = prev ? Math.min(prev.depth + 1, 2) : 0; // cap nesting at 2 levels deep
  const minDepth = next ? next.depth : 0;
  let depth = projectedRaw;
  if (depth > maxDepth) depth = maxDepth;
  if (depth < minDepth) depth = minDepth;

  let parentId: number | null = null;
  if (depth > 0 && prev) {
    if (depth === prev.depth) parentId = prev.parent_id;
    else if (depth > prev.depth) parentId = prev.id;
    else {
      const ancestor = newItems
        .slice(0, overIndex)
        .reverse()
        .find((i) => i.depth === depth);
      parentId = ancestor?.parent_id ?? null;
    }
  }
  return { depth, parentId };
}

function arrayMoveLocal<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

function Row({
  item, projectedDepth, isActiveSelected, hasChildren, expanded, count,
  onSelect, onToggle, onLongPress,
}: {
  item: FlatProject;
  projectedDepth: number;
  isActiveSelected: boolean;
  hasChildren: boolean;
  expanded: boolean;
  count: number;
  onSelect: () => void;
  onToggle: () => void;
  onLongPress: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: 16 + projectedDepth * INDENT,
    opacity: isDragging ? 0.4 : 1,
  };

  function cancelPress() {
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }
  const onDown = (e: React.PointerEvent) => {
    (listeners as Record<string, ((e: React.PointerEvent) => void) | undefined>)?.onPointerDown?.(e);
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => { longPressed.current = true; onLongPress(); }, 480);
  };
  const onUp = () => cancelPress();
  const onMove = () => cancelPress();
  const onClick = () => {
    if (longPressed.current) { longPressed.current = false; return; }
    onSelect();
  };

  return (
    <div
      ref={setNodeRef}
      className={`drawer-row ${isActiveSelected ? "active" : ""}`}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerMove={onMove}
      onPointerCancel={onUp}
      onClick={onClick}
    >
      <span className="drawer-ico">
        {item.icon ? (
          <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
        ) : item.color ? (
          <span style={{ display: "block", width: 11, height: 11, borderRadius: "50%", background: item.color, margin: "0 auto" }} />
        ) : (
          <IcoDot />
        )}
      </span>
      <span className="drawer-label">{item.pinned ? "📌 " : ""}{item.name}</span>
      {count > 0 && <span className="drawer-count">{count}</span>}
      {hasChildren && (
        <span className="drawer-exp" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {expanded ? "▾" : "▸"}
        </span>
      )}
    </div>
  );
}

export function ProjectTree({
  projects, activeProjectId, expanded, subtreeCount,
  onSelect, onToggle, onLongPress, onReorder,
}: {
  projects: Project[];
  activeProjectId: number | null;
  expanded: Set<number>;
  subtreeCount: (id: number) => number;
  onSelect: (p: Project) => void;
  onToggle: (id: number) => void;
  onLongPress: (p: Project) => void;
  onReorder: (items: { id: number; parent_id: number | null; order_index: number }[]) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
  );

  const flat = useMemo(() => flatten(projects, expanded), [projects, expanded]);

  // hide descendants of the dragged (collapsed-or-not) node while dragging
  const visible = useMemo(() => {
    if (activeId == null) return flat;
    const desc = new Set(getDescendants(flat, activeId));
    return flat.filter((i) => !desc.has(i.id));
  }, [flat, activeId]);

  const projection =
    activeId != null && overId != null
      ? getProjection(visible, activeId, overId, offsetX)
      : null;

  const ids = visible.map((i) => i.id);
  const childCount = (id: number) => flat.filter((i) => i.parent_id === id).length;

  function handleStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
    setOverId(Number(e.active.id));
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

    // recompute order_index per parent group in new visual order
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
            hasChildren={childCount(item.id) > 0}
            expanded={expanded.has(item.id)}
            count={subtreeCount(item.id)}
            onSelect={() => onSelect(item)}
            onToggle={() => onToggle(item.id)}
            onLongPress={() => onLongPress(item)}
          />
        ))}
      </SortableContext>
      <DragOverlay>
        {activeItem ? (
          <div className="drawer-row" style={{ paddingLeft: 16, background: "var(--surface-2)", borderRadius: 10 }}>
            <span className="drawer-ico">
              {activeItem.icon ? <span style={{ fontSize: 18 }}>{activeItem.icon}</span> : <IcoDot />}
            </span>
            <span className="drawer-label">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
