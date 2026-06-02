import { useCallback, useEffect, useRef, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Fab } from "./components/Fab";
import { TaskComposer } from "./components/TaskComposer";
import { TaskDetail } from "./components/TaskDetail";
import { QuickAddBar } from "./components/QuickAddBar";
import { Sheet } from "./components/Sheet";
import { ListView } from "./components/ListView";
import { Drawer } from "./components/Drawer";
import { Today } from "./screens/Today";
import { Lists } from "./screens/Lists";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
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
  const [viewing, setViewing] = useState<ActiveList | null>(null); // открытый список из Lists / Inbox из Today
  const [addOpen, setAddOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [addHour, setAddHour] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [userName, setUserName] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null); // открытая TaskDetail (Волна 2)

  function bump() { setReloadKey((k) => k + 1); }

  // Волна 2: быстрый ввод из QuickAddBar — резолвим имя проекта/тегов в id, создаём задачу.
  async function quickAdd(p: ParseResult) {
    const title = (p.title || p.source).trim();
    if (!title) return;
    let project_id: number | null = null;
    if (p.projectName) {
      const ps = await getProjects().catch(() => []);
      const m = ps.find((x) => x.name.toLowerCase() === p.projectName!.toLowerCase());
      project_id = m ? m.id : null;
    }
    let tag_ids: number[] | undefined;
    if (p.tagNames.length) {
      const existing = await getTags().catch(() => []);
      const ids: number[] = [];
      for (const name of p.tagNames) {
        const hit = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (hit) ids.push(hit.id);
        else { const created = await createTag(name).catch(() => null); if (created) ids.push(created.id); }
      }
      tag_ids = ids.length ? ids : undefined;
    }
    await createTask(title, {
      due_date: p.due_date ?? null,
      due_time: p.due_time ?? null,
      priority: p.priority ?? "none",
      project_id,
      tag_ids,
    });
    bump();
  }

  // Перф: стабильные колбэки — чтобы memo(TaskItem)/экраны не ре-рендерились от каждого рендера App.
  const openTask = useCallback((t: Task) => setOpenTaskId(t.id), []);
  const openTaskById = useCallback((id: number) => setOpenTaskId(id), []);
  const tapHour = useCallback((h: number) => setAddHour(h), []);
  const openInbox = useCallback(() => setViewing({ kind: "smart", key: "inbox", title: "Входящие" }), []);

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
    getMe().then((m) => setUserName(m.first_name ?? "")).catch(() => {});
  }, []);

  function onTabChange(k: TabKey) {
    setTab(k);
    setViewing(null); // сброс открытого списка при смене таба
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
  const anyOverlay = addOpen || quickOpen || addHour != null || aiOpen || drawerOpen || openTaskId != null;
  const edgeSwipeOff = anyOverlay || (tab === "lists" && !viewing);
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

  let screen: React.ReactNode;
  if (viewing) {
    screen = <ListView active={viewing} reloadKey={reloadKey} onMenu={openDrawer} onInboxChange={bump} onOpenTask={openTask} />;
  } else if (tab === "today") {
    screen = (
      <Today
        reloadKey={reloadKey}
        inboxCount={inboxCount}
        onInbox={openInbox}
        onTapHour={tapHour}
        onOpenTask={openTask}
      />
    );
  } else if (tab === "calendar") {
    screen = <Calendar />;
  } else if (tab === "lists") {
    screen = <Lists active={{ kind: "smart", key: "all", title: "Все" }} onSelect={setViewing} />;
  } else if (tab === "goals") {
    screen = <Goals />;
  } else {
    screen = <Tracking />;
  }

  const showFab = (tab === "today" || tab === "lists" || tab === "calendar") && !viewing;

  const drawerActive: ActiveList = viewing ?? { kind: "smart", key: "all", title: "Все" };

  return (
    <div className="app" onTouchStart={onRootTouchStart} onTouchEnd={onRootTouchEnd}>
      {screen}
      {drawerOpen && (
        <Drawer
          active={drawerActive}
          name={userName}
          closing={drawerClosing}
          onSelect={selectFromDrawer}
          onClose={closeDrawer}
        />
      )}
      {showFab && <Fab onAdd={() => setQuickOpen(true)} onAi={() => setAiOpen(true)} />}
      {quickOpen && (
        <>
          <div className="qa-scrim" onClick={() => setQuickOpen(false)} />
          <div className="qa-overlay">
            <div className="qa-overlay-head">
              <span className="t">Быстрая задача</span>
              <button className="qa-expand" onClick={() => { setQuickOpen(false); setAddOpen(true); }}>Развернуть</button>
            </div>
            <QuickAddBar autoFocus onAdd={(p) => { quickAdd(p); }} />
          </div>
        </>
      )}
      {addOpen && (
        <TaskComposer
          initialDate={tab === "today" ? localToday() : null}
          onClose={() => setAddOpen(false)}
          onSaved={bump}
        />
      )}
      {addHour != null && (
        <TaskComposer
          initialDate={localToday()}
          initialTime={`${`${addHour}`.padStart(2, "0")}:00:00`}
          initialEnd={`${`${Math.min(addHour + 1, 23)}`.padStart(2, "0")}:00:00`}
          onClose={() => setAddHour(null)}
          onSaved={() => { setAddHour(null); bump(); }}
        />
      )}
      {aiOpen && (
        <Sheet onClose={() => setAiOpen(false)}>
          <h1 style={{ fontSize: 20 }}>AI-копайлот</h1>
          <div className="muted">Скоро: разговорный помощник со знанием всего планнера.</div>
          <button className="btn btn-block" onClick={() => setAiOpen(false)}>Ок</button>
        </Sheet>
      )}
      <BottomTabs active={tab} onChange={onTabChange} inboxCount={inboxCount} />
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
