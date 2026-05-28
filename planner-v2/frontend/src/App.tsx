import { useEffect, useRef, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Drawer } from "./components/Drawer";
import { Fab } from "./components/Fab";
import { AddSheet } from "./components/AddSheet";
import { Sheet } from "./components/Sheet";
import { ListView } from "./components/ListView";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { createTask, getMe } from "./api";
import type { ActiveList, Priority } from "./types";
import { applyTelegramTheme } from "./telegram";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [active, setActive] = useState<ActiveList>({ kind: "smart", key: "today", title: "Сегодня" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const touchX = useRef<number | null>(null);

  function bump() { setReloadKey((k) => k + 1); }

  useEffect(() => {
    applyTelegramTheme();
    getMe().then((m) => setName(m.first_name ?? "")).catch(() => {});
  }, []);

  async function add(title: string, prio: Priority) {
    const opts: { priority: Priority; project_id?: number; due_date?: string } = { priority: prio };
    if (active.kind === "project") opts.project_id = active.id;
    else if (active.kind === "smart" && active.key === "today") opts.due_date = new Date().toISOString().slice(0, 10);
    await createTask(title, opts);
    setAddOpen(false);
    bump();
  }

  function selectList(a: ActiveList) {
    setActive(a);
    setDrawerOpen(false);
    setTab("today");
    bump();
  }

  function onTabChange(k: TabKey) {
    setTab(k);
    if (k === "today") setActive({ kind: "smart", key: "today", title: "Сегодня" });
    if (k === "tasks") setActive({ kind: "smart", key: "all", title: "Все задачи" });
    if (k === "projects") setDrawerOpen(true);
  }

  const onTask = tab === "today" || tab === "tasks" || tab === "projects";

  let screen: React.ReactNode;
  if (tab === "calendar") screen = <Calendar />;
  else if (tab === "goals") screen = <Goals />;
  else screen = (
    <ListView active={active} reloadKey={reloadKey} onMenu={() => setDrawerOpen(true)} onInboxChange={bump} />
  );

  const showFab = onTask && !(active.kind === "smart" && active.key === "inbox");

  return (
    <div
      className="app"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const sx = touchX.current;
        touchX.current = null;
        if (sx !== null && sx < 30 && e.changedTouches[0].clientX - sx > 60) setDrawerOpen(true);
      }}
    >
      {screen}
      {showFab && <Fab onAdd={() => setAddOpen(true)} onAi={() => setAiOpen(true)} />}
      {drawerOpen && (
        <Drawer active={active} name={name} onSelect={selectList} onClose={() => setDrawerOpen(false)} />
      )}
      {addOpen && <AddSheet onClose={() => setAddOpen(false)} onAdd={add} />}
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
