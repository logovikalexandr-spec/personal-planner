import { useCallback, useEffect, useRef, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Fab } from "./components/Fab";
import { TaskDetail } from "./components/TaskDetail";
import { QuickAddBar, type QuickManual } from "./components/QuickAddBar";
import { ListView } from "./components/ListView";
import { Drawer } from "./components/Drawer";
import { Today } from "./screens/Today";
import { Gantt } from "./screens/Gantt";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { useBottomAnchor } from "./lib/viewportAnchor";
import { Tracking } from "./screens/Tracking";
import { createTag, createTask, getCounts, getMe, getProjects, getTags } from "./api";
import type { ActiveList, Task } from "./types";
import type { ParseResult } from "./lib/quickParse";
import { applyTelegramTheme } from "./telegram";
import { PickerHarness } from "./harness/PickerHarness";

// dev behavior-proof: ?harness=picker рендерит harness вместо App (без сети/tg-auth)
const HARNESS = typeof location !== "undefined" && location.search.includes("harness=picker");

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export default function App() {
  if (HARNESS) return <PickerHarness />;
  return <AppMain />;
}

function AppMain() {
  const [tab, setTab] = useState<TabKey>("today");
  // Перф: keep-alive экранов — таб монтируется при первом визите и остаётся (show/hide),
  // переключение = без remount/refetch dnd-дерева. mount платится один раз, не каждый switch.
  const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set<TabKey>(["today"]));
  const [viewing, setViewing] = useState<ActiveList | null>(null); // открытый список из Lists / Inbox из Today
  const [quickOpen, setQuickOpen] = useState(false);
  const [qaText, setQaText] = useState(""); // текст quick-add (контролируемо)
  const [todayView, setTodayView] = useState<"timeline" | "tasks">("timeline"); // вид внутри таба «Сегодня»
  const [reloadKey, setReloadKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null); // открытая TaskDetail (Волна 2)
  // тап дня в Календаре («Дни») → перейти на таб «Задачи» с этой датой. nonce = повторный тап той же даты.
  const [gotoDay, setGotoDay] = useState<{ iso: string; n: number } | null>(null);

  function bump() { setReloadKey((k) => k + 1); }

  // Волна 2: быстрый ввод из QuickAddBar — резолвим имя проекта/тегов в id, создаём задачу.
  async function quickAdd(p: ParseResult, manual?: QuickManual) {
    const title = (p.title || p.source).trim();
    if (!title) return;
    // проект: выбранный чипом перекрывает распознанный из текста по имени
    let project_id: number | null = manual?.projectId ?? null;
    if (project_id == null && p.projectName) {
      const ps = await getProjects().catch(() => []);
      const m = ps.find((x) => x.name.toLowerCase() === p.projectName!.toLowerCase());
      project_id = m ? m.id : null;
    }
    // теги: выбранные чипом (id) + распознанные из текста (по имени, find-or-create)
    const idSet = new Set<number>(manual?.tagIds ?? []);
    if (p.tagNames.length) {
      const existing = await getTags().catch(() => []);
      for (const name of p.tagNames) {
        const hit = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (hit) idSet.add(hit.id);
        else { const created = await createTag(name).catch(() => null); if (created) idSet.add(created.id); }
      }
    }
    const tag_ids = idSet.size ? [...idSet] : undefined;
    // дата/приоритет: выбранное чипом перекрывает распознанное из текста
    const d = manual?.date;
    await createTask(title, {
      due_date: d?.due_date ?? p.due_date ?? null,
      due_time: d?.due_time ?? p.due_time ?? null,
      end_date: d?.end_date ?? null,
      end_time: d?.end_time ?? null,
      reminder_at: d?.reminder_at ?? null,
      recurrence: d?.recurrence ?? null,
      priority: manual?.priority ?? p.priority ?? "none",
      project_id,
      tag_ids,
    });
    bump();
  }

  // Перф: стабильные колбэки — чтобы memo(TaskItem)/экраны не ре-рендерились от каждого рендера App.
  const openTask = useCallback((t: Task) => setOpenTaskId(t.id), []);
  const openTaskById = useCallback((id: number) => setOpenTaskId(id), []);
  const openInbox = useCallback(() => setViewing({ kind: "smart", key: "inbox", title: "Входящие" }), []);
  // Календарь «Дни»: тап дня → таб «Задачи» (timeline) на эту дату.
  const openDayInTasks = useCallback((iso: string) => {
    setGotoDay((p) => ({ iso, n: (p?.n ?? 0) + 1 }));
    setTodayView("timeline");
    setViewing(null);
    setTab("today");
    setMountedTabs((prev) => (prev.has("today") ? prev : new Set(prev).add("today")));
  }, []);

  function openDrawer() { setDrawerClosing(false); setDrawerOpen(true); }
  function closeDrawer() {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerOpen(false); setDrawerClosing(false); }, 220);
  }

  useEffect(() => {
    applyTelegramTheme();
    getCounts().then((c) => setInboxCount(c.inbox)).catch(() => {});
  }, [reloadKey]);

  useEffect(() => {
    getMe().catch(() => {}); // валидация сессии (имя в шапке шторки убрано)
  }, []);

  function onTabChange(k: TabKey) {
    setTab(k);
    setViewing(null); // сброс открытого списка при смене таба
    setMountedTabs((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  }

  // выбор списка/проекта из Drawer: сменить активный список (Drawer закроется через onAfterSelect)
  function selectFromDrawer(a: ActiveList) {
    const same =
      viewing &&
      ((a.kind === "smart" && viewing.kind === "smart" && a.key === viewing.key) ||
        (a.kind === "project" && viewing.kind === "project" && a.id === viewing.id));
    if (!same) setViewing(a); // тот же = просто закрыть (no-op перезагрузки), закрытие делает Drawer
  }

  // edge-swipe Drawer: старт у ЛЕВОГО края (<=20px), |dx|>|dy|*1.5;
  // выкл при открытых Sheet/composer/picker/viewing-sheet, на табе lists (дубль), во время drag (в Drawer).
  const esx = useRef<number | null>(null);
  const esy = useRef<number | null>(null);
  // quick-add-оверлей прижимаем к низу видимого вьюпорта (тот же iOS-fixed-баг, что и бар «Готово»)
  const qaRef = useRef<HTMLDivElement>(null);
  useBottomAnchor(qaRef, quickOpen);

  const anyOverlay = quickOpen || drawerOpen || openTaskId != null;
  const edgeSwipeOff = anyOverlay || (tab === "gantt" && !viewing);

  // Блокируем скролл фона при открытом оверлее.
  // Оверлеи с autoFocus-инпутом (composer/деталь) → position:fixed на body (фикс «экран улетает»
  // при фокусе инпута). Шторка (без инпута) → ЛЁГКИЙ lock overflow:hidden БЕЗ сдвига: position:fixed
  // на body в iOS standalone сбивает fixed-оверлеи (шторка/бэкдроп позиционируются от сдвинутого body)
  // → снизу чёрный провал ≈scrollY + навбар фона уезжает вверх.
  useEffect(() => {
    if (!anyOverlay) return;
    const b = document.body.style;
    const inputOverlay = quickOpen || openTaskId != null;
    if (inputOverlay) {
      const y = window.scrollY;
      b.position = "fixed"; b.top = `-${y}px`; b.left = "0"; b.right = "0"; b.width = "100%";
      return () => {
        b.position = ""; b.top = ""; b.left = ""; b.right = ""; b.width = "";
        window.scrollTo(0, y);
      };
    }
    const prevOverflow = b.overflow;
    b.overflow = "hidden";
    return () => { b.overflow = prevOverflow; };
  }, [anyOverlay, quickOpen, openTaskId]);
  function onRootTouchStart(e: React.TouchEvent) {
    if (edgeSwipeOff) { esx.current = null; esy.current = null; return; }
    const t = e.touches[0];
    if (t.clientX <= 20) { esx.current = t.clientX; esy.current = t.clientY; }
    else { esx.current = null; esy.current = null; }
  }
  function onRootTouchEnd(e: React.TouchEvent) {
    const x = esx.current, y = esy.current;
    esx.current = null; esy.current = null;
    if (x === null || y === null || edgeSwipeOff) return;
    const dx = e.changedTouches[0].clientX - x;
    const dy = Math.abs(e.changedTouches[0].clientY - y);
    if (dx > 50 && Math.abs(dx) > dy * 1.5) openDrawer();
  }

  // keep-alive: все посещённые табы остаются смонтированными, неактивные скрыты (hidden=display:none).
  // Открытый список (viewing) показывается поверх — табы при этом скрыты, но НЕ размонтированы.
  const tabHidden = (k: TabKey) => !!viewing || tab !== k;
  const tabScreens = (
    <>
      <div className="screen-host" hidden={tabHidden("today")}>
        {mountedTabs.has("today") && (
          <Today
            reloadKey={reloadKey}
            hidden={tabHidden("today")}
            onOpenTask={openTask}
            view={todayView}
            onViewChange={setTodayView}
            onOpenInbox={openInbox}
            onQuickAdd={quickAdd}
            inboxCount={inboxCount}
            onOpenDrawer={openDrawer}
            gotoDay={gotoDay}
          />
        )}
      </div>
      <div className="screen-host" hidden={tabHidden("calendar")}>
        {mountedTabs.has("calendar") && <Calendar onOpenDay={openDayInTasks} />}
      </div>
      <div className="screen-host" hidden={tabHidden("gantt")}>
        {mountedTabs.has("gantt") && <Gantt />}
      </div>
      <div className="screen-host" hidden={tabHidden("goals")}>
        {mountedTabs.has("goals") && <Goals />}
      </div>
      <div className="screen-host" hidden={tabHidden("tracking")}>
        {mountedTabs.has("tracking") && <Tracking />}
      </div>
    </>
  );

  const showFab = (tab === "today" || tab === "calendar") && !viewing;

  const drawerActive: ActiveList = viewing ?? { kind: "smart", key: "all", title: "Все" };

  return (
    <div className="app" onTouchStart={onRootTouchStart} onTouchEnd={onRootTouchEnd}>
      {viewing && (
        <ListView active={viewing} reloadKey={reloadKey} onMenu={openDrawer} onInboxChange={bump} onOpenTask={openTask} />
      )}
      {tabScreens}
      {drawerOpen && (
        <Drawer
          active={drawerActive}
          closing={drawerClosing}
          onSelect={selectFromDrawer}
          onClose={closeDrawer}
        />
      )}
      {showFab && (
        <Fab
          onAdd={() => { setQaText(""); setQuickOpen(true); }}
          secondary={
            tab === "today" && todayView === "timeline"
              ? { label: "Список", onClick: () => setTodayView("tasks") }
              : undefined
          }
        />
      )}
      {quickOpen && (
        <>
          <div className="qa-scrim" onClick={() => setQuickOpen(false)} />
          <div className="qa-overlay" ref={qaRef}>
            <div className="qa-overlay-head">
              <span className="t">Быстрая задача</span>
            </div>
            <QuickAddBar value={qaText} onChange={setQaText} onAdd={(p, manual) => { quickAdd(p, manual); setQuickOpen(false); }} />
          </div>
        </>
      )}
      <BottomTabs active={tab} onChange={onTabChange} />
      {openTaskId != null && (
        <div className="detail-overlay">
          <TaskDetail
            taskId={openTaskId}
            onClose={() => setOpenTaskId(null)}
            onChanged={bump}
            onOpenTask={openTaskById}
          />
        </div>
      )}
    </div>
  );
}
