import { useEffect, useRef, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Fab } from "./components/Fab";
import { TaskComposer } from "./components/TaskComposer";
import { Sheet } from "./components/Sheet";
import { ListView } from "./components/ListView";
import { Drawer } from "./components/Drawer";
import { Today } from "./screens/Today";
import { Lists } from "./screens/Lists";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { Tracking } from "./screens/Tracking";
import { getCounts, getMe } from "./api";
import type { ActiveList } from "./types";
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
  const [addHour, setAddHour] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [userName, setUserName] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);

  function bump() { setReloadKey((k) => k + 1); }

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
  const anyOverlay = addOpen || addHour != null || aiOpen || drawerOpen;
  const edgeSwipeOff = anyOverlay || tab === "lists";
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
    screen = <ListView active={viewing} reloadKey={reloadKey} onMenu={openDrawer} onInboxChange={bump} />;
  } else if (tab === "today") {
    screen = (
      <Today
        reloadKey={reloadKey}
        inboxCount={inboxCount}
        onInbox={() => setViewing({ kind: "smart", key: "inbox", title: "Входящие" })}
        onTapHour={(h) => setAddHour(h)}
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
      {showFab && <Fab onAdd={() => setAddOpen(true)} onAi={() => setAiOpen(true)} />}
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
    </div>
  );
}
