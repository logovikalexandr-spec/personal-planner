import { useState } from "react";
import { Sheet } from "./Sheet";
import { type NTarget } from "../api";

/* Шторка редактирования дневной цели БЖУ/ккал. */

type Draft = { kcal: string; protein: string; fat: string; carb: string };
const num = (s: string): number => {
  const n = Math.round(Number(s.replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function TargetSheet({
  target, onSave, onClose,
}: { target: NTarget; onSave: (t: NTarget) => Promise<void> | void; onClose: () => void }) {
  const [d, setD] = useState<Draft>({
    kcal: target.kcal ? String(target.kcal) : "",
    protein: target.protein ? String(target.protein) : "",
    fat: target.fat ? String(target.fat) : "",
    carb: target.carb ? String(target.carb) : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setD((p) => ({ ...p, [k]: v.replace(/[^\d.,]/g, "") }));

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({ kcal: num(d.kcal), protein: num(d.protein), fat: num(d.fat), carb: num(d.carb) });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof Draft, label: string, cls: string) => (
    <label className={"meal-num " + cls}>
      <span className="mn-label">{label}</span>
      <input className="mn-input mono" inputMode="numeric" placeholder="0"
        value={d[k]} onChange={(e) => set(k)(e.target.value)} />
    </label>
  );

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <span className="sheet-title">Дневная цель</span>
        <button className="sheet-done" onClick={save} disabled={busy}>{busy ? "…" : "Сохранить"}</button>
      </div>
      <div className="meal-hint" style={{ marginTop: 4 }}>Сколько ккал и БЖУ хочешь набирать за день.</div>
      <div className="meal-nums">
        {field("kcal", "ккал", "k")}
        {field("protein", "Б, г", "p")}
        {field("carb", "У, г", "c")}
        {field("fat", "Ж, г", "f")}
      </div>
    </Sheet>
  );
}
