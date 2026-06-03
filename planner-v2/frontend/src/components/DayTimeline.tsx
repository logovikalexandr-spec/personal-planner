import { memo, useEffect, useMemo, useRef, useState } from "react";
import { IcoBellMicro, IcoRepeatMicro, IcoCheck } from "./icons";
import { tg } from "../telegram";
import type { Priority, Project, Task } from "../types";

const HOUR_H = 56;
const START_HOUR = 5; // таймлайн начинается с 05:00 (ночь 00–04 скрыта, если на неё нет задач)
const STEP_MIN = 15;            // шаг по времени
const STEP_PX = HOUR_H / 4;     // 56/4 = 14px = 15 минут
const DAY_END = 24 * 60;
const LONGPRESS_MS = 250;       // удержание тела блока → «поднять» для переноса
const CANCEL_PX = 8;            // сдвиг до long-press = это скролл, отменяем подъём

function parseMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function haptic(style: "light" | "medium" = "light") {
  tg()?.HapticFeedback?.impactOccurred?.(style);
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

/** Единый маппинг приоритета → цвет канта (общий с TaskItem). */
export function priorityColor(priority: Priority): string | null {
  if (priority === "high") return "var(--danger)";
  if (priority === "medium") return "var(--warning)";
  if (priority === "low") return "var(--accent)";
  return null;
}

type Drag = { id: number; startMin: number; endMin: number };
type Edge = "top" | "bottom" | "move";

export const DayTimeline = memo(function DayTimeline({
  tasks, byId, isToday, onTapHour, onToggle, onOpen, onResize, autoScroll = true, nowAnchorId,
}: {
  tasks: Task[];
  byId: Map<number, Project>;
  isToday: boolean;
  onTapHour: (hour: number) => void;
  onToggle: (t: Task) => void;
  onOpen?: (t: Task) => void;
  /** Перенос/ресайз блока (шаг 15 мин). Если не передан — жесты выключены. */
  onResize?: (t: Task, patch: { due_time: string; end_time: string }) => void;
  autoScroll?: boolean;
  /** id на now-линии — якорь для прыжок-скролла «Сегодня» (Today timeline). */
  nowAnchorId?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timed = useMemo(() => tasks.filter((t) => t.due_time), [tasks]);

  // Начало сетки: 05:00, но растягиваем раньше, если есть задача до 05:00 (edge — задача не теряется).
  const startHour = useMemo(() => {
    let min = START_HOUR;
    for (const t of timed) {
      const m = parseMin(t.due_time);
      if (m != null) min = Math.min(min, Math.floor(m / 60));
    }
    return min;
  }, [timed]);
  const HOURS = useMemo(
    () => Array.from({ length: 24 - startHour }, (_, i) => startHour + i),
    [startHour],
  );
  const offsetMin = startHour * 60;

  // Поминутный пересчёт линии «сейчас» (мгновенный, без transition — §6).
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    if (!isToday) return;
    const id = window.setInterval(() => {
      setNowMin(new Date().getHours() * 60 + new Date().getMinutes());
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isToday]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const focusHour = isToday ? new Date().getHours() : 9;
    el.scrollTop = Math.max(0, (focusHour - startHour) * HOUR_H - HOUR_H);
  }, [autoScroll, isToday, startHour]);

  // Жесты: drag = живое состояние перетаскиваемого блока; refs хранят базу/режим.
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<{ task: Task; edge: Edge; originY: number; baseStart: number; baseEnd: number } | null>(null);
  const lpRef = useRef<number | null>(null);     // таймер long-press (move)
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const pickedRef = useRef(false);               // тело поднято (move активен)
  const movedRef = useRef(false);                // был реальный сдвиг → коммит + подавить тап

  function clearLp() {
    if (lpRef.current != null) { window.clearTimeout(lpRef.current); lpRef.current = null; }
  }

  // ── края: ресайз сразу по нажатию (без long-press) ──
  function onEdgeDown(e: React.PointerEvent, t: Task, edge: "top" | "bottom", baseStart: number, baseEnd: number) {
    if (!onResize) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pickedRef.current = false;
    movedRef.current = false;
    dragRef.current = { task: t, edge, originY: e.clientY, baseStart, baseEnd };
    setDrag({ id: t.id, startMin: baseStart, endMin: baseEnd });
  }

  // ── тело: перенос всего блока по long-press ──
  function onBodyDown(e: React.PointerEvent, t: Task, baseStart: number, baseEnd: number) {
    if (!onResize) return;
    pickedRef.current = false;
    movedRef.current = false;
    downRef.current = { x: e.clientX, y: e.clientY };
    const pid = e.pointerId;
    const el = e.currentTarget as Element;
    clearLp();
    lpRef.current = window.setTimeout(() => {
      pickedRef.current = true;
      haptic("medium");
      el.setPointerCapture?.(pid);
      dragRef.current = { task: t, edge: "move", originY: downRef.current!.y, baseStart, baseEnd };
      setDrag({ id: t.id, startMin: baseStart, endMin: baseEnd });
    }, LONGPRESS_MS);
  }

  function onDragMove(e: React.PointerEvent) {
    // до подъёма: если уехали дальше порога — это скролл/отмена, гасим long-press
    if (!pickedRef.current && dragRef.current?.edge !== "top" && dragRef.current?.edge !== "bottom") {
      const s = downRef.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > CANCEL_PX) clearLp();
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const deltaMin = Math.round((e.clientY - d.originY) / STEP_PX) * STEP_MIN;
    if (deltaMin !== 0) movedRef.current = true;
    if (d.edge === "top") {
      const s = clamp(d.baseStart + deltaMin, offsetMin, d.baseEnd - STEP_MIN);
      setDrag({ id: d.task.id, startMin: s, endMin: d.baseEnd });
    } else if (d.edge === "bottom") {
      const en = clamp(d.baseEnd + deltaMin, d.baseStart + STEP_MIN, DAY_END);
      setDrag({ id: d.task.id, startMin: d.baseStart, endMin: en });
    } else {
      const dur = d.baseEnd - d.baseStart;
      const s = clamp(d.baseStart + deltaMin, offsetMin, DAY_END - dur);
      setDrag({ id: d.task.id, startMin: s, endMin: s + dur });
    }
  }

  function onDragUp() {
    clearLp();
    const d = dragRef.current;
    dragRef.current = null;
    pickedRef.current = false;
    if (!d) return;
    setDrag((cur) => {
      if (cur && movedRef.current && (cur.startMin !== d.baseStart || cur.endMin !== d.baseEnd)) {
        haptic("light");
        onResize?.(d.task, { due_time: `${hhmm(cur.startMin)}:00`, end_time: `${hhmm(cur.endMin)}:00` });
      }
      return null;
    });
  }

  return (
    <div className={`cal-scroll ${autoScroll ? "" : "daytimeline--static"}`} ref={scrollRef} style={{ flex: autoScroll ? 1 : "none" }}>
      <div className="cal-grid" style={{ height: HOURS.length * HOUR_H }}>
        {HOURS.map((h) => (
          <div key={h} className="cal-hour" style={{ height: HOUR_H }} onClick={() => onTapHour(h)}>
            <span className="cal-hourlabel">{`${h}`.padStart(2, "0")}:00</span>
          </div>
        ))}

        {isToday && nowMin >= offsetMin && (
          <div id={nowAnchorId} className="cal-now" style={{ top: ((nowMin - offsetMin) / 60) * HOUR_H }} />
        )}

        {timed.map((t) => {
          const baseStart = parseMin(t.due_time)!;
          const endRaw = parseMin(t.end_time);
          const baseEnd = endRaw && endRaw > baseStart ? endRaw : baseStart + 60;
          const done = t.status === "done";
          const live = drag && drag.id === t.id ? drag : null;
          const start = live ? live.startMin : baseStart;
          const end = live ? live.endMin : baseEnd;
          const dur = end - start;
          const c = resolveColor(t.project_id, byId);
          const prio = priorityColor(t.priority); // кант строго по приоритету; none → нет цвета
          const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
          const enabled = !!onResize && !done;
          return (
            <div
              key={t.id}
              className={`cal-block ${done ? "done" : ""} ${live ? "resizing" : ""}`}
              style={{
                top: ((start - offsetMin) / 60) * HOUR_H + 1,
                height: Math.max((dur / 60) * HOUR_H - 2, 22),
                borderLeftColor: prio ?? "transparent",
                background: c ? `${c}22` : "var(--surface-2)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (pickedRef.current || movedRef.current) return; // подъём/перенос — не открывать
                onOpen?.(t);
              }}
            >
              {enabled && (
                <div
                  className="cal-resize top"
                  onPointerDown={(e) => onEdgeDown(e, t, "top", baseStart, baseEnd)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragUp}
                  onPointerCancel={onDragUp}
                >
                  <span className="cal-resize-grip" />
                </div>
              )}
              <div
                className={`cal-cb ${done ? "done" : ""}`}
                onClick={(e) => { e.stopPropagation(); onToggle(t); }}
                role="button"
                aria-label="done"
              >
                {done ? <IcoCheck /> : null}
              </div>
              <div
                className="cal-block-main"
                onPointerDown={enabled ? (e) => onBodyDown(e, t, baseStart, baseEnd) : undefined}
                onPointerMove={enabled ? onDragMove : undefined}
                onPointerUp={enabled ? onDragUp : undefined}
                onPointerCancel={enabled ? onDragUp : undefined}
              >
                <div className="bt">{proj?.icon ? `${proj.icon} ` : ""}{t.title}</div>
                <div className="bm">
                  <span>{hhmm(start)}–{hhmm(end)}</span>
                  {t.recurrence ? <IcoRepeatMicro /> : null}
                  {t.reminder_at ? <IcoBellMicro /> : null}
                </div>
              </div>
              {enabled && (
                <div
                  className="cal-resize bottom"
                  onPointerDown={(e) => onEdgeDown(e, t, "bottom", baseStart, baseEnd)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragUp}
                  onPointerCancel={onDragUp}
                >
                  <span className="cal-resize-grip" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
