import { useEffect, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { Inbox } from "./screens/Inbox";
import { Tasks } from "./screens/Tasks";
import { Today } from "./screens/Today";
import { getInbox } from "./api";
import { applyTelegramTheme } from "./telegram";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [showInbox, setShowInbox] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

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

  let screen: React.ReactNode;
  if (showInbox) screen = <Inbox onChange={refreshInbox} />;
  else if (tab === "today") screen = <Today onInbox={() => setShowInbox(true)} />;
  else if (tab === "calendar") screen = <Calendar />;
  else if (tab === "tasks") screen = <Tasks />;
  else if (tab === "goals") screen = <Goals />;
  else screen = <div className="screen"><h1>Проекты</h1><div className="muted">Скоро.</div></div>;

  return (
    <div className="app">
      {showInbox && (
        <div className="screen" style={{ paddingBottom: 0 }}>
          <button className="btn-ghost" onClick={() => setShowInbox(false)}>{"< Назад"}</button>
        </div>
      )}
      {screen}
      <BottomTabs
        active={tab}
        onChange={(k) => {
          setShowInbox(false);
          setTab(k);
        }}
        inboxCount={inboxCount}
      />
    </div>
  );
}
