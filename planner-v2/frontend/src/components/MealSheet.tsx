import { useState } from "react";
import { Sheet } from "./Sheet";
import { type NFood, type NMeal, type NMealCreate, nParseFood } from "../api";

/* Шторка добавления/правки приёма. AI-парс текста → префилл БЖУ, дальше правишь руками. */

type Draft = { name: string; kcal: string; protein: string; fat: string; carb: string; time: string };

function fromMeal(m: NMeal | null): Draft {
  return {
    name: m?.name ?? "",
    kcal: m ? String(m.kcal) : "",
    protein: m ? String(m.protein) : "",
    fat: m ? String(m.fat) : "",
    carb: m ? String(m.carb) : "",
    time: m?.time ? m.time.slice(0, 5) : "",
  };
}
const num = (s: string): number => {
  const n = Math.round(Number(s.replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function MealSheet({
  meal, onSave, onDelete, onClose,
}: {
  meal: NMeal | null;
  onSave: (body: NMealCreate) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const editing = meal !== null;
  const [d, setD] = useState<Draft>(() => fromMeal(meal));
  const [items, setItems] = useState<NFood[]>(meal?.items ?? []);
  const [ai, setAi] = useState("");
  const [busy, setBusy] = useState<"parse" | "save" | "del" | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const set = (k: keyof Draft) => (v: string) => setD((p) => ({ ...p, [k]: v }));

  async function estimate() {
    if (!ai.trim() || busy) return;
    setBusy("parse"); setHint(null);
    try {
      const r = await nParseFood(ai.trim());
      setD({
        name: r.name, kcal: String(r.kcal), protein: String(r.protein),
        fat: String(r.fat), carb: String(r.carb), time: d.time,
      });
      setItems(r.items ?? []);
      if (!r.estimated) setHint("AI-оценка недоступна — впиши БЖУ вручную.");
    } catch {
      setHint("Не удалось оценить. Впиши вручную.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!d.name.trim() || busy) return;
    setBusy("save");
    try {
      await onSave({
        name: d.name.trim(), kcal: num(d.kcal), protein: num(d.protein),
        fat: num(d.fat), carb: num(d.carb),
        time: d.time ? `${d.time}:00` : null, items, status: "done",
      });
      onClose();
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    if (!onDelete || busy) return;
    setBusy("del");
    try { await onDelete(); onClose(); } finally { setBusy(null); }
  }

  const numField = (k: keyof Draft, label: string, cls: string) => (
    <label className={"meal-num " + cls}>
      <span className="mn-label">{label}</span>
      <input className="mn-input mono" inputMode="numeric" placeholder="0"
        value={d[k]} onChange={(e) => set(k)(e.target.value.replace(/[^\d.,]/g, ""))} />
    </label>
  );

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <span className="sheet-title">{editing ? "Изменить приём" : "Добавить приём"}</span>
        <button className="sheet-done" onClick={save} disabled={!d.name.trim() || busy !== null}>
          {busy === "save" ? "…" : "Сохранить"}
        </button>
      </div>

      <div className="meal-ai">
        <textarea className="meal-ai-in" rows={2} value={ai} placeholder="Что съел? напр. 200 г курицы, рис, салат"
          onChange={(e) => setAi(e.target.value)} />
        <button className="meal-ai-btn" onClick={estimate} disabled={!ai.trim() || busy !== null}>
          {busy === "parse" ? "Оцениваю…" : "✨ Оценить"}
        </button>
      </div>
      {hint && <div className="meal-hint">{hint}</div>}

      <label className="meal-field">
        <span className="mf-label">Название</span>
        <input className="mf-input" value={d.name} placeholder="Приём пищи"
          onChange={(e) => set("name")(e.target.value)} />
      </label>

      <div className="meal-nums">
        {numField("kcal", "ккал", "k")}
        {numField("protein", "Б, г", "p")}
        {numField("carb", "У, г", "c")}
        {numField("fat", "Ж, г", "f")}
      </div>

      <label className="meal-field">
        <span className="mf-label">Время (необязательно)</span>
        <input type="time" className="mf-input" value={d.time}
          onChange={(e) => set("time")(e.target.value)} />
      </label>

      {items.length > 0 && (
        <div className="meal-items">
          {items.map((p, i) => (
            <div key={i} className="meal-item"><span>{p.n} · {p.q}</span><span className="mono">{p.k} ккал</span></div>
          ))}
        </div>
      )}

      {editing && onDelete && (
        <button className="meal-del" onClick={del} disabled={busy !== null}>
          {busy === "del" ? "Удаляю…" : "Удалить приём"}
        </button>
      )}
    </Sheet>
  );
}
