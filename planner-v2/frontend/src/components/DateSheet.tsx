import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { getDensity } from "../api";
import { durationLabel, pickCalendarDay } from "../lib/datetime";

export interface DateValue {
  due_date: string | null;
  due_time: string | null;
  end_date: string | null;
  end_time: string | null;
  reminder_at: string | null;
  recurrence: string | null;
}

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

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

function localISO(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function fmtPillDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function DateSheet({ initial, onApply, onClose }: { initial: DateValue; onApply: (v: DateValue) => void; onClose: () => void }) {
  const [dueDate, setDueDate] = useState<string | null>(initial.due_date);
  const [endDate, setEndDate] = useState<string | null>(initial.end_date);
  const [dueTime, setDueTime] = useState<string | null>(initial.due_time);
  const [endTime, setEndTime] = useState<string | null>(initial.end_time);
  // «весь день» по умолчанию = только когда задача уже многодневная без времени
  const [allDay, setAllDay] = useState<boolean>(
    !!initial.end_date && initial.end_date !== initial.due_date && !initial.due_time && !initial.end_time,
  );
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

  // Heat-нагрузка дней видимого месяца (g/y/r по числу задач) — как в мини-календаре.
  const [heat, setHeat] = useState<Record<string, "g" | "y" | "r">>({});
  useEffect(() => {
    let alive = true;
    const from = localISO(new Date(view.y, view.m, 1));
    const to = localISO(new Date(view.y, view.m + 1, 0));
    getDensity(from, to).then((d) => { if (alive) setHeat(d); }).catch(() => {});
    return () => { alive = false; };
  }, [view.y, view.m]);

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

  function pickDay(day: number) {
    const iso = localISO(new Date(view.y, view.m, day));
    const next = pickCalendarDay({ due_date: dueDate, end_date: endDate }, iso);
    setDueDate(next.due_date);
    setEndDate(next.end_date);
  }

  function toggleAllDay() {
    setAllDay((on) => {
      if (!on) { setDueTime(null); setEndTime(null); } // включаем → время убираем
      return !on;
    });
  }

  function apply() {
    let reminder_at: string | null = null;
    if (reminderMin != null && dueDate) {
      const t = allDay ? "09:00:00" : (dueTime ?? "09:00:00");
      const dt = new Date(`${dueDate}T${t.length === 5 ? t + ":00" : t}`);
      dt.setMinutes(dt.getMinutes() - reminderMin);
      reminder_at = localISO(dt) + `T${`${dt.getHours()}`.padStart(2, "0")}:${`${dt.getMinutes()}`.padStart(2, "0")}:00`;
    }
    onApply({
      due_date: dueDate,
      due_time: allDay ? null : dueTime,
      end_date: endDate,
      end_time: allDay ? null : endTime,
      reminder_at,
      recurrence: recurrence || null,
    });
    onClose();
  }

  const todayISO = localISO(today);
  const deadlineISO = endDate ?? dueDate;
  const dur = durationLabel({ due_date: dueDate, due_time: dueTime, end_date: endDate, end_time: endTime });

  return (
    <Sheet onClose={onClose}>
      <div className="allday">
        <span className="allday-lbl">Весь день</span>
        <button className={`sw ${allDay ? "on" : ""}`} data-testid="allday-toggle" onClick={toggleAllDay} aria-pressed={allDay} />
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
          const isStart = iso === dueDate;
          const isEnd = !!endDate && iso === endDate;
          const isSpan = !!dueDate && !!endDate && iso > dueDate && iso < endDate;
          const isToday = iso === todayISO;
          const h = heat[iso];
          const cls = [
            "cal-mini-day",
            h ? `heat-${h}` : "",
            isStart ? "start" : "",
            isEnd ? "end" : "",
            isSpan ? "span" : "",
            isToday && !isStart && !isEnd ? "today" : "",
          ].filter(Boolean).join(" ");
          return <button key={i} className={cls} onClick={() => pickDay(d)}>{d}</button>;
        })}
      </div>

      <div className="dt-row" data-testid="dt-start">
        <span className="dt-ic">▶</span>
        <span className="dt-k">Начало</span>
        <span className="dt-v">
          <span className={`pill ${dueDate ? "accent" : "empty"}`}>{dueDate ? fmtPillDate(dueDate) : "дата"}</span>
          {!allDay && (
            <input type="time" className="pill pill-time" value={dueTime ? dueTime.slice(0, 5) : ""}
              onChange={(e) => setDueTime(e.target.value ? e.target.value + ":00" : null)} />
          )}
        </span>
      </div>
      <div className="dt-row" data-testid="dt-end">
        <span className="dt-ic">■</span>
        <span className="dt-k">Дедлайн</span>
        <span className="dt-v">
          <span className={`pill ${deadlineISO ? "" : "empty"}`}>{deadlineISO ? fmtPillDate(deadlineISO) : "дата"}</span>
          {!allDay && (
            <input type="time" className="pill pill-time" value={endTime ? endTime.slice(0, 5) : ""}
              onChange={(e) => setEndTime(e.target.value ? e.target.value + ":00" : null)} />
          )}
        </span>
      </div>
      {dur && <div className="dur" data-testid="dur-label">длительность: {dur}</div>}

      <div className="dr-row">
        <span>Напоминание</span>
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

      <button className="btn btn-block" style={{ marginTop: 16 }} onClick={apply}>Готово</button>
    </Sheet>
  );
}
