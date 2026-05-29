import { useState } from "react";
import type { Project } from "../types";
import { Sheet } from "./Sheet";

const COLORS = ["#EE8A3C", "#E5564B", "#E0B341", "#4FB477", "#3C8EEE", "#9B6BE0", "#7C8794"];

export function ProjectSheet({
  projects, defaultParentId, onClose, onCreate,
}: {
  projects: Project[];
  defaultParentId?: number | null;
  onClose: () => void;
  onCreate: (name: string, opts: { parent_id?: number | null; color?: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(defaultParentId ?? null);
  const [color, setColor] = useState<string | null>(null);

  const parents = projects.filter((p) => !p.is_inbox);

  function submit() {
    const t = name.trim();
    if (!t) return;
    onCreate(t, { parent_id: parentId, color });
  }

  return (
    <Sheet onClose={onClose}>
      <input
        className="input"
        autoFocus
        placeholder="Название проекта..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />

      <div className="row" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
        {COLORS.map((c) => (
          <button
            key={c}
            className="color-chip"
            aria-label={c}
            onClick={() => setColor(color === c ? null : c)}
            style={{
              background: c,
              outline: color === c ? "2px solid var(--text)" : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>

      <select
        className="input"
        value={parentId ?? ""}
        onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Без родителя</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <button className="btn btn-block" onClick={submit}>Создать</button>
    </Sheet>
  );
}
