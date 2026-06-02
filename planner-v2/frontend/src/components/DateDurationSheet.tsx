import { useMemo, useState } from "react";
import type { Reminder, ReminderInput, RecurrenceJson } from "../types";
import { Sheet } from "./Sheet";
import { RecurrenceSheet } from "./RecurrenceSheet";
import { RemindersSheet } from "./RemindersSheet";
import { IcoBell, IcoChevron, IcoClock, IcoRepeat } from "./icons";

// Мокап A: мини-календарь + сегмент дата/длительность + all-day тоггл + входы Повтор/Напоминание.
// Это Волна-2 версия пикера даты (TaskDetail). Эмитит due/end + recurrence_json + reminders единым apply.
export interface DateDurationValue {
  due_date: string | null;
  due_time: string | null;
  end_time: string | null;
  all_day: boolean;
  recurrence_json: RecurrenceJson | null;
  reminders: ReminderInput[];
}

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const DURATIONS = [
  { label: "15 мин", min: 15 }, { label: "30 мин", min: 30 },
  { label: "1 ч", min: 60 }, { label: "1.5 ч", min: 90 }, { label: "2 ч", min: 120 },
];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function addMin(time: string, min: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + min, 23 * 60 + 59);
  return `${`${Math.floor(total / 60)}`.padStart(2, "0")}:${`${total % 60}`.padStart(2, "0")}:00`;
}
function recurSummary(r: RecurrenceJson | null): string {
  if (!r) return "Нет";
  const u = { daily: "день", weekly: "неделю", monthly: "месяц", yearly: "год" }[r.freq];
  return r.interval > 1 ? `Каждые ${r.interval} · ${u}` : `Каждый ${u}`;
}
function remindersSummary(rems: ReminderInput[]): string {
  if (rems.length === 0) return "Нет";
  if (rems.length === 1) {
    const r = rems[0];
    if (r.kind === "absolute") return r.at_time?.slice(0, 5) ?? "Вкл";
    const m = r.offset_minutes ?? 0;
    if (m === 0) return "Вовремя";
    if (m % 1440 === 0) return `за ${m / 1440} дн.`;
    if (m % 60 === 0) return `за ${m / 60} ч.`;
    return `за ${m} мин`;
  }
  return `${rems.length} напом.`;
}

export function DateDurationSheet({
  initial, onApply, onClose,
}: { initial: DateDurationValue; onApply: (v: DateDurationValue) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"date" | "dur">("date");
  const [dueDate, setDueDate] = useState<string | null>(initial.due_date);
  const [dueTime, setDueTime] = useState<string | null>(initial.due_time);
  const [endTime, setEndTime] = useState<string | null>(initial.end_time);
  const [allDay, setAllDay] = useState<boolean>(initial.all_day);
  const [recurrence, setRecurrence] = useState<RecurrenceJson | null>(initial.recurrence_json);
  const [reminders, setReminders] = useState<ReminderInput[]>(initial.reminders);
  const [nested, setNested] = useState<"repeat" | "remind" | null>(null);

  const today = new Date();
  const base = dueDate ? new Date(dueDate + "T00:00:00") : today;
  const [view, setView] = useState(() => ({ y: base.getFullYear(), m: base.getMonth() }));

  const weeks = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startDow = (first.getDay() || 7) - 1;
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [view]);

  const todayISO = localISO(today);

  function pickDay(day: number) {
    setDueDate(localISO(new Date(view.y, view.m, day)));
  }
  function setDuration(min: number) {
    if (!dueTime) return;
    setEndTime(addMin(dueTime, min));
  }
  function toggleAllDay() {
    setAllDay((v) => {
      const next = !v;
      if (next) { setDueTime(null); setEndTime(null); }
      return next;
    });
  }

  function apply() {
    onApply({
      due_date: dueDate,
      due_time: allDay ? null : dueTime,
      end_time: allDay ? null : endTime,
      all_day: allDay,
      recurrence_json: recurrence,
      reminders,
    });
    onClose();
  }

  // существующие reminders как Reminder[] для инициализации вложенной шторки
  const remindersAsReminders: Reminder[] = reminders.map((r) => ({ ...r }));

  return (
    <>
      <Sheet onClose={onClose}>
        <div className="sheet-head">
          <span className="sheet-title">Дата и время</span>
          <button className="sheet-done" onClick={apply}>Готово</button>
        </div>

        <div className="seg">
          <button className={tab === "date" ? "seg-on" : ""} onClick={() => setTab("date")}>Дата</button>
          <button className={tab === "dur" ? "seg-on" : ""} onClick={() => setTab("dur")}>Длительность</button>
        </div>

        {tab === "date" ? (
          <>
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

            {!allDay && (
              <div className="dr-row">
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="dd-glyph"><IcoClock /></span>Время
                </span>
                <input type="time" className="dr-input" value={dueTime ? dueTime.slice(0, 5) : ""}
                  onChange={(e) => setDueTime(e.target.value ? e.target.value + ":00" : null)} />
              </div>
            )}

            <div className="dr-row">
              <span>Весь день</span>
              <button className={`toggle ${allDay ? "on" : "off"}`} onClick={toggleAllDay} role="switch" aria-checked={allDay} aria-label="Весь день" />
            </div>

            <button className="dd-entry" onClick={() => setNested("repeat")}>
              <span className="dd-glyph"><IcoRepeat /></span>
              <span className="dd-entry-label">Повтор</span>
              <span className={`dd-entry-val mono ${recurrence ? "active" : ""}`}>{recurSummary(recurrence)}</span>
              <span className="dd-entry-chev"><IcoChevron /></span>
            </button>
            <button className="dd-entry" onClick={() => setNested("remind")}>
              <span className="dd-glyph"><IcoBell /></span>
              <span className="dd-entry-label">Напоминание</span>
              <span className={`dd-entry-val mono ${reminders.length ? "active" : ""}`}>{remindersSummary(reminders)}</span>
              <span className="dd-entry-chev"><IcoChevron /></span>
            </button>
          </>
        ) : (
          <div>
            <div className="muted" style={{ marginBottom: 12 }}>
              {allDay ? "Длительность недоступна для задачи «весь день»."
                : dueTime ? `Начало ${dueTime.slice(0, 5)}. Выбери длительность:`
                : "Сначала задай время начала на вкладке «Дата»."}
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {DURATIONS.map((d) => (
                <button key={d.min}
                  className={endTime && dueTime && addMin(dueTime, d.min) === endTime ? "btn-chip active" : "btn-chip"}
                  disabled={!dueTime || allDay} onClick={() => setDuration(d.min)}>{d.label}</button>
              ))}
            </div>
            {endTime && !allDay && <div className="muted" style={{ marginTop: 12 }}>Конец: {endTime.slice(0, 5)}</div>}
          </div>
        )}
      </Sheet>

      {nested === "repeat" && (
        <RecurrenceSheet initial={recurrence} onApply={setRecurrence} onClose={() => setNested(null)} />
      )}
      {nested === "remind" && (
        <RemindersSheet initial={remindersAsReminders} allDay={allDay} onApply={setReminders} onClose={() => setNested(null)} />
      )}
    </>
  );
}
