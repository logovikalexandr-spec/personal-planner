import { useEffect, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
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
  const [viewing, setViewing] = useState<ActiveList | null>(null); // открытый список из Lists / Inbox из Today
  const [addOpen, setAddOpen] = useState(false);
  const [addHour, setAddHour] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [, setName] = useState("");

  function bump() { setReloadKey((k) => k + 1); }

  useEffect(() => {
    applyTelegramTheme();
    getMe().then((m) => setName(m.first_name ?? "")).catch(() => {});
    getCounts().then((c) => setInboxCount(c.inbox)).catch(() => {});
  }, [reloadKey]);

  function onTabChange(k: TabKey) {
    setTab(k);
    setViewing(null); // сброс открытого списка при смене таба
  }

  let screen: React.ReactNode;
  if (viewing) {
    screen = <ListView active={viewing} reloadKey={reloadKey} onMenu={() => setViewing(null)} onInboxChange={bump} />;
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
    <div className="app">
      {screen}
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
