import { useCallback, useMemo, useState } from "react";
import { TaskItem } from "./TaskItem";
import { BatchBar } from "./BatchBar";
import { IcoChevron } from "./icons";
import type { Task } from "../types";

// Волна 2 F2 — общий рендер списка задач: свайпы + long-press multi-select + batch-панель
// + свёрнутая секция «Выполнено и Won't Do». ОДНО поведение везде (PATTERNS):
// ListView и Tasks делегируют сюда, чтобы строка/выбор/секция вели себя одинаково.
//
// Колбэки действий принимают task[] (для batch — выбранные; для свайпа — одна).
// Родитель отвечает за фактический patch/refetch; здесь только UI-состояние выбора + сворачивание.

export interface TaskListBodyProps {
  tasks: Task[];
  colorOf?: (t: Task) => string | null;
  onOpen?: (t: Task) => void;
  onToggle: (t: Task) => void; // обычный тап по чекбоксу (todo<->done)
  // действия (одна задача — свайп; набор — batch). Если не переданы, слот/кнопка скрыты.
  onComplete?: (tasks: Task[]) => void;
  onDate?: (tasks: Task[]) => void;
  onMove?: (tasks: Task[]) => void;
  onDelete?: (tasks: Task[]) => void;
  onPriority?: (tasks: Task[]) => void;
}

export function TaskListBody({
  tasks, colorOf, onOpen, onToggle,
  onComplete, onDate, onMove, onDelete, onPriority,
}: TaskListBodyProps) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [closedOpen, setClosedOpen] = useState(false); // секция «Выполнено и Won't Do»

  const open = useMemo(() => tasks.filter((t) => t.status !== "done" && t.status !== "wont_do"), [tasks]);
  const closed = useMemo(() => tasks.filter((t) => t.status === "done" || t.status === "wont_do"), [tasks]);

  const selectedTasks = useMemo(() => tasks.filter((t) => selected.has(t.id)), [tasks, selected]);

  // Перф: стабильные колбэки строки — иначе memo(TaskItem) не сработает (новые ф-ии каждый рендер).
  const enterSelect = useCallback((t: Task) => {
    setSelectMode(true);
    setSelected(new Set([t.id]));
  }, []);
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  const toggleSelect = useCallback((t: Task) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
      return next;
    });
  }, []);
  const swipeComplete = useCallback((t: Task) => onComplete?.([t]), [onComplete]);
  const swipeDate = useCallback((t: Task) => onDate?.([t]), [onDate]);
  const swipeMove = useCallback((t: Task) => onMove?.([t]), [onMove]);
  const swipeDelete = useCallback((t: Task) => onDelete?.([t]), [onDelete]);
  function selectAll() {
    setSelected(new Set(open.map((t) => t.id)));
  }

  // batch-обёртка: вызвать действие над выбранными, затем выйти из режима.
  function runBatch(fn?: (ts: Task[]) => void) {
    if (!fn || selectedTasks.length === 0) return;
    fn(selectedTasks);
    exitSelect();
  }

  return (
    <>
      {selectMode && (
        <div className="select-head">
          <button className="select-x" onClick={exitSelect} aria-label="Отменить выбор">Отмена</button>
          <span className="select-n">Выбрано: {selected.size}</span>
          <button className="select-all" onClick={selectAll}>Выбрать всё</button>
        </div>
      )}

      <div className="list">
        {open.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            onToggle={onToggle}
            onOpen={onOpen}
            color={colorOf?.(t)}
            selectMode={selectMode}
            selected={selected.has(t.id)}
            onLongPress={enterSelect}
            onSelectToggle={toggleSelect}
            onSwipeComplete={onComplete ? swipeComplete : undefined}
            onSwipeDate={onDate ? swipeDate : undefined}
            onSwipeMove={onMove ? swipeMove : undefined}
            onSwipeDelete={onDelete ? swipeDelete : undefined}
          />
        ))}
      </div>

      {closed.length > 0 && (
        <div className="closed-section">
          <button className="closed-head" onClick={() => setClosedOpen((v) => !v)}>
            <span className={`closed-chev ${closedOpen ? "open" : ""}`}><IcoChevron /></span>
            <span>Выполнено и Won't Do</span>
            <span className="closed-count mono">· {closed.length}</span>
          </button>
          {closedOpen && (
            <div className="list" style={{ marginTop: 8 }}>
              {closed.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  color={colorOf?.(t)}
                  selectMode={selectMode}
                  selected={selected.has(t.id)}
                  onSelectToggle={toggleSelect}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selectMode && (
        <BatchBar
          count={selected.size}
          onDate={() => runBatch(onDate)}
          onMove={() => runBatch(onMove)}
          onPriority={() => runBatch(onPriority)}
          onComplete={() => runBatch(onComplete)}
          onDelete={() => runBatch(onDelete)}
        />
      )}
    </>
  );
}
