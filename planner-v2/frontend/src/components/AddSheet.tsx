import { useState } from "react";
import type { Priority } from "../types";
import { Sheet } from "./Sheet";

const PRIOS: { key: Priority; label: string }[] = [
  { key: "high", label: "Высокий" },
  { key: "medium", label: "Средний" },
  { key: "low", label: "Низкий" },
  { key: "none", label: "Без" },
];

export function AddSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (title: string, p: Priority) => void }) {
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState<Priority>("none");
  function submit() {
    const t = title.trim();
    if (!t) return;
    onAdd(t, prio);
  }
  return (
    <Sheet onClose={onClose}>
      <input
        className="input"
        autoFocus
        placeholder="Новая задача..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
        {PRIOS.map((p) => (
          <button key={p.key} className={prio === p.key ? "btn-chip active" : "btn-chip"} onClick={() => setPrio(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <button className="btn btn-block" onClick={submit}>Добавить</button>
    </Sheet>
  );
}
