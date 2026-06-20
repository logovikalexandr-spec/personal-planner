import { useRef, useState } from "react";
import { createCheckItem, deleteCheckItem, patchCheckItem } from "../api";
import type { CheckItem } from "../types";
import { IcoCheck, IcoPlus, IcoTrash } from "./icons";

// Мокап #1: чеклист с кольцом прогресса. Пункты двигают progress задачи (в отличие от сабтасков).
// Кольцо = тонкая SVG-дуга (slate-трек + ember-заполнение), без круглого спиннера (DESIGN §7).
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R; // ~94.2

function ProgressRing({ pct }: { pct: number }) {
  const offset = RING_C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg className="cl-ring" viewBox="0 0 36 36" width="34" height="34" aria-hidden>
      <circle cx="18" cy="18" r={RING_R} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
      <circle
        cx="18" cy="18" r={RING_R} fill="none" stroke="var(--accent)" strokeWidth="4"
        strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={offset}
        transform="rotate(-90 18 18)" style={{ transition: "stroke-dashoffset 200ms ease" }}
      />
    </svg>
  );
}

export function Checklist({
  taskId, items, onChange,
}: { taskId: number; items: CheckItem[]; onChange: (items: CheckItem[]) => void }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  async function toggle(it: CheckItem) {
    // оптимистично, откат при ошибке
    const next = items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x));
    onChange(next);
    try {
      const saved = await patchCheckItem(it.id, { done: !it.done });
      onChange(items.map((x) => (x.id === saved.id ? saved : (x.id === it.id ? { ...x, done: saved.done } : x))));
    } catch {
      onChange(items); // откат
    }
  }

  async function add() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const created = await createCheckItem(taskId, title);
      onChange([...items, created]);
      setDraft("");
      addRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function remove(it: CheckItem) {
    onChange(items.filter((x) => x.id !== it.id));
    try { await deleteCheckItem(it.id); } catch { /* список рефетчится у родителя */ }
  }

  return (
    <div className="cl">
      <div className="cl-head">
        <ProgressRing pct={pct} />
        <span className="cl-title">Чеклист</span>
        {total > 0 && <span className="cl-count mono">{done}/{total}</span>}
      </div>

      {items.map((it) => (
        <div key={it.id} className={`cl-item ${it.done ? "dn" : ""}`}>
          <button
            className={`cl-box ${it.done ? "on" : ""}`}
            onClick={() => toggle(it)}
            role="checkbox" aria-checked={it.done} aria-label={it.title}
          >
            {it.done && <IcoCheck />}
          </button>
          <span className="cl-txt">{it.title}</span>
          <button className="cl-del" onClick={() => remove(it)} aria-label="Удалить пункт"><IcoTrash /></button>
        </div>
      ))}

      <div className="cl-add">
        <span className="cl-add-ico"><IcoPlus /></span>
        <input
          ref={addRef}
          className="cl-add-input"
          placeholder="Добавить пункт"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          onBlur={add}
        />
        <button
          className="add-confirm-btn"
          aria-label="Сохранить пункт"
          disabled={!draft.trim() || busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={add}
        >
          <IcoCheck />
        </button>
      </div>
    </div>
  );
}
