import { useEffect, useState } from "react";
import { getCounts, getProjects } from "../api";
import type { ActiveList, Counts, Project, SmartKey } from "../types";

const SMART: { key: SmartKey; title: string; ico: string }[] = [
  { key: "all", title: "Все", ico: "—" },
  { key: "today", title: "Сегодня", ico: "•" },
  { key: "tomorrow", title: "Завтра", ico: "»" },
  { key: "next7", title: "Следующие 7 дней", ico: "7" },
  { key: "inbox", title: "Входящие", ico: "In" },
  { key: "week", title: "План на неделю", ico: "≋" },
];

function countFor(k: SmartKey, c: Counts | null): number {
  if (!c) return 0;
  if (k === "all") return c.all;
  if (k === "today") return c.today;
  if (k === "tomorrow") return c.tomorrow;
  if (k === "next7" || k === "week") return c.next7;
  if (k === "inbox") return c.inbox;
  return 0;
}

function subtreeCount(p: Project, byParent: Map<number | null, Project[]>): number {
  let n = p.open_count;
  for (const ch of byParent.get(p.id) ?? []) n += subtreeCount(ch, byParent);
  return n;
}

export function Drawer({
  active, name, onSelect, onClose,
}: { active: ActiveList; name: string; onSelect: (a: ActiveList) => void; onClose: () => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    getCounts().then(setCounts).catch(() => setCounts(null));
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const byParent = new Map<number | null, Project[]>();
  for (const p of projects) {
    if (p.is_inbox) continue;
    const k = p.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(p);
  }

  function toggle(id: number) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function isActiveSmart(k: SmartKey) {
    return active.kind === "smart" && active.key === k;
  }
  function isActiveProject(id: number) {
    return active.kind === "project" && active.id === id;
  }

  function renderProject(p: Project, depth: number) {
    const children = byParent.get(p.id) ?? [];
    const cnt = subtreeCount(p, byParent);
    return (
      <div key={p.id}>
        <div
          className={`drawer-row ${isActiveProject(p.id) ? "active" : ""} ${depth > 0 ? "tree-child" : ""}`}
          onClick={() => onSelect({ kind: "project", id: p.id, title: p.name })}
        >
          <span className="drawer-ico">#</span>
          <span className="drawer-label">{p.name}</span>
          {cnt > 0 && <span className="drawer-count">{cnt}</span>}
          {children.length > 0 && (
            <span className="drawer-exp" onClick={(e) => { e.stopPropagation(); toggle(p.id); }}>
              {expanded.has(p.id) ? "▾" : "▸"}
            </span>
          )}
        </div>
        {expanded.has(p.id) && children.map((c) => renderProject(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-avatar">{(name || "A").slice(0, 1).toUpperCase()}</div>
          <div className="drawer-label" style={{ fontWeight: 600 }}>{name || "Planner"}</div>
        </div>
        {SMART.map((s) => (
          <div
            key={s.key}
            className={`drawer-row ${isActiveSmart(s.key) ? "active" : ""}`}
            onClick={() => onSelect({ kind: "smart", key: s.key, title: s.title })}
          >
            <span className="drawer-ico">{s.ico}</span>
            <span className="drawer-label">{s.title}</span>
            {countFor(s.key, counts) > 0 && <span className="drawer-count">{countFor(s.key, counts)}</span>}
          </div>
        ))}
        <div className="drawer-sep" />
        {(byParent.get(null) ?? []).map((p) => renderProject(p, 0))}
      </div>
    </div>
  );
}
