import { useState } from "react";
import type { RecurrenceBase, RecurrenceEndType, RecurrenceFreq, RecurrenceJson } from "../types";
import { Sheet } from "./Sheet";
import { IcoCheck } from "./icons";

// Мокап #3: пресеты + кастом. База: по плану / по выполнению / даты. Конец: никогда / дата / N раз.
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]; // 0=Пн..6=Вс (контракт §4)

type Preset = "none" | "daily" | "weekly" | "monthly" | "yearly";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "none", label: "Не повторять" },
  { key: "daily", label: "Каждый день" },
  { key: "weekly", label: "Каждую неделю" },
  { key: "monthly", label: "Каждый месяц" },
  { key: "yearly", label: "Каждый год" },
];
const UNIT: Record<RecurrenceFreq, string> = { daily: "дн.", weekly: "нед.", monthly: "мес.", yearly: "г." };

export function RecurrenceSheet({
  initial, onApply, onClose,
}: { initial: RecurrenceJson | null; onApply: (v: RecurrenceJson | null) => void; onClose: () => void }) {
  const [preset, setPreset] = useState<Preset>(initial ? initial.freq : "none");
  const [interval, setIntervalVal] = useState<number>(initial?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [base, setBase] = useState<RecurrenceBase>(initial?.base ?? "due");
  const [endType, setEndType] = useState<RecurrenceEndType>(initial?.end?.type ?? "never");
  const [endValue, setEndValue] = useState<string | number | null>(initial?.end?.value ?? null);

  const isCustom = preset !== "none";
  const freq = (preset === "none" ? "daily" : preset) as RecurrenceFreq;

  function choosePreset(p: Preset) {
    setPreset(p);
    if (p === "weekly" && weekdays.length === 0) {
      // дефолт — сегодняшний день недели (0=Пн..6=Вс)
      setWeekdays([(new Date().getDay() + 6) % 7]);
    }
  }
  function toggleWd(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  }

  function done() {
    if (preset === "none") { onApply(null); onClose(); return; }
    const rec: RecurrenceJson = {
      freq,
      interval: Math.max(1, interval),
      weekdays: freq === "weekly" ? (weekdays.length ? weekdays : [(new Date().getDay() + 6) % 7]) : null,
      monthday: null,
      base,
      specific_dates: null,
      end: {
        type: endType,
        value: endType === "date" ? (endValue as string | null) : endType === "count" ? Number(endValue ?? 1) : null,
      },
    };
    onApply(rec);
    onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <span className="sheet-title">Повтор</span>
        <button className="sheet-done" onClick={done}>Готово</button>
      </div>

      {PRESETS.map((p) => {
        const sel = preset === p.key;
        return (
          <button key={p.key} className={`opt-row ${sel ? "sel" : ""}`} onClick={() => choosePreset(p.key)}>
            <span className="opt-label">{p.label}</span>
            {sel && <span className="opt-check"><IcoCheck /></span>}
          </button>
        );
      })}

      {isCustom && (
        <>
          <div className="grp-label">Интервал</div>
          <div className="stepper-row">
            <span className="muted">Каждые</span>
            <button className="stepper-btn" onClick={() => setIntervalVal((v) => Math.max(1, v - 1))} aria-label="Меньше">−</button>
            <span className="stepper-val mono">{interval}</span>
            <button className="stepper-btn" onClick={() => setIntervalVal((v) => v + 1)} aria-label="Больше">+</button>
            <span className="muted">{UNIT[freq]}</span>
          </div>

          {freq === "weekly" && (
            <div className="wd-row">
              {WD.map((w, i) => (
                <button key={i} className={`wd-cell ${weekdays.includes(i) ? "on" : ""}`} onClick={() => toggleWd(i)}>{w}</button>
              ))}
            </div>
          )}

          <div className="grp-label">База повтора</div>
          <div className="seg seg-tight">
            <button className={base === "due" ? "seg-on" : ""} onClick={() => setBase("due")}>по плану</button>
            <button className={base === "completion" ? "seg-on" : ""} onClick={() => setBase("completion")}>по выполн.</button>
          </div>

          <div className="grp-label">Заканчивается</div>
          <button className={`opt-row ${endType === "never" ? "sel" : ""}`} onClick={() => setEndType("never")}>
            <span className="opt-label">Никогда</span>
            {endType === "never" && <span className="opt-check"><IcoCheck /></span>}
          </button>
          <button className={`opt-row ${endType === "date" ? "sel" : ""}`} onClick={() => setEndType("date")}>
            <span className="opt-label">В дату…</span>
            {endType === "date" && <span className="opt-check"><IcoCheck /></span>}
          </button>
          {endType === "date" && (
            <div className="end-detail">
              <input
                type="date" className="dr-input"
                value={typeof endValue === "string" ? endValue : ""}
                onChange={(e) => setEndValue(e.target.value || null)}
              />
            </div>
          )}
          <button className={`opt-row ${endType === "count" ? "sel" : ""}`} onClick={() => setEndType("count")}>
            <span className="opt-label">После N раз…</span>
            {endType === "count" && <span className="opt-check"><IcoCheck /></span>}
          </button>
          {endType === "count" && (
            <div className="end-detail">
              <input
                type="number" min={1} className="dr-input" style={{ minWidth: 90 }}
                value={typeof endValue === "number" ? endValue : 1}
                onChange={(e) => setEndValue(Math.max(1, Number(e.target.value) || 1))}
              />
              <span className="muted">раз</span>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
