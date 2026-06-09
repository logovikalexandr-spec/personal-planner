import { memo, useEffect, useMemo, useRef, useState } from "react";
import { IcoBellMicro, IcoRepeatMicro, IcoCheck } from "./icons";
import { tg } from "../telegram";
import type { Priority, Project, Task } from "../types";
import {
  HOUR_H, STEP_MIN, PX_PER_MIN, DAY_END,
  parseMin, hhmm, clamp, snap15, layoutColumns,
} from "../lib/timelineLayout";

const START_HOUR = 5; // таймлайн начинается с 05:00 (ночь 00–04 скрыта, если на неё нет задач)
const LONGPRESS_MS = 220;       // удержание тела блока → «поднять» для переноса
const CANCEL_PX = 12;           // сдвиг до long-press = это скролл, отменяем подъём (tolerance как у dnd-kit)

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

  // Раскладка пересекающихся блоков по колонкам (Apple-стиль).
  const cols = useMemo(() => layoutColumns(
    timed.map((t) => {
      const s = parseMin(t.due_time)!;
      const e = parseMin(t.end_time);
      return { id: t.id, startMin: s, endMin: e && e > s ? e : s + 60 };
    }),
  ), [timed]);
  const GUTTER = 4; // px между колонками
  const LANE_LEFT = 56;
  const LANE_RIGHT = 8;
  function laneStyle(colIndex: number, colCount: number): React.CSSProperties {
    return {
      left: `calc(${LANE_LEFT}px + (100% - ${LANE_LEFT + LANE_RIGHT}px) * ${colIndex / colCount} + ${colIndex ? GUTTER : 0}px)`,
      width: `calc((100% - ${LANE_LEFT + LANE_RIGHT}px) * ${1 / colCount} - ${colCount > 1 ? GUTTER : 0}px)`,
      right: "auto",
    };
  }

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

  // Глушим нативный скролл на время жеста (как ProjectTree на шторке): non-passive
  // touchmove с preventDefault — иначе iOS WebView начинает скролл и срывает перенос.
  const blockerRef = useRef<((e: TouchEvent) => void) | null>(null);
  function startBlocking() {
    if (blockerRef.current) return;
    const fn = (e: TouchEvent) => e.preventDefault();
    blockerRef.current = fn;
    document.addEventListener("touchmove", fn, { passive: false });
  }
  function stopBlocking() {
    if (blockerRef.current) {
      document.removeEventListener("touchmove", blockerRef.current);
      blockerRef.current = null;
    }
  }
  useEffect(() => () => stopBlocking(), []);

  // ── края: ресайз сразу по нажатию (без long-press) ──
  function onEdgeDown(e: React.PointerEvent, t: Task, edge: "top" | "bottom", baseStart: number, baseEnd: number) {
    if (!onResize) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pickedRef.current = false;
    movedRef.current = false;
    startBlocking();
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
      startBlocking();
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
    // непрерывный сдвиг (без снапа) → блок плавно следует за пальцем, не дёргается
    const deltaMin = (e.clientY - d.originY) / PX_PER_MIN;
    if (Math.abs(deltaMin) >= 1) movedRef.current = true;
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
    stopBlocking();
    const d = dragRef.current;
    dragRef.current = null;
    pickedRef.current = false;
    if (!d) return;
    setDrag((cur) => {
      if (cur && movedRef.current) {
        // снап к 15 мин ТОЛЬКО на отпускании; move сохраняет длительность
        let s: number;
        let en: number;
        if (d.edge === "move") {
          const dur = d.baseEnd - d.baseStart;
          s = clamp(snap15(cur.startMin), offsetMin, DAY_END - dur);
          en = s + dur;
        } else if (d.edge === "top") {
          s = clamp(snap15(cur.startMin), offsetMin, d.baseEnd - STEP_MIN);
          en = d.baseEnd;
        } else {
          s = d.baseStart;
          en = clamp(snap15(cur.endMin), d.baseStart + STEP_MIN, DAY_END);
        }
        if (s !== d.baseStart || en !== d.baseEnd) {
          haptic("light");
          onResize?.(d.task, { due_time: `${hhmm(s)}:00`, end_time: `${hhmm(en)}:00` });
        }
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
          // позиция следует за пальцем плавно, а время в подписи показываем снапнутым к 15 мин
          const labelStart = live ? snap15(start) : start;
          const labelEnd = live ? snap15(end) : end;
          const c = resolveColor(t.project_id, byId);
          const prio = priorityColor(t.priority); // кант строго по приоритету; none → нет цвета
          const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
          const enabled = !!onResize && !done;
          const lay = cols.get(t.id) ?? { colIndex: 0, colCount: 1 };
          return (
            <div
              key={t.id}
              className={`cal-block ${done ? "done" : ""} ${live ? "resizing" : ""}`}
              style={{
                top: ((start - offsetMin) / 60) * HOUR_H + 1,
                height: Math.max((dur / 60) * HOUR_H - 2, 22),
                borderLeftColor: prio ?? "transparent",
                background: c ? `${c}22` : "var(--surface-2)",
                ...laneStyle(lay.colIndex, lay.colCount),
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
                  <span>{hhmm(labelStart)}–{hhmm(labelEnd)}</span>
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
