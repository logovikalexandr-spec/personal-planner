import { useEffect, useRef, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Drawer } from "./components/Drawer";
import { Fab } from "./components/Fab";
import { TaskComposer } from "./components/TaskComposer";
import { Sheet } from "./components/Sheet";
import { ListView } from "./components/ListView";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { getMe } from "./api";
import type { ActiveList } from "./types";
import { applyTelegramTheme } from "./telegram";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [active, setActive] = useState<ActiveList>({ kind: "smart", key: "today", title: "Сегодня" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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

  function selectList(a: ActiveList) {
    setActive(a);
    setTab("today");
    bump();
    closeDrawer();
  }

  function onTabChange(k: TabKey) {
    setTab(k);
    if (k === "today") setActive({ kind: "smart", key: "today", title: "Сегодня" });
    if (k === "tasks") setActive({ kind: "smart", key: "all", title: "Все задачи" });
    if (k === "projects") openDrawer();
  }

  const onTask = tab === "today" || tab === "tasks" || tab === "projects";

  let screen: React.ReactNode;
  if (tab === "calendar") screen = <Calendar />;
  else if (tab === "goals") screen = <Goals />;
  else screen = (
    <ListView active={active} reloadKey={reloadKey} onMenu={openDrawer} onInboxChange={bump} />
  );

  const showFab = onTask && !(active.kind === "smart" && active.key === "inbox");

  return (
    <div
      className="app"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const sx = touchX.current;
        const sy = touchY.current;
        touchX.current = null;
        touchY.current = null;
        if (sx === null || sy === null || drawerOpen || addOpen || aiOpen) return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = Math.abs(e.changedTouches[0].clientY - sy);
        // свайп вправо откуда угодно по экрану, явно горизонтальный
        if (dx > 60 && dx > dy * 1.5) openDrawer();
      }}
    >
      {screen}
      {showFab && <Fab onAdd={() => setAddOpen(true)} onAi={() => setAiOpen(true)} />}
      {drawerOpen && (
        <Drawer active={active} name={name} closing={drawerClosing} onSelect={selectList} onClose={closeDrawer} />
      )}
      {addOpen && (
        <TaskComposer
          defaultProjectId={active.kind === "project" ? active.id : null}
          initialDate={active.kind === "smart" && active.key === "today" ? localToday() : null}
          onClose={() => setAddOpen(false)}
          onSaved={bump}
        />
      )}
      {aiOpen && (
        <Sheet onClose={() => setAiOpen(false)}>
          <h1 style={{ fontSize: 20 }}>AI-копайлот</h1>
          <div className="muted">Скоро: разговорный помощник со знанием всего планнера.</div>
          <button className="btn btn-block" onClick={() => setAiOpen(false)}>Ок</button>
        </Sheet>
      )}
      <BottomTabs active={tab} onChange={onTabChange} inboxCount={0} />
    </div>
  );
}
