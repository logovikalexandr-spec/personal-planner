import { useEffect, useState } from "react";
import { createTag, getTags } from "../api";
import type { Priority, Project, Tag } from "../types";
import { Sheet } from "./Sheet";

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: "#E5564B",
  medium: "#E0B341",
  low: "#3C8EEE",
  none: "#7C8794",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Высокий приоритет",
  medium: "Средний приоритет",
  low: "Низкий приоритет",
  none: "Без приоритета",
};

export function Flag({ color, filled = true }: { color: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" fill={filled ? color : "none"} />
    </svg>
  );
}

export function PriorityPicker({ value, onPick, onClose }: { value: Priority; onPick: (p: Priority) => void; onClose: () => void }) {
  const order: Priority[] = ["high", "medium", "low", "none"];
  return (
    <Sheet onClose={onClose}>
      {order.map((p) => (
        <button
          key={p}
          className="menu-item"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
          onClick={() => { onPick(p); onClose(); }}
        >
          <Flag color={PRIORITY_COLOR[p]} filled={p !== "none"} />
          <span style={{ flex: 1, textAlign: "left" }}>{PRIORITY_LABEL[p]}</span>
          {value === p && <span style={{ color: "var(--accent)" }}>✓</span>}
        </button>
      ))}
    </Sheet>
  );
}

export function ProjectPickerSheet({
  projects, value, onPick, onClose,
}: { projects: Project[]; value: number | null; onPick: (id: number | null) => void; onClose: () => void }) {
  const byParent = new Map<number | null, Project[]>();
  for (const p of projects) {
    if (p.is_inbox) continue;
    const k = p.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(p);
  }
  const rows: { p: Project; depth: number }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const p of byParent.get(parent) ?? []) { rows.push({ p, depth }); walk(p.id, depth + 1); }
  };
  walk(null, 0);

  return (
    <Sheet onClose={onClose}>
      <div className="menu-head"><span style={{ fontWeight: 600 }}>Проект</span></div>
      <button className="menu-item" style={{ display: "flex", gap: 12 }} onClick={() => { onPick(null); onClose(); }}>
        <span className="drawer-ico">📥</span>
        <span style={{ flex: 1, textAlign: "left" }}>Входящие</span>
        {value == null && <span style={{ color: "var(--accent)" }}>✓</span>}
      </button>
      {rows.map(({ p, depth }) => (
        <button
          key={p.id}
          className="menu-item"
          style={{ display: "flex", gap: 12, paddingLeft: 16 + depth * 20 }}
          onClick={() => { onPick(p.id); onClose(); }}
        >
          <span>{p.icon ?? "•"}</span>
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          {value === p.id && <span style={{ color: "var(--accent)" }}>✓</span>}
        </button>
      ))}
    </Sheet>
  );
}

export function TagPickerSheet({
  value, onChange, onClose,
}: { value: number[]; onChange: (ids: number[]) => void; onClose: () => void }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => { getTags().then(setTags).catch(() => setTags([])); }, []);

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  async function add() {
    const name = draft.trim();
    if (!name) return;
    const t = await createTag(name);
    setDraft("");
    setTags((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
    if (!value.includes(t.id)) onChange([...value, t.id]);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="menu-head"><span style={{ fontWeight: 600 }}>Теги</span></div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" placeholder="Новый тег..." value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <button className="btn" onClick={add}>+</button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {tags.map((t) => (
          <button key={t.id} className={value.includes(t.id) ? "btn-chip active" : "btn-chip"} onClick={() => toggle(t.id)}>
            #{t.name}
          </button>
        ))}
        {tags.length === 0 && <span className="muted">Тегов пока нет</span>}
      </div>
      <button className="btn btn-block" style={{ marginTop: 16 }} onClick={onClose}>Готово</button>
    </Sheet>
  );
}
