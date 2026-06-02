import { useState } from "react";
import type { Reminder, ReminderInput } from "../types";
import { Sheet } from "./Sheet";
import { IcoCheck, IcoPlus } from "./icons";

// Мокап #4: несколько напоминаний на задачу. Multi-select (PATTERNS: тап=toggle, закрытие по «Готово»).
// relative-пресеты для timed; absolute (at_time) для all-day. «+ Своё смещение» снимает тупик.
const PRESETS: { min: number; label: string }[] = [
  { min: 0, label: "Вовремя" },
  { min: 5, label: "За 5 минут" },
  { min: 30, label: "За 30 минут" },
  { min: 60, label: "За 1 час" },
  { min: 1440, label: "За 1 день" },
  { min: 10080, label: "За 1 неделю" },
];

function offsetLabel(min: number): string {
  if (min === 0) return "Вовремя";
  if (min % 10080 === 0) return `За ${min / 10080} нед.`;
  if (min % 1440 === 0) return `За ${min / 1440} дн.`;
  if (min % 60 === 0) return `За ${min / 60} ч.`;
  return `За ${min} мин`;
}

export function RemindersSheet({
  initial, allDay = false, onApply, onClose,
}: { initial: Reminder[]; allDay?: boolean; onApply: (v: ReminderInput[]) => void; onClose: () => void }) {
  // relative-набор как множество смещений; absolute (all-day) — отдельное время.
  const [offsets, setOffsets] = useState<number[]>(
    () => initial.filter((r) => r.kind === "relative" && r.offset_minutes != null).map((r) => r.offset_minutes as number),
  );
  const [customMin, setCustomMin] = useState<string>("");
  const [showCustom, setShowCustom] = useState(false);
  const [atTime, setAtTime] = useState<string>(
    () => initial.find((r) => r.kind === "absolute")?.at_time?.slice(0, 5) ?? "09:00",
  );

  function toggle(min: number) {
    setOffsets((cur) => (cur.includes(min) ? cur.filter((x) => x !== min) : [...cur, min].sort((a, b) => a - b)));
  }
  function addCustom() {
    const v = Number(customMin);
    if (!Number.isFinite(v) || v < 0) return;
    if (!offsets.includes(v)) setOffsets((cur) => [...cur, v].sort((a, b) => a - b));
    setCustomMin("");
    setShowCustom(false);
  }

  function done() {
    const out: ReminderInput[] = allDay
      ? [{ kind: "absolute", at_time: atTime.length === 5 ? `${atTime}:00` : atTime }]
      : offsets.map((min) => ({ kind: "relative", offset_minutes: min }));
    onApply(out);
    onClose();
  }

  // пресеты + любые кастомные смещения, которых нет среди пресетов
  const extra = offsets.filter((m) => !PRESETS.some((p) => p.min === m));

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <span className="sheet-title">Напоминания</span>
        <button className="sheet-done" onClick={done}>Готово</button>
      </div>

      {allDay ? (
        <div className="dr-row" style={{ borderTop: "none" }}>
          <span>Время напоминания</span>
          <input type="time" className="dr-input" value={atTime}
            onChange={(e) => setAtTime(e.target.value || "09:00")} />
        </div>
      ) : (
        <>
          {PRESETS.map((p) => {
            const sel = offsets.includes(p.min);
            return (
              <button key={p.min} className={`opt-row ${sel ? "sel" : ""}`} onClick={() => toggle(p.min)}>
                <span className="opt-label">{p.label}</span>
                {sel && <span className="opt-check"><IcoCheck /></span>}
              </button>
            );
          })}
          {extra.map((m) => (
            <button key={m} className="opt-row sel" onClick={() => toggle(m)}>
              <span className="opt-label">{offsetLabel(m)}</span>
              <span className="opt-check"><IcoCheck /></span>
            </button>
          ))}

          {showCustom ? (
            <div className="end-detail">
              <input
                type="number" min={0} className="dr-input" autoFocus placeholder="минут"
                value={customMin} onChange={(e) => setCustomMin(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
                style={{ minWidth: 100 }}
              />
              <span className="muted">мин до срока</span>
              <button className="btn btn-ghost" onClick={addCustom} style={{ minHeight: 36 }}>Добавить</button>
            </div>
          ) : (
            <button className="add-row" onClick={() => setShowCustom(true)}>
              <span className="add-row-ico"><IcoPlus /></span>
              <span>Своё смещение…</span>
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
