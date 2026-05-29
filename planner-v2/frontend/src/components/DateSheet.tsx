import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";

export interface DateValue {
  due_date: string | null;
  due_time: string | null;
  end_time: string | null;
  reminder_at: string | null;
  recurrence: string | null;
}

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const REMINDERS: { key: string; label: string; min: number | null }[] = [
  { key: "none", label: "Нет", min: null },
  { key: "0", label: "Вовремя", min: 0 },
  { key: "5", label: "За 5 мин", min: 5 },
  { key: "30", label: "За 30 мин", min: 30 },
  { key: "60", label: "За 1 час", min: 60 },
  { key: "1440", label: "За 1 день", min: 1440 },
];
const RECUR: { key: string; label: string }[] = [
  { key: "", label: "Не повторять" },
  { key: "daily", label: "Ежедневно" },
  { key: "weekdays", label: "По будням" },
  { key: "weekly", label: "Еженедельно" },
  { key: "monthly", label: "Ежемесячно" },
  { key: "yearly", label: "Ежегодно" },
];
const DURATIONS = [
  { label: "15 мин", min: 15 }, { label: "30 мин", min: 30 },
  { label: "1 ч", min: 60 }, { label: "1.5 ч", min: 90 }, { label: "2 ч", min: 120 },
];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function addMin(time: string, min: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + min, 23 * 60 + 59); // clamp to same day, no overnight wrap
  return `${`${Math.floor(total / 60)}`.padStart(2, "0")}:${`${total % 60}`.padStart(2, "0")}:00`;
}
function nextMonday(): Date {
  const d = new Date();
  const delta = (8 - (d.getDay() || 7)) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export function DateSheet({ initial, onApply, onClose }: { initial: DateValue; onApply: (v: DateValue) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"date" | "dur">("date");
  const [dueDate, setDueDate] = useState<string | null>(initial.due_date);
  const [dueTime, setDueTime] = useState<string | null>(initial.due_time);
  const [endTime, setEndTime] = useState<string | null>(initial.end_time);
  const [reminderMin, setReminderMin] = useState<number | null>(() => {
    if (!initial.reminder_at || !initial.due_date) return null;
    const t = initial.due_time ?? "09:00:00";
    const due = new Date(`${initial.due_date}T${t.length === 5 ? t + ":00" : t}`);
    const diff = Math.round((due.getTime() - new Date(initial.reminder_at).getTime()) / 60000);
    return REMINDERS.some((r) => r.min === diff) ? diff : null;
  });
  const [recurrence, setRecurrence] = useState<string>(initial.recurrence ?? "");

  const today = new Date();
  const base = dueDate ? new Date(dueDate + "T00:00:00") : today;
  const [view, setView] = useState(() => ({ y: base.getFullYear(), m: base.getMonth() }));

  const weeks = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startDow = (first.getDay() || 7) - 1; // Mon=0
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [view]);

  function pickQuick(d: Date) {
    setDueDate(localISO(d));
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }
  function pickDay(day: number) {
    setDueDate(localISO(new Date(view.y, view.m, day)));
  }
  function setDuration(min: number) {
    if (!dueTime) return;
    setEndTime(addMin(dueTime, min));
  }

  function apply() {
    let reminder_at: string | null = null;
    if (reminderMin != null && dueDate) {
      const t = dueTime ?? "09:00:00";
      const dt = new Date(`${dueDate}T${t.length === 5 ? t + ":00" : t}`);
      dt.setMinutes(dt.getMinutes() - reminderMin);
      reminder_at = localISO(dt) + `T${`${dt.getHours()}`.padStart(2, "0")}:${`${dt.getMinutes()}`.padStart(2, "0")}:00`;
    }
    onApply({ due_date: dueDate, due_time: dueTime, end_time: endTime, reminder_at, recurrence: recurrence || null });
    onClose();
  }

  const todayISO = localISO(today);

  return (
    <Sheet onClose={onClose}>
      <div className="seg">
        <button className={tab === "date" ? "seg-on" : ""} onClick={() => setTab("date")}>Дата</button>
        <button className={tab === "dur" ? "seg-on" : ""} onClick={() => setTab("dur")}>Длительность</button>
      </div>

      {tab === "date" ? (
        <>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <button className="btn-chip" onClick={() => pickQuick(today)}>Сегодня</button>
            <button className="btn-chip" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); pickQuick(d); }}>Завтра</button>
            <button className="btn-chip" onClick={() => pickQuick(nextMonday())}>Следующий понедельник</button>
          </div>

          <div className="cal-mini-head">
            <button className="cal-nav" onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}>‹</button>
            <span style={{ flex: 1, textAlign: "center", fontWeight: 600, textTransform: "capitalize" }}>{MONTHS[view.m]} {view.y}</span>
            <button className="cal-nav" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))}>›</button>
          </div>
          <div className="cal-mini">
            {WD.map((w) => <div key={w} className="cal-mini-wd">{w}</div>)}
            {weeks.flat().map((d, i) => {
              if (d == null) return <div key={i} />;
              const iso = localISO(new Date(view.y, view.m, d));
              const sel = iso === dueDate;
              const isToday = iso === todayISO;
              return (
                <button key={i} className={`cal-mini-day ${sel ? "sel" : ""} ${isToday && !sel ? "today" : ""}`} onClick={() => pickDay(d)}>{d}</button>
              );
            })}
          </div>

          <div className="dr-row">
            <span>Срок исполнения</span>
            <input type="time" className="dr-input" value={dueTime ? dueTime.slice(0, 5) : ""}
              onChange={(e) => setDueTime(e.target.value ? e.target.value + ":00" : null)} />
          </div>
          <div className="dr-row">
            <span>Уведомление</span>
            <select className="dr-input" value={`${reminderMin ?? "none"}`}
              onChange={(e) => setReminderMin(e.target.value === "none" ? null : Number(e.target.value))}>
              {REMINDERS.map((r) => <option key={r.key} value={r.min == null ? "none" : `${r.min}`}>{r.label}</option>)}
            </select>
          </div>
          <div className="dr-row">
            <span>Повтор</span>
            <select className="dr-input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              {RECUR.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        </>
      ) : (
        <div>
          <div className="muted" style={{ marginBottom: 12 }}>
            {dueTime ? `Начало ${dueTime.slice(0, 5)}. Выбери длительность:` : "Сначала задай время начала на вкладке «Дата»."}
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {DURATIONS.map((d) => (
              <button key={d.min} className={endTime && dueTime && addMin(dueTime, d.min) === endTime ? "btn-chip active" : "btn-chip"}
                disabled={!dueTime} onClick={() => setDuration(d.min)}>{d.label}</button>
            ))}
          </div>
          {endTime && <div className="muted" style={{ marginTop: 12 }}>Конец: {endTime.slice(0, 5)}</div>}
        </div>
      )}

      <button className="btn btn-block" style={{ marginTop: 16 }} onClick={apply}>Готово</button>
    </Sheet>
  );
}
