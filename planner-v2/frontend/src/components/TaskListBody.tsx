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
  const [doneOpen, setDoneOpen] = useState(false);        // секция «Выполнено» свёрнута по умолчанию
  const [cancelledOpen, setCancelledOpen] = useState(false);

  // Открытые → в группы/список; закрытые (done/wont_do, за 7 дней) → в секции внизу списка.
  const openTasks = useMemo(() => tasks.filter((t) => t.status === "todo" || t.status === "in_progress"), [tasks]);
  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === "done").sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    [tasks],
  );
  const cancelledTasks = useMemo(
    () => tasks.filter((t) => t.status === "wont_do").sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    [tasks],
  );

  // Группы ТОЛЬКО из открытых. Порядок групп = КАК В ШТОРКЕ (древо-порядок); «без проекта» — в конец.
  // Внутри группы: приоритет ↓, дата ↑, время ↑.
  const groups = useMemo(() => {
    if (!groupByProjectMap) return null;
    const gs = groupByProject(openTasks, groupByProjectMap);
    gs.forEach((g) => g.tasks.sort(cmpSmartTask));
    // ранг проекта по тому же обходу дерева, что рисует шторка (общий источник)
    const rank = projectRankMap(groupByProjectMap);
    return gs.sort((a, b) => {
      if (!a.project) return 1;            // «Без проекта» — всегда в конец
      if (!b.project) return -1;
      return (rank.get(a.project.id) ?? 1e9) - (rank.get(b.project.id) ?? 1e9);
    });
  }, [openTasks, groupByProjectMap]);

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
        <div className="list">{openTasks.map(renderTask)}</div>
      )}

      {/* секции внизу: закрытые за 7 дней (done/wont_do), сворачиваемые */}
      {doneTasks.length > 0 && (
        <div className="closed-sec">
          <button className={`closed-head ${doneOpen ? "open" : ""}`} onClick={() => setDoneOpen((v) => !v)}>
            <span className="ch-chev"><IcoChevron /></span>
            <span className="ch-name">Выполнено</span>
            <span className="ch-cnt mono">{doneTasks.length}</span>
          </button>
          {doneOpen && (<>
            <div className="closed-note">за последние 7 дней</div>
            <div className="list">{doneTasks.map(renderTask)}</div>
          </>)}
        </div>
      )}
      {cancelledTasks.length > 0 && (
        <div className="closed-sec">
          <button className={`closed-head ${cancelledOpen ? "open" : ""}`} onClick={() => setCancelledOpen((v) => !v)}>
            <span className="ch-chev"><IcoChevron /></span>
            <span className="ch-name">Отменено</span>
            <span className="ch-cnt mono">{cancelledTasks.length}</span>
          </button>
          {cancelledOpen && (<>
            <div className="closed-note">за последние 7 дней</div>
            <div className="list">{cancelledTasks.map(renderTask)}</div>
          </>)}
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
