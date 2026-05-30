import { useEffect, useRef, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Drawer } from "./components/Drawer";
import { Fab } from "./components/Fab";
import { TaskComposer } from "./components/TaskComposer";
import { Sheet } from "./components/Sheet";
import { ListView } from "./components/ListView";
import { Today } from "./screens/Today";
import { Lists } from "./screens/Lists";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { Tracking } from "./screens/Tracking";
import { getCounts, getMe } from "./api";
import type { ActiveList } from "./types";
import { applyTelegramTheme } from "./telegram";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [viewing, setViewing] = useState<ActiveList | null>(null); // открытый список (из Lists, шторки или Inbox)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addHour, setAddHour] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [name, setName] = useState("");
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);

  function bump() { setReloadKey((k) => k + 1); }
  function openDrawer() { setDrawerClosing(false); setDrawerOpen(true); }
  function closeDrawer() {
    setDrawerClosing(true);
    window.setTimeout(() => { setDrawerOpen(false); setDrawerClosing(false); }, 220);
  }

  useEffect(() => {
    applyTelegramTheme();
    getMe().then((m) => setName(m.first_name ?? "")).catch(() => {});
  }, []);

  useEffect(() => {
    getCounts().then((c) => setInboxCount(c.inbox)).catch(() => {});
  }, [reloadKey]);

  function onTabChange(k: TabKey) {
    setTab(k);
    setViewing(null); // сброс открытого списка при смене таба
  }

  // выбор списка/проекта в шторке → открыть ListView, закрыть шторку
  function selectFromDrawer(a: ActiveList) {
    setViewing(a);
    closeDrawer();
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

  return (
    <div
      className="app"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const sx = touchX.current;
        const sy = touchY.current;
        touchX.current = null;
        touchY.current = null;
        if (sx === null || sy === null || drawerOpen || addOpen || aiOpen || addHour != null) return;
        // edge-swipe: только от левого края (<24px), чтобы не конфликтовать со скроллом «Сегодня»
        if (sx > 24) return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = Math.abs(e.changedTouches[0].clientY - sy);
        if (dx > 50 && dx > dy * 1.5) openDrawer();
      }}
    >
      {screen}
      {showFab && <Fab onAdd={() => setAddOpen(true)} onAi={() => setAiOpen(true)} />}
      {drawerOpen && (
        <Drawer
          active={viewing ?? { kind: "smart", key: "all", title: "Все" }}
          name={name}
          closing={drawerClosing}
          onSelect={selectFromDrawer}
          onClose={closeDrawer}
        />
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
    </div>
  );
}
