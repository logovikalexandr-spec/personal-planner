import { useEffect, useState } from "react";
import { getCounts, getProjects } from "../api";
import {
  IcoAll, IcoDot, IcoInbox, IcoNext7, IcoTodaySmall, IcoTomorrow, IcoWeekPlan,
} from "./icons";
import type { ActiveList, Counts, Project, SmartKey } from "../types";

const SMART: { key: SmartKey; title: string; Ico: () => JSX.Element }[] = [
  { key: "all", title: "Все", Ico: IcoAll },
  { key: "today", title: "Сегодня", Ico: IcoTodaySmall },
  { key: "tomorrow", title: "Завтра", Ico: IcoTomorrow },
  { key: "next7", title: "Следующие 7 дней", Ico: IcoNext7 },
  { key: "inbox", title: "Входящие", Ico: IcoInbox },
  { key: "week", title: "План на неделю", Ico: IcoWeekPlan },
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
  active, name, closing, onSelect, onClose,
}: { active: ActiveList; name: string; closing?: boolean; onSelect: (a: ActiveList) => void; onClose: () => void }) {
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
  const roots = byParent.get(null) ?? [];

  function toggle(id: number) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const isActiveSmart = (k: SmartKey) => active.kind === "smart" && active.key === k;
  const isActiveProject = (id: number) => active.kind === "project" && active.id === id;

  function renderProject(p: Project, depth: number) {
    const children = byParent.get(p.id) ?? [];
    const cnt = subtreeCount(p, byParent);
    return (
      <div key={p.id}>
        <div
          className={`drawer-row ${isActiveProject(p.id) ? "active" : ""} ${depth > 0 ? "tree-child" : ""}`}
          onClick={() => onSelect({ kind: "project", id: p.id, title: p.name })}
        >
          <span className="drawer-ico"><IcoDot /></span>
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
    <div className={`drawer-backdrop ${closing ? "closing" : ""}`} onClick={onClose}>
      <div className={`drawer ${closing ? "closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-avatar">{(name || "A").slice(0, 1).toUpperCase()}</div>
          <div className="drawer-label" style={{ fontWeight: 600, fontSize: 17 }}>{name || "Planner"}</div>
        </div>

        <div className="drawer-section">Списки</div>
        {SMART.map(({ key, title, Ico }) => (
          <div
            key={key}
            className={`drawer-row ${isActiveSmart(key) ? "active" : ""}`}
            onClick={() => onSelect({ kind: "smart", key, title })}
          >
            <span className="drawer-ico"><Ico /></span>
            <span className="drawer-label">{title}</span>
            {countFor(key, counts) > 0 && <span className="drawer-count">{countFor(key, counts)}</span>}
          </div>
        ))}

        {roots.length > 0 && (
          <>
            <div className="drawer-sep" />
            <div className="drawer-section">Проекты</div>
            {roots.map((p) => renderProject(p, 0))}
          </>
        )}
      </div>
    </div>
  );
}
