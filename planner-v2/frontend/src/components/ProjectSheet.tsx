import { useRef, useState } from "react";
import type { Project } from "../types";
import { Sheet } from "./Sheet";
import { canHaveChild } from "../lib/projectTree";

// Берём последний эмодзи-графём из ввода (нативная клава может прислать строку).
// Intl.Segmenter корректно режет ZWJ/флаги; иначе фолбэк по кодпойнтам.
function lastEmoji(v: string): string | null {
  if (!v) return null;
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  const parts = Seg
    ? Array.from(new Seg().segment(v), (s) => (s as { segment: string }).segment)
    : Array.from(v);
  const last = parts[parts.length - 1]?.trim();
  return last || null;
}

// hex-allowlist: палитра выбора цвета проекта = данные (хранятся per-project в БД), не токены хрома. Не заменять на var().
const COLORS = ["#EE8A3C", "#E5564B", "#E0B341", "#4FB477", "#3C8EEE", "#9B6BE0", "#7C8794"];
const EMOJIS = ["🎯", "💚", "💪", "🏋️", "🧘", "💰", "🧊", "🏛️", "🕉️", "🧠", "🎭", "📚", "⭐", "📦", "🔥", "📌", "🚀", "🏠", "💡", "📅"];

export interface ProjectFormValue {
  name: string;
  parent_id: number | null;
  color: string | null;
  icon: string | null;
}

export function ProjectSheet({
  projects, mode, initial, defaultParentId, onClose, onSubmit,
}: {
  projects: Project[];
  mode: "create" | "edit";
  initial?: Project;
  defaultParentId?: number | null;
  onClose: () => void;
  onSubmit: (value: ProjectFormValue) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [parentId, setParentId] = useState<number | null>(initial?.parent_id ?? defaultParentId ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // edit can't set itself or its own descendants as parent
  const blocked = new Set<number>();
  if (initial) {
    blocked.add(initial.id);
    const stack = [initial.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const p of projects) if (p.parent_id === cur) { blocked.add(p.id); stack.push(p.id); }
    }
  }
  // лимит 3 уровня: родителем может быть только узел, у которого подпроект
  // останется в пределах листа (depth ≤ 2). Узел уже на лимите — не родитель.
  const parents = projects.filter(
    (p) => !p.is_inbox && !blocked.has(p.id) && canHaveChild(p.id, projects),
  );

  async function submit() {
    const t = name.trim();
    if (!t || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ name: t, parent_id: parentId, color, icon });
      // успех: родитель размонтирует sheet (setSheet(null))
    } catch {
      setErr("Не удалось сохранить. Попробуй ещё раз.");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="row" style={{ gap: "var(--s2)", alignItems: "center", position: "relative" }}>
        {/* Тап по иконке → нативная клавиатура (переключаешь на эмодзи) → любой символ */}
        <button
          type="button"
          className="proj-icon-btn"
          aria-label="Выбрать эмодзи"
          onClick={() => iconInputRef.current?.focus()}
        >
          {icon ?? "🗂️"}
        </button>
        <input
          ref={iconInputRef}
          className="proj-icon-input"
          aria-label="Свой эмодзи"
          value=""
          onChange={(e) => { const em = lastEmoji(e.target.value); if (em) setIcon(em); e.target.value = ""; }}
        />
        <input
          className="input"
          autoFocus
          placeholder="Название проекта..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ flex: 1 }}
        />
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Тапни иконку слева — любой эмодзи. Или выбери ниже:</div>

      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button
            key={e}
            className={`emoji-chip ${icon === e ? "active" : ""}`}
            onClick={() => setIcon(icon === e ? null : e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
        {COLORS.map((c) => (
          <button
            key={c}
            className="color-chip"
            aria-label={c}
            onClick={() => setColor(color === c ? null : c)}
            style={{ background: c, outline: color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
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

      {err && <div className="muted" style={{ color: "var(--danger)", fontSize: 14 }}>{err}</div>}
      <button className="btn btn-block" onClick={submit} disabled={saving}>
        {saving ? "Сохраняю…" : mode === "edit" ? "Сохранить" : "Создать"}
      </button>
    </Sheet>
  );
}
