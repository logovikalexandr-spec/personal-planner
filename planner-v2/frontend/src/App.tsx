import { useEffect, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Fab } from "./components/Fab";
import { AddSheet } from "./components/AddSheet";
import { Sheet } from "./components/Sheet";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { Inbox } from "./screens/Inbox";
import { Tasks } from "./screens/Tasks";
import { Today } from "./screens/Today";
import { createTask, getInbox } from "./api";
import type { Priority } from "./types";
import { applyTelegramTheme } from "./telegram";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [showInbox, setShowInbox] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  async function refreshInbox() {
    try {
      setInboxCount((await getInbox()).length);
    } catch {
      setInboxCount(0);
    }
  }
  useEffect(() => {
    applyTelegramTheme();
    refreshInbox();
  }, []);

  async function add(title: string, prio: Priority) {
    const opts: { priority: Priority; due_date?: string } = { priority: prio };
    if (tab === "today" && !showInbox) opts.due_date = new Date().toISOString().slice(0, 10);
    await createTask(title, opts);
    setAddOpen(false);
    setReloadKey((k) => k + 1);
    refreshInbox();
  }

  let screen: React.ReactNode;
  if (showInbox) screen = <Inbox onChange={() => { refreshInbox(); setReloadKey((k) => k + 1); }} />;
  else if (tab === "today") screen = <Today reloadKey={reloadKey} inboxCount={inboxCount} onInbox={() => setShowInbox(true)} />;
  else if (tab === "calendar") screen = <Calendar />;
  else if (tab === "tasks") screen = <Tasks reloadKey={reloadKey} />;
  else if (tab === "goals") screen = <Goals />;
  else screen = <div className="screen"><div className="screen-hero"><h1>Проекты</h1></div><div className="muted">Скоро.</div></div>;

  const showFab = !showInbox;

  return (
    <div className="app">
      {showInbox && (
        <div style={{ padding: "var(--s4) var(--s4) 0" }}>
          <button className="btn-ghost" style={{ background: "none", border: "none", fontSize: 16, padding: 0, cursor: "pointer" }} onClick={() => setShowInbox(false)}>
            {"‹ Назад"}
          </button>
        </div>
      )}
      {screen}
      {showFab && <Fab onAdd={() => setAddOpen(true)} onAi={() => setAiOpen(true)} />}
      {addOpen && <AddSheet onClose={() => setAddOpen(false)} onAdd={add} />}
      {aiOpen && (
        <Sheet onClose={() => setAiOpen(false)}>
          <h1 style={{ fontSize: 20 }}>AI-копайлот</h1>
          <div className="muted">Скоро: разговорный помощник со знанием всего планнера. Появится в следующей фазе.</div>
          <button className="btn btn-block" onClick={() => setAiOpen(false)}>Ок</button>
        </Sheet>
      )}
      <BottomTabs
        active={tab}
        onChange={(k) => { setShowInbox(false); setTab(k); }}
        inboxCount={inboxCount}
      />
    </div>
  );
}
