import { useEffect, useState } from "react";
import { Empty } from "../components/Empty";
import { getInbox, getProjects, triageInbox } from "../api";
import type { InboxItem, Project } from "../types";

export function Inbox({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"all" | "manual" | "session">("all");

  async function load() {
    const [i, p] = await Promise.all([getInbox(), getProjects()]);
    setItems(i);
    setProjects(p);
  }
  useEffect(() => {
    load();
  }, []);

  const shown = items.filter((i) => filter === "all" || i.source === filter);

  async function triage(item: InboxItem, projectId: number) {
    const title = item.raw_content || "(без названия)";
    await triageInbox(item.id, projectId, title);
    await load();
    onChange();
  }

  return (
    <div className="screen">
      <h1>Inbox</h1>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        {(["all", "manual", "session"] as const).map((f) => (
          <button
            key={f}
            className={filter === f ? "btn-chip active" : "btn-chip"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Все" : f === "manual" ? "Мои" : "Из сессий"}
          </button>
        ))}
      </div>
      {shown.length === 0 && <Empty text="Inbox пуст. Кидай мысли боту в Telegram." />}
      <div className="list">
        {shown.map((it) => (
          <div key={it.id} className="card">
            <div style={{ marginBottom: 8 }}>{it.raw_content || `(${it.kind})`}</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {it.source === "session" ? "из сессий" : "мои"} - {it.kind}
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {projects
                .filter((p) => !p.is_inbox)
                .map((p) => (
                  <button key={p.id} className="btn-chip" onClick={() => triage(it, p.id)}>
                    {p.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
