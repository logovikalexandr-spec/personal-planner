import { memo, useRef, useState } from "react";
import type { Task } from "../types";
import { tg } from "../telegram";
import { shouldShowImpact } from "../lib/impact";
import { stageColor } from "../lib/stage";
import { IcoCalendar2, IcoMove, IcoTrash, IcoCheck, IcoSelectCircle, IcoXCircle, IcoStage } from "./icons";

// Волна 2 F2 — строка задачи со свайпом + long-press → multi-select. Мокапы B (swipe) + D (select/won't-do).
// ОДНО поведение везде (PATTERNS): этот компонент — единственная строка задачи в списках.
// Свайп вправо (короткий) = выполнить (ember). Свайп влево = открыть слот Дата/В список/Удалить.
// Long-press (~450мс) = войти в режим выбора (родитель держит selectMode/selected).
// В режиме выбора: тап = toggle, свайп выключен, слева кружок выбора.

const LEFT_REVEAL = 186; // ширина левого слота (3 кнопки по 62px), мокап B
const RIGHT_REVEAL = 80; // ширина «Готово»
const COMPLETE_THRESHOLD = 64; // свайп вправо дальше этого = сразу выполнить
const OPEN_THRESHOLD = 60; // свайп влево дальше этого = зафиксировать открытый слот
const LONGPRESS_MS = 450;

// Дата/время строки задачи: ISO -> «3 июня», время -> «17:00» (без секунд). Мета DESIGN §"Строка задачи".
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function fmtMeta(date: string | null, time: string | null): string {
  const parts: string[] = [];
  if (date) {
    const d = new Date(date + "T00:00:00");
    if (!Number.isNaN(d.getTime())) parts.push(`${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`);
  }
  if (time) parts.push(time.slice(0, 5));
  return parts.join(" · ");
}
function isOverdueDate(date: string | null): boolean {
  if (!date) return false;
  const today = new Date();
  const t = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
  return date < t;
}

export interface TaskItemProps {
  task: Task;
  onToggle: (t: Task) => void;
  color?: string | null;
  onOpen?: (t: Task) => void;
  // Волна 2 F2: свайп-действия (если не переданы — слот не показывается).
  onSwipeComplete?: (t: Task) => void;
  onSwipeDate?: (t: Task) => void;
  onSwipeMove?: (t: Task) => void;
  onSwipeDelete?: (t: Task) => void;
  // Волна 2 F2: multi-select.
  selectMode?: boolean;
  selected?: boolean;
  onLongPress?: (t: Task) => void;   // войти в режим выбора + выбрать эту
  onSelectToggle?: (t: Task) => void; // тап в режиме выбора
}

function TaskItemBase({
  task, onToggle, color, onOpen,
  onSwipeComplete, onSwipeDate, onSwipeMove, onSwipeDelete,
  selectMode = false, selected = false, onLongPress, onSelectToggle,
}: TaskItemProps) {
  const done = task.status === "done";
  const wontDo = task.status === "wont_do";
  const isOverdue = !done && !wontDo && isOverdueDate(task.due_date);
  // Кант СТРОГО по приоритету (визуал-спека §3): high/medium/low дают полосу,
  // none — нет полосы. Цвет проекта больше НЕ красит кант (ушёл в тинт фона).
  const prio =
    task.priority === "high" ? "prio-high"
    : task.priority === "medium" ? "prio-medium"
    : task.priority === "low" ? "prio-low"
    : "";
  // Фон строки = тинт цвета проекта (~13% alpha). Закрытые/wont_do приглушены, тинт не нужен.
  const tintBg = color && !done && !wontDo ? `${color}22` : undefined;

  const swipeEnabled = !selectMode && (!!onSwipeComplete || !!onSwipeDate || !!onSwipeMove || !!onSwipeDelete);

  // dx = текущее смещение строки; реф для жеста, state для рендера (анимация через transform).
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const lpTimer = useRef<number | null>(null);
  const openSlot = useRef<"left" | "right" | null>(null); // зафиксированный открытый слот

  function haptic(style: "light" | "medium" = "light") {
    tg()?.HapticFeedback?.impactOccurred?.(style);
  }

  function clearLongPress() {
    if (lpTimer.current != null) { window.clearTimeout(lpTimer.current); lpTimer.current = null; }
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    moved.current = false;
    dragging.current = false;
    // long-press → войти в выбор (только если есть колбэк и не в режиме выбора)
    if (onLongPress && !selectMode) {
      clearLongPress();
      lpTimer.current = window.setTimeout(() => {
        if (!moved.current) {
          haptic("medium");
          onLongPress(task);
        }
      }, LONGPRESS_MS);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const t = e.touches[0];
    const ddx = t.clientX - startX.current;
    const ddy = t.clientY - startY.current;
    if (!dragging.current) {
      // решаем направление жеста: горизонталь явно > вертикали → свайп
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy) * 1.4 && swipeEnabled) {
        dragging.current = true;
        clearLongPress();
      } else if (Math.abs(ddx) > 6 || Math.abs(ddy) > 6) {
        moved.current = true;
        clearLongPress();
        return;
      } else {
        return;
      }
    }
    moved.current = true;
    // ограничить ход слотами (с лёгким резиновым перекрытием для жеста-выполнить)
    let next = ddx;
    if (next > 0) next = Math.min(next, RIGHT_REVEAL + 24);
    else next = Math.max(next, -(LEFT_REVEAL + 24));
    setDx(next);
  }

  function onTouchEnd() {
    clearLongPress();
    const wasDragging = dragging.current;
    dragging.current = false;
    startX.current = null;
    startY.current = null;
    if (!wasDragging) return;

    // свайп вправо достаточно далеко → выполнить и схлопнуть
    if (dx > COMPLETE_THRESHOLD && onSwipeComplete) {
      haptic("medium");
      setDx(0);
      openSlot.current = null;
      onSwipeComplete(task);
      return;
    }
    // свайп вправо коротко → зафиксировать слот «Готово»
    if (dx > OPEN_THRESHOLD && onSwipeComplete) {
      setDx(RIGHT_REVEAL);
      openSlot.current = "right";
      return;
    }
    // свайп влево → зафиксировать слот действий
    if (dx < -OPEN_THRESHOLD && (onSwipeDate || onSwipeMove || onSwipeDelete)) {
      setDx(-LEFT_REVEAL);
      openSlot.current = "left";
      return;
    }
    // иначе — закрыть
    setDx(0);
    openSlot.current = null;
  }

  function closeSlot() { setDx(0); openSlot.current = null; }

  function bodyTap() {
    if (openSlot.current) { closeSlot(); return; } // первый тап при открытом слоте — закрыть
    if (selectMode) { onSelectToggle?.(task); return; }
    if (moved.current) return;
    onOpen?.(task);
  }

  const checkboxGlyph = wontDo
    ? <span className="cb-wontdo"><IcoXCircle /></span>
    : (done ? <IcoCheck /> : null);

  return (
    <div className="task-swipe">
      {/* левый слот действий (виден при свайпе влево) */}
      {swipeEnabled && (onSwipeDate || onSwipeMove || onSwipeDelete) && (
        <div className="swipe-actions right" aria-hidden={openSlot.current !== "left"}>
          {onSwipeDate && (
            <button className="swipe-btn date" onClick={() => { closeSlot(); onSwipeDate(task); }}>
              <IcoCalendar2 /><span>Дата</span>
            </button>
          )}
          {onSwipeMove && (
            <button className="swipe-btn move" onClick={() => { closeSlot(); onSwipeMove(task); }}>
              <IcoMove /><span>В список</span>
            </button>
          )}
          {onSwipeDelete && (
            <button className="swipe-btn del" onClick={() => { closeSlot(); onSwipeDelete(task); }}>
              <IcoTrash /><span>Удалить</span>
            </button>
          )}
        </div>
      )}
      {/* правый слот «Готово» (виден при свайпе вправо) */}
      {swipeEnabled && onSwipeComplete && (
        <div className="swipe-actions left" aria-hidden={openSlot.current !== "right"}>
          <button className="swipe-btn done" onClick={() => { closeSlot(); onSwipeComplete(task); }}>
            <IcoCheck /><span>Готово</span>
          </button>
        </div>
      )}

      <div
        className={`task-row ${prio} ${done ? "is-done" : ""} ${wontDo ? "is-wontdo" : ""} ${selected ? "is-selected" : ""}`}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging.current ? "none" : "transform 180ms cubic-bezier(0.22,1,0.36,1)",
          ...(tintBg ? { background: tintBg } : {}),
        }}
        onTouchStart={swipeEnabled || onLongPress ? onTouchStart : undefined}
        onTouchMove={swipeEnabled || onLongPress ? onTouchMove : undefined}
        onTouchEnd={swipeEnabled || onLongPress ? onTouchEnd : undefined}
      >
        {selectMode ? (
          <div className="select-circle" onClick={() => onSelectToggle?.(task)} role="button" aria-label="Выбрать">
            <IcoSelectCircle on={selected} />
          </div>
        ) : (
          <div
            className={`checkbox ${done ? "done" : ""} ${wontDo ? "wontdo" : ""}`}
            onClick={() => onToggle(task)}
            role="button"
            aria-label="done"
          >
            {checkboxGlyph}
          </div>
        )}
        <div className="grow" onClick={bodyTap} style={{ cursor: "pointer" }}>
          <div className={done || wontDo ? "title-done" : ""}>{task.title}</div>
          {wontDo ? (
            <div className="muted mono" style={{ fontSize: 13, marginTop: 2 }}>Не буду делать</div>
          ) : (task.due_date || task.due_time || task.stage_label || shouldShowImpact(task)) ? (
            <div
              className="mono"
              style={{ fontSize: 13, marginTop: 2, color: isOverdue ? "var(--danger)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}
            >
              {(task.due_date || task.due_time) && <span>{fmtMeta(task.due_date, task.due_time)}</span>}
              {task.stage_label && (
                <span className="stagelbl" style={{ color: stageColor(task.stage_status) }}>
                  <IcoStage />{task.stage_label}{task.stage_status === "late" ? " !" : ""}
                </span>
              )}
              {shouldShowImpact(task) && <span className="imp">{task.impact}%</span>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Перф: строка задачи — самый частый компонент. Без memo любой ре-рендер родителя
// перерисовывает ВСЕ строки. memo пропускает рендер при неизменных пропсах
// (нужны стабильные колбэки у родителей — useCallback в Today/TaskListBody/ListView).
export const TaskItem = memo(TaskItemBase);
