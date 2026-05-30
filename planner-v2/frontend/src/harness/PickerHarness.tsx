import { useState } from "react";
import { ProjectPickerSheet } from "../components/pickers";
import type { Project } from "../types";

// Dev-harness для behavior-proof picker'а БЕЗ сети и tg-auth.
// Открывается по URL: ?harness=picker. tg() вне Telegram возвращает undefined — безопасно.

type StateKey = "empty" | "loading" | "error" | "loaded" | "deep";

const STATES: { key: StateKey; label: string }[] = [
  { key: "empty", label: "Пусто" },
  { key: "loading", label: "Загрузка" },
  { key: "error", label: "Ошибка" },
  { key: "loaded", label: "Выбор" },
  { key: "deep", label: "Глубина" },
];

function mk(id: number, name: string, parent_id: number | null, icon: string | null, extra: Partial<Project> = {}): Project {
  return {
    id, name, slug: `p${id}`, is_inbox: false, parent_id, open_count: 0,
    color: null, icon, pinned: false, order_index: id, ...extra,
  };
}

// плоский набор (decision A: всегда-развёрнуто), включает субкатегории
const LOADED: Project[] = [
  mk(1, "Работа", null, "💼"),
  mk(2, "Маркетинг", 1, "📣"),
  mk(3, "Лендинг новый", 2, "🚀"),
  mk(10, "Личное", null, "🏠"),
  mk(11, "Здоровье", 10, "💪"),
  mk(20, "Проект с очень длинным именем которое точно не влезет в одну строку и должно обрезаться", null, "📚"),
];

// край: глубина > 2, проверка clamp отступа
const DEEP: Project[] = [
  mk(1, "Уровень 0", null, "🧊"),
  mk(2, "Уровень 1", 1, "🧊"),
  mk(3, "Уровень 2", 2, "🧊"),
  mk(4, "Уровень 3 (clamp)", 3, "🧊"),
  mk(5, "Уровень 4 (clamp)", 4, "🧊"),
];

export function PickerHarness() {
  const [state, setState] = useState<StateKey>("loaded");
  const [value, setValue] = useState<number | null>(null);
  // key пересоздаёт picker при смене состояния, сбрасывая внутренний «picked»
  const [seq, setSeq] = useState(0);

  const projects =
    state === "empty" ? [] :
    state === "deep" ? DEEP :
    LOADED;
  const loading = state === "loading";
  const error = state === "error";

  function pickState(k: StateKey) { setState(k); setSeq((s) => s + 1); }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Picker harness</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        ?harness=picker — мок-данные, без сети. Выбрано: {value == null ? "Входящие" : `#${value}`}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {STATES.map((s) => (
          <button
            key={s.key}
            className={state === s.key ? "btn-chip active" : "btn-chip"}
            onClick={() => pickState(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ProjectPickerSheet
        key={`${state}-${seq}`}
        projects={projects}
        loading={loading}
        error={error}
        value={value}
        onPick={setValue}
        onProjectsChange={() => { /* в harness список локально не мутируем после create */ }}
        onRetry={() => pickState("loaded")}
        onClose={() => { /* в harness не закрываем — пересобираем для повторного прогона */ setSeq((s) => s + 1); }}
      />
    </div>
  );
}
