import { useCallback, useMemo, useState } from "react";
import { TaskItem } from "./TaskItem";
import { BatchBar } from "./BatchBar";
import { IcoChevron } from "./icons";
import { groupByProject } from "../lib/groupByProject";
import { cmpSmartTask, projectRankMap } from "../lib/taskSort";
import type { Project, Task } from "../types";

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
  // Группировка по проектам (смарт-списки: Все/Сегодня/Завтра/7дней). Внутри проекта не нужна.
  groupByProjectMap?: Map<number, Project>;
}

export function TaskListBody({
  tasks, colorOf, onOpen, onToggle,
  onComplete, onDate, onMove, onDelete, onPriority, groupByProjectMap,
}: TaskListBodyProps) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number | "none">>(new Set());

  // ВСЕ задачи (вкл. done/wont_do) рендерятся в группах: выполненная остаётся на своём
  // месте зачёркнутой (как на таймлайне), не уезжает в отдельную секцию. Клик по чекбоксу
  // тогглит обратно. Отдельной секции «Выполнено» нет.
  // Порядок групп = КАК В ШТОРКЕ (древо-порядок: pinned → order_index → name, родитель
  // перед детьми); «без проекта» — в конец. Внутри группы: приоритет ↓, дата ↑, время ↑.
  const groups = useMemo(() => {
    if (!groupByProjectMap) return null;
    const gs = groupByProject(tasks, groupByProjectMap);
    gs.forEach((g) => g.tasks.sort(cmpSmartTask));
    // ранг проекта по тому же обходу дерева, что рисует шторка (общий источник)
    const rank = projectRankMap(groupByProjectMap);
    return gs.sort((a, b) => {
      if (!a.project) return 1;            // «Без проекта» — всегда в конец
      if (!b.project) return -1;
      return (rank.get(a.project.id) ?? 1e9) - (rank.get(b.project.id) ?? 1e9);
    });
  }, [tasks, groupByProjectMap]);

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
  const toggleGroup = useCallback((key: number | "none") => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  // единый рендер строки задачи (и в плоском списке, и в группах)
  const renderTask = (t: Task) => (
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
  );
  function selectAll() {
    setSelected(new Set(tasks.map((t) => t.id)));
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

      {groups ? (
        groups.map((g) => {
          const key: number | "none" = g.project?.id ?? "none";
          const collapsed = collapsedGroups.has(key);
          return (
            <div key={key} className="proj-group">
              <button className="group-head" onClick={() => toggleGroup(key)}>
                {g.project?.icon && <span className="gh-emo">{g.project.icon}</span>}
                <span className="gh-name">{g.project?.name ?? "Без проекта"}</span>
                {g.project?.color && <span className="gh-dot" style={{ background: g.project.color }} />}
                <span className="gh-cnt mono">{g.tasks.length}</span>
                <span className={`gh-chev ${collapsed ? "" : "open"}`}><IcoChevron /></span>
              </button>
              {!collapsed && <div className="list">{g.tasks.map(renderTask)}</div>}
            </div>
          );
        })
      ) : (
        <div className="list">{tasks.map(renderTask)}</div>
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
